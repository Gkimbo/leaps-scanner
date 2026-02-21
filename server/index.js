/**
 * LEAPS Scanner Backend Server
 *
 * Provides fast options data fetching via Polygon.io and Yahoo Finance.
 * Features:
 * - Rate limiting (respects Polygon 5 calls/min)
 * - Server-side caching (30 min TTL)
 * - Automatic fallback between providers
 *
 * Endpoints:
 * - GET /api/health - Health check + stats
 * - GET /api/options/:ticker - Get options chain for ticker
 * - POST /api/options/batch - Batch fetch options for multiple tickers
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fetchYahooOptions } from './services/yahoo.js';
import { fetchPolygonOptions } from './services/polygon.js';
import { optionsCache } from './services/cache.js';
import { polygonRateLimiter } from './services/rateLimiter.js';

const app = express();
const PORT = process.env.PORT || 3001;
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || process.env.VITE_POLYGON_API_KEY;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

/**
 * Health check endpoint with stats
 */
app.get('/api/health', (req, res) => {
  const rateLimitStatus = polygonRateLimiter.getStatus();
  const cacheStats = optionsCache.getStats();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    providers: {
      polygon: POLYGON_API_KEY ? 'configured' : 'not configured',
      yahoo: 'available (fallback)'
    },
    rateLimit: {
      available: rateLimitStatus.available,
      maxPerMinute: rateLimitStatus.maxCalls,
      waitTimeMs: rateLimitStatus.waitTime
    },
    cache: cacheStats
  });
});

/**
 * Get cache stats
 */
app.get('/api/cache/stats', (req, res) => {
  res.json(optionsCache.getStats());
});

/**
 * Clear cache
 */
app.post('/api/cache/clear', (req, res) => {
  optionsCache.clear();
  res.json({ message: 'Cache cleared' });
});

/**
 * Fetch options with caching and rate limiting
 */
async function fetchOptionsWithCaching(ticker, optionType, preferredProvider = 'polygon') {
  const upperTicker = ticker.toUpperCase();

  // Check cache first
  const cached = optionsCache.get(upperTicker, optionType);
  if (cached) {
    // Cache hit
    return cached;
  }

  // Cache miss - will fetch from API

  // Fetch with rate limiting
  const fetchFn = async () => {
    const errors = [];

    // Try Polygon first (if configured)
    if (preferredProvider === 'polygon' && POLYGON_API_KEY) {
      try {
        const options = await fetchPolygonOptions(upperTicker, optionType, POLYGON_API_KEY);
        optionsCache.set(upperTicker, optionType, options, 'polygon');
        return { options, provider: 'polygon', cached: false };
      } catch (error) {
        errors.push({ provider: 'polygon', error: error.message });
        console.warn(`Polygon failed for ${upperTicker}: ${error.message}`);
      }
    }

    // Try Yahoo as fallback
    try {
      const options = await fetchYahooOptions(upperTicker, optionType);
      optionsCache.set(upperTicker, optionType, options, 'yahoo');
      return { options, provider: 'yahoo', cached: false };
    } catch (error) {
      errors.push({ provider: 'yahoo', error: error.message });
    }

    // Try Polygon if we haven't yet
    if (preferredProvider !== 'polygon' && POLYGON_API_KEY) {
      try {
        const options = await fetchPolygonOptions(upperTicker, optionType, POLYGON_API_KEY);
        optionsCache.set(upperTicker, optionType, options, 'polygon');
        return { options, provider: 'polygon', cached: false };
      } catch (error) {
        errors.push({ provider: 'polygon', error: error.message });
      }
    }

    throw new Error(`All providers failed: ${errors.map(e => `${e.provider}: ${e.error}`).join('; ')}`);
  };

  // Execute with rate limiting for Polygon
  if (POLYGON_API_KEY) {
    return await polygonRateLimiter.execute(fetchFn);
  } else {
    return await fetchFn();
  }
}

/**
 * Get options chain for a ticker
 */
app.get('/api/options/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const optionType = req.query.type || 'call';
  const preferredProvider = req.query.provider || 'polygon';
  const skipCache = req.query.refresh === 'true';

  if (!ticker) {
    return res.status(400).json({ error: 'Ticker symbol required' });
  }

  if (!['call', 'put'].includes(optionType)) {
    return res.status(400).json({ error: 'Invalid option type. Use "call" or "put"' });
  }

  try {
    // Check cache unless refresh requested
    if (!skipCache) {
      const cached = optionsCache.get(ticker.toUpperCase(), optionType);
      if (cached) {
        console.log(`✓ ${ticker.toUpperCase()}: ${cached.options.length} contracts (cached)`);
        return res.json({
          ticker: ticker.toUpperCase(),
          optionType,
          count: cached.options.length,
          options: cached.options,
          provider: cached.provider,
          cached: true,
          cacheAge: cached.cacheAge,
          timestamp: new Date().toISOString()
        });
      }
    }

    const { options, provider, cached } = await fetchOptionsWithCaching(ticker, optionType, preferredProvider);
    console.log(`✓ ${ticker.toUpperCase()}: ${options.length} contracts (${provider})`);

    res.json({
      ticker: ticker.toUpperCase(),
      optionType,
      count: options.length,
      options,
      provider,
      cached: cached || false,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`✗ ${ticker.toUpperCase()}: ${error.message}`);
    res.status(500).json({
      error: error.message || 'Failed to fetch options data',
      ticker: ticker.toUpperCase()
    });
  }
});

/**
 * Batch fetch options for multiple tickers
 * Respects rate limits and uses caching
 */
app.post('/api/options/batch', async (req, res) => {
  const { tickers, type = 'call', provider = 'polygon' } = req.body;

  if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
    return res.status(400).json({ error: 'Array of tickers required' });
  }

  if (tickers.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 tickers per batch' });
  }

  const results = [];
  const errors = [];
  let cacheHits = 0;
  let apiFetches = 0;

  // Separate cached vs uncached tickers
  const uncachedTickers = [];

  for (const ticker of tickers) {
    const cached = optionsCache.get(ticker.toUpperCase(), type);
    if (cached) {
      results.push({
        ticker: ticker.toUpperCase(),
        options: cached.options,
        provider: cached.provider,
        cached: true,
        cacheAge: cached.cacheAge,
        success: true
      });
      cacheHits++;
    } else {
      uncachedTickers.push(ticker);
    }
  }

  console.log(`Batch: ${cacheHits} cache hits, ${uncachedTickers.length} to fetch`);

  // Fetch uncached tickers with rate limiting
  if (uncachedTickers.length > 0) {
    const fetchFns = uncachedTickers.map(ticker => async () => {
      return { ticker, result: await fetchOptionsWithCaching(ticker, type, provider) };
    });

    const batchResults = await polygonRateLimiter.executeBatch(
      fetchFns,
      (current, total) => {
        console.log(`Batch progress: ${current}/${total}`);
      }
    );

    for (const { success, result, error } of batchResults) {
      if (success) {
        results.push({
          ticker: result.ticker.toUpperCase(),
          options: result.result.options,
          provider: result.result.provider,
          cached: false,
          success: true
        });
        apiFetches++;
      } else {
        errors.push({
          ticker: result?.ticker?.toUpperCase() || 'unknown',
          error: error,
          success: false
        });
      }
    }
  }

  res.json({
    results,
    errors,
    stats: {
      total: tickers.length,
      success: results.length,
      errors: errors.length,
      cacheHits,
      apiFetches
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * Get rate limit status
 */
app.get('/api/ratelimit', (req, res) => {
  res.json(polygonRateLimiter.getStatus());
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   LEAPS Scanner Backend Server                            ║
║                                                           ║
║   Server running on http://localhost:${PORT}                 ║
║                                                           ║
║   Features:                                               ║
║   • Rate limiting: 5 calls/min (Polygon free tier)        ║
║   • Caching: 30 min TTL                                   ║
║   • Fallback: Polygon → Yahoo                             ║
║                                                           ║
║   Providers:                                              ║
║   • Polygon.io: ${POLYGON_API_KEY ? 'Configured ✓' : 'Not configured'}                            ║
║   • Yahoo Finance: Available (fallback)                   ║
║                                                           ║
║   Endpoints:                                              ║
║   • GET  /api/health          - Health + stats            ║
║   • GET  /api/options/:ticker - Get options (cached)      ║
║   • POST /api/options/batch   - Batch fetch (rate-limited)║
║   • GET  /api/ratelimit       - Rate limit status         ║
║   • GET  /api/cache/stats     - Cache statistics          ║
║   • POST /api/cache/clear     - Clear cache               ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
