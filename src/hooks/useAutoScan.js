import { useState, useCallback, useRef, useMemo } from 'react';
import { getStockUniverse, getEnhancedStockUniverse } from '../services/stockUniverse';
import {
  batchScanTickers,
  filterHighRiskLeaps,
  getTopScoredOptions,
  getApiProvider
} from '../services/optionsApi';
import { scanCache } from '../services/scanCache';

// Rate limits by provider (realistic estimates based on actual performance)
const POLYGON_MAX_TICKERS = 25; // Keep scan time reasonable on free tier
const POLYGON_MS_PER_TICKER = 25000; // 25 seconds per ticker (2 API calls with rate limiting)
const BACKEND_MS_PER_TICKER = 600; // ~0.6 seconds per ticker
const YAHOO_MS_PER_TICKER = 2000; // ~2 seconds per ticker via CORS proxy

/**
 * useAutoScan Hook
 *
 * Custom hook for managing auto-scan state and operations.
 * Scans multiple tickers, applies filters, and ranks by score.
 *
 * State:
 * - scanStatus: 'idle' | 'scanning' | 'completed' | 'error'
 * - progress: { currentTicker, currentIndex, totalTickers, percentComplete }
 * - results: Top 50 filtered and scored options
 * - tickerResults: Map of ticker -> options for granular tracking
 * - errors: Array of { ticker, error } for failed scans
 *
 * @param {Object} options - Configuration options
 * @param {string} options.optionType - 'call' or 'put'
 * @param {Object} options.filters - Filter criteria
 * @param {number} options.maxResults - Maximum results to return (default 50)
 * @param {number} options.rateLimit - API calls per minute (default 60)
 * @param {boolean} options.includeTrending - Include trending stocks from Finnhub
 * @param {number} options.trendingMaxPrice - Max stock price for trending (50 or 3)
 */
export function useAutoScan(options = {}) {
  const {
    optionType = 'call',
    filters = {},
    maxResults = 50,
    rateLimit = 60,
    includeTrending = false,
    trendingMaxPrice = 50
  } = options;

  // Core state
  const [scanStatus, setScanStatus] = useState('idle');
  const [progress, setProgress] = useState({
    currentTicker: null,
    currentIndex: 0,
    totalTickers: 0,
    percentComplete: 0
  });
  const [rawResults, setRawResults] = useState([]);
  const [tickerResults, setTickerResults] = useState(new Map());
  const [errors, setErrors] = useState([]);
  const [stockSource, setStockSource] = useState({
    source: 'static',
    staticCount: 0,
    trendingCount: 0,
    totalCount: 0
  });
  const [dataSource, setDataSource] = useState({
    provider: 'unknown',
    realDataCount: 0,
    mockDataCount: 0
  });
  const [fallbackInfo, setFallbackInfo] = useState({
    backendAttempted: false,
    backendFailed: false,
    fallbackProvider: null,
    fallbackReason: null
  });
  const [cacheInfo, setCacheInfo] = useState({
    isFromCache: false,
    cacheAge: null,
    cachedAt: null
  });

  // Abort controller for cancellation
  const abortControllerRef = useRef(null);

  // Calculate filtered and scored results
  const results = useMemo(() => {
    if (rawResults.length === 0) return [];

    // Apply filters
    const filtered = filterHighRiskLeaps(rawResults, filters);

    // Get top N by score
    return getTopScoredOptions(filtered, maxResults);
  }, [rawResults, filters, maxResults]);

  // Calculate estimated time remaining based on actual provider being used
  const estimatedTimeRemaining = useMemo(() => {
    const remaining = progress.totalTickers - progress.currentIndex;
    if (remaining <= 0) return 0;

    // Use the actual data source provider (accounts for fallbacks)
    const actualProvider = dataSource.provider || getApiProvider();

    let msPerRequest;
    if (actualProvider === 'backend') {
      msPerRequest = BACKEND_MS_PER_TICKER;
    } else if (actualProvider === 'polygon') {
      msPerRequest = POLYGON_MS_PER_TICKER;
    } else if (actualProvider === 'yahoo') {
      msPerRequest = YAHOO_MS_PER_TICKER;
    } else {
      // Default estimate
      msPerRequest = 1000;
    }

    const totalMs = remaining * msPerRequest;
    return Math.ceil(totalMs / 1000); // seconds
  }, [progress, dataSource.provider]);

  // Start auto-scan
  const startScan = useCallback(async () => {
    // Check cache first
    const cacheKey = scanCache.generateKey(optionType, { includeTrending });

    const cachedData = scanCache.get(cacheKey);
    if (cachedData) {
      setRawResults(cachedData.rawResults);
      setTickerResults(new Map(cachedData.tickerResults));
      setStockSource(cachedData.stockSource || { source: 'cached' });
      setCacheInfo({
        isFromCache: true,
        cacheAge: scanCache.getAge(cacheKey),
        cachedAt: cachedData.timestamp
      });
      setScanStatus('completed');
      setProgress({
        currentTicker: null,
        currentIndex: cachedData.tickerResults.length,
        totalTickers: cachedData.tickerResults.length,
        percentComplete: 100
      });
      return;
    }

    // Get stock universe (static list OR trending only - not combined)
    let tickers;
    let sourceInfo;

    if (includeTrending) {
      // Trending mode: only scan trending stocks from Finnhub
      try {
        const enhanced = await getEnhancedStockUniverse({
          trendingOnly: true,
          maxPrice: trendingMaxPrice
        });
        tickers = enhanced.stocks;
        sourceInfo = {
          source: trendingMaxPrice <= 3 ? 'finnhub-penny' : 'finnhub',
          staticCount: 0,
          trendingCount: enhanced.trendingCount,
          totalCount: enhanced.totalCount,
          maxPrice: trendingMaxPrice
        };

        if (tickers.length === 0) {
          setScanStatus('error');
          setErrors([{ ticker: 'system', error: `No trending stocks found under $${trendingMaxPrice}.` }]);
          return;
        }
      } catch (e) {
        console.warn('Failed to fetch trending stocks:', e);
        setScanStatus('error');
        setErrors([{ ticker: 'system', error: e.message || 'Unable to fetch trending stocks from Finnhub.' }]);
        return;
      }
    } else {
      // Normal mode: use hardcoded static list
      tickers = getStockUniverse();
      sourceInfo = { source: 'static', totalCount: tickers.length };
    }

    setStockSource(sourceInfo);

    // Limit tickers for Polygon free tier (5 calls/min is very slow)
    // Backend has no such limitation
    const provider = getApiProvider();
    if (provider === 'polygon' && tickers.length > POLYGON_MAX_TICKERS) {
      console.log(`Polygon free tier: limiting scan to ${POLYGON_MAX_TICKERS} tickers (from ${tickers.length})`);
      // Prioritize lower-priced, popular stocks for finding cheap LEAPS
      const priorityTickers = [
        'F', 'NIO', 'SOFI', 'PLTR', 'PLUG', 'SNAP', 'AAL', 'CCL', 'AMC', 'RIOT',
        'MARA', 'LCID', 'RIVN', 'HOOD', 'T', 'NOK', 'BB', 'WISH', 'CLOV', 'DKNG',
        'MGM', 'LYFT', 'PARA', 'WBD'
      ];
      tickers = priorityTickers.slice(0, POLYGON_MAX_TICKERS);
      sourceInfo = { ...sourceInfo, source: 'polygon-limited', totalCount: tickers.length };
      setStockSource(sourceInfo);
    } else if (provider === 'backend') {
      console.log(`Backend server: scanning all ${tickers.length} tickers`);
    }

    // Initialize scan
    abortControllerRef.current = new AbortController();

    setScanStatus('scanning');
    setProgress({
      currentTicker: tickers[0],
      currentIndex: 0,
      totalTickers: tickers.length,
      percentComplete: 0
    });
    setRawResults([]);
    setTickerResults(new Map());
    setErrors([]);

    try {
      const allResults = [];
      const tickerMap = new Map();

      const { results: batchResults, errors: scanErrors, dataSource: batchDataSource, fallbackInfo: batchFallbackInfo, stats } = await batchScanTickers(
        tickers,
        optionType,
        {
          signal: abortControllerRef.current.signal,
          rateLimit,
          useMockData: false, // Try real data
          onProgress: setProgress,
          onTickerComplete: (ticker, tickerOptions, error) => {
            if (!error && tickerOptions.length > 0) {
              // Update ticker results map
              tickerMap.set(ticker, tickerOptions);
              setTickerResults(new Map(tickerMap));

              // Accumulate all results
              allResults.push(...tickerOptions);
              setRawResults([...allResults]);
            }
          }
        }
      );

      setErrors(scanErrors);
      setDataSource({
        provider: batchDataSource || 'unknown',
        realDataCount: stats?.realDataCount || 0,
        mockDataCount: stats?.mockDataCount || 0
      });
      setFallbackInfo(batchFallbackInfo || {
        backendAttempted: false,
        backendFailed: false,
        fallbackProvider: null,
        fallbackReason: null
      });
      setCacheInfo({
        isFromCache: false,
        cacheAge: 'Just now',
        cachedAt: Date.now()
      });
      setScanStatus('completed');

      // Cache raw results for filter changes
      scanCache.set(cacheKey, {
        rawResults: allResults,
        tickerResults: Array.from(tickerMap.entries()),
        stockSource: sourceInfo,
        timestamp: Date.now()
      });

    } catch (error) {
      if (error.name === 'AbortError') {
        setScanStatus('idle');
      } else {
        setScanStatus('error');
        setErrors([{ ticker: 'system', error: error.message }]);
      }
    }
  }, [optionType, rateLimit, includeTrending, trendingMaxPrice]);

  // Stop/cancel scan
  const stopScan = useCallback(() => {
    abortControllerRef.current?.abort();
    setScanStatus('idle');
  }, []);

  // Reset to initial state
  const resetScan = useCallback(() => {
    abortControllerRef.current?.abort();
    setScanStatus('idle');
    setProgress({
      currentTicker: null,
      currentIndex: 0,
      totalTickers: 0,
      percentComplete: 0
    });
    setRawResults([]);
    setTickerResults(new Map());
    setErrors([]);
  }, []);

  // Clear cache and rescan
  const refreshScan = useCallback(() => {
    scanCache.clear();
    resetScan();
    startScan();
  }, [resetScan, startScan]);

  // Get unique tickers in results
  const tickersInResults = useMemo(() => {
    return [...new Set(results.map(opt => opt.symbol))];
  }, [results]);

  return {
    // State
    scanStatus,
    progress,
    results,
    rawResults,
    tickerResults,
    errors,
    stockSource,
    dataSource,
    fallbackInfo,
    cacheInfo,

    // Actions
    startScan,
    stopScan,
    resetScan,
    refreshScan,

    // Computed
    isScanning: scanStatus === 'scanning',
    isComplete: scanStatus === 'completed',
    hasErrors: errors.length > 0,
    scannedCount: progress.currentIndex,
    totalCount: progress.totalTickers,
    estimatedTimeRemaining,
    tickersInResults
  };
}

export default useAutoScan;
