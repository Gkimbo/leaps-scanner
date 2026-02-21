/**
 * Finnhub API Integration
 *
 * Finnhub provides CORS-enabled, free tier API access.
 * Free tier includes:
 * - Stock quotes (real-time for US stocks)
 * - Company profiles
 * - Basic market data
 *
 * Rate limit: 60 calls/minute on free tier
 *
 * NOTE: Options chain data requires premium subscription.
 * This module is used for stock quotes to get underlying prices.
 */

const FINNHUB_API_KEY = import.meta.env.VITE_FINNHUB_API_KEY || '';
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

/**
 * Check if Finnhub API is configured
 * @returns {boolean}
 */
export function isFinnhubConfigured() {
  return Boolean(FINNHUB_API_KEY);
}

/**
 * Fetch real-time stock quote from Finnhub
 * Available on free tier, CORS enabled
 *
 * @param {string} ticker - Stock symbol
 * @returns {Promise<Object>} Quote data with current price, change, etc.
 */
export async function fetchQuote(ticker) {
  if (!FINNHUB_API_KEY) {
    throw new Error('Finnhub API key not configured. Add VITE_FINNHUB_API_KEY to .env');
  }

  const response = await fetch(
    `${FINNHUB_BASE_URL}/quote?symbol=${ticker.toUpperCase()}&token=${FINNHUB_API_KEY}`
  );

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Finnhub rate limit exceeded (60 calls/min)');
    }
    throw new Error(`Finnhub API error: ${response.status}`);
  }

  const data = await response.json();

  // Finnhub returns empty object with all zeros for invalid tickers
  if (data.c === 0 && data.h === 0 && data.l === 0) {
    throw new Error(`No quote data found for ${ticker}`);
  }

  return {
    symbol: ticker.toUpperCase(),
    currentPrice: data.c,      // Current price
    change: data.d,            // Change
    percentChange: data.dp,    // Percent change
    high: data.h,              // High of day
    low: data.l,               // Low of day
    open: data.o,              // Open price
    previousClose: data.pc,    // Previous close
    timestamp: data.t          // Timestamp
  };
}

/**
 * Fetch multiple stock quotes with rate limiting
 *
 * @param {string[]} tickers - Array of stock symbols
 * @param {Object} options - Options
 * @param {Function} options.onProgress - Progress callback
 * @param {AbortSignal} options.signal - Abort signal
 * @returns {Promise<Map<string, Object>>} Map of ticker to quote data
 */
export async function fetchMultipleQuotes(tickers, options = {}) {
  const { onProgress, signal } = options;
  const quotes = new Map();
  const errors = [];

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const delayMs = 1000; // 60 calls/min = 1 call/sec

  for (let i = 0; i < tickers.length; i++) {
    if (signal?.aborted) break;

    const ticker = tickers[i];

    onProgress?.({
      currentTicker: ticker,
      currentIndex: i,
      totalTickers: tickers.length,
      percentComplete: Math.round((i / tickers.length) * 100)
    });

    try {
      const quote = await fetchQuote(ticker);
      quotes.set(ticker, quote);
    } catch (error) {
      errors.push({ ticker, error: error.message });
    }

    // Rate limiting delay
    if (i < tickers.length - 1 && !signal?.aborted) {
      await delay(delayMs);
    }
  }

  return { quotes, errors };
}

/**
 * Fetch company profile from Finnhub
 *
 * @param {string} ticker - Stock symbol
 * @returns {Promise<Object>} Company profile data
 */
export async function fetchCompanyProfile(ticker) {
  if (!FINNHUB_API_KEY) {
    throw new Error('Finnhub API key not configured');
  }

  const response = await fetch(
    `${FINNHUB_BASE_URL}/stock/profile2?symbol=${ticker.toUpperCase()}&token=${FINNHUB_API_KEY}`
  );

  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    symbol: ticker.toUpperCase(),
    name: data.name,
    country: data.country,
    exchange: data.exchange,
    industry: data.finnhubIndustry,
    marketCap: data.marketCapitalization,
    logo: data.logo,
    weburl: data.weburl
  };
}

/**
 * Search for stock symbols
 *
 * @param {string} query - Search query
 * @returns {Promise<Array>} Matching symbols
 */
export async function searchSymbols(query) {
  if (!FINNHUB_API_KEY) {
    throw new Error('Finnhub API key not configured');
  }

  const response = await fetch(
    `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(query)}&token=${FINNHUB_API_KEY}`
  );

  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status}`);
  }

  const data = await response.json();

  return (data.result || []).map(item => ({
    symbol: item.symbol,
    description: item.description,
    type: item.type
  }));
}

/**
 * Fetch all US stock symbols from Finnhub
 * Free tier endpoint - returns ~8000+ symbols
 *
 * @returns {Promise<Array>} Array of stock symbols with metadata
 */
export async function fetchUSStockSymbols() {
  if (!FINNHUB_API_KEY) {
    throw new Error('Finnhub API key not configured');
  }

  const response = await fetch(
    `${FINNHUB_BASE_URL}/stock/symbol?exchange=US&token=${FINNHUB_API_KEY}`
  );

  if (!response.ok) {
    throw new Error(`Finnhub API error: ${response.status}`);
  }

  const data = await response.json();

  // Filter for common stocks only (exclude ETFs, warrants, etc. for cleaner list)
  return data
    .filter(stock => stock.type === 'Common Stock')
    .map(stock => ({
      symbol: stock.symbol,
      description: stock.description,
      currency: stock.currency,
      type: stock.type
    }));
}

/**
 * Fetch market news and extract trending tickers
 * Free tier endpoint - returns news with mentioned tickers
 *
 * @param {string} category - News category: general, forex, crypto, merger
 * @returns {Promise<Array>} Array of trending ticker symbols
 */
export async function fetchTrendingFromNews(category = 'general', options = {}) {
  const { maxPrice = 50 } = options;

  if (!FINNHUB_API_KEY) {
    throw new Error('Finnhub API key not configured');
  }

  // Popular stocks under $50 to check for recent news activity
  const popularStocks50 = [
    // Fintech & Tech
    'SOFI', 'PLTR', 'SNAP', 'HOOD', 'RBLX', 'U', 'PATH', 'DDOG', 'NET', 'CRWD',
    'ZS', 'OKTA', 'MDB', 'SNOW', 'BILL', 'AFRM', 'UPST', 'LC', 'NU', 'GRAB',
    // EV & Auto
    'NIO', 'F', 'RIVN', 'LCID', 'GM', 'XPEV', 'LI', 'FSR', 'PSNY', 'RIDE',
    // Airlines & Travel
    'AAL', 'DAL', 'UAL', 'LUV', 'JBLU', 'SAVE', 'ALK', 'HA',
    // Cruise & Entertainment
    'CCL', 'NCLH', 'RCL', 'PARA', 'WBD', 'AMC', 'CNK', 'IMAX', 'LYV',
    // Banks & Finance
    'WFC', 'C', 'BAC', 'USB', 'KEY', 'RF', 'CFG', 'FITB', 'HBAN', 'ZION',
    // Telecom
    'T', 'VZ', 'TMUS', 'LUMN',
    // Pharma & Biotech
    'PFE', 'BMY', 'GILD', 'BIIB', 'VRTX', 'MRNA', 'BNTX', 'NVAX',
    // Crypto & Mining
    'MARA', 'RIOT', 'COIN', 'HIVE', 'BTBT', 'CLSK', 'CIFR', 'BITF',
    // Gaming & Sports Betting
    'DKNG', 'PENN', 'MGM', 'WYNN', 'CZR', 'RSI', 'GENI',
    // Clean Energy
    'PLUG', 'FCEL', 'CHPT', 'BLNK', 'EVGO', 'BE', 'RUN', 'NOVA', 'ENPH',
    // Semiconductors
    'INTC', 'AMD', 'MU', 'QCOM', 'MRVL', 'ON', 'SWKS', 'WOLF',
    // Retail & Consumer
    'GPS', 'M', 'KSS', 'JWN', 'DDS', 'BBY', 'BBWI', 'ETSY',
    // Real Estate
    'OPEN', 'RDFN', 'Z', 'ZG', 'CBRE', 'JLL',
    // Other Popular
    'BB', 'NOK', 'SPCE', 'JOBY', 'LILM', 'ACHR'
  ];

  // Penny stocks under $3 - high volatility, speculative plays
  const popularStocks3 = [
    // EV & Clean Tech
    'WKHS', 'GOEV', 'MULN', 'FFIE', 'NKLA', 'FSR', 'RIDE', 'ARVL', 'REE', 'PTRA',
    'GEVO', 'TELL', 'CLNE', 'STEM', 'BLNK', 'EVGO',
    // Biotech & Healthcare
    'DNA', 'CLOV', 'BNGO', 'SNDL', 'TLRY', 'ACB', 'CGC', 'HEXO', 'VFF', 'GRWG',
    'BIOR', 'SINT', 'OCGN', 'NVAX', 'SRNE', 'INO', 'VXRT', 'ATOS',
    // Tech & Software
    'SIRI', 'SKLZ', 'WISH', 'BARK', 'OPEN', 'PSFE', 'PAYO', 'BTRS', 'CXAI',
    'IQ', 'TME', 'WDH', 'TUYA',
    // Crypto Mining
    'CIFR', 'BTBT', 'ANY', 'SOS', 'CLSK', 'BITF', 'HUT', 'CORZ', 'GREE', 'EBON',
    // Space & Aviation
    'ASTS', 'RKT', 'SPIR', 'BKSY', 'PL', 'VORB',
    // Lidar & Sensors
    'LAZR', 'VLDR', 'OUST', 'INVZ', 'AEVA', 'CPTN',
    // Battery & Materials
    'QS', 'MVST', 'DCRC', 'SES', 'AMPX', 'FREYR',
    // Media & Entertainment
    'HYLN', 'ORGN', 'KULR', 'LMND', 'ROOT', 'METC',
    // SPACs & Others
    'SOFI', 'CANO', 'HIMS', 'TASK', 'VIEW', 'EMBK', 'ARQQ', 'IONQ'
  ];

  const popularStocks = maxPrice <= 3 ? popularStocks3 : popularStocks50;

  const tickerActivity = [];
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromDate = weekAgo.toISOString().split('T')[0];
  const toDate = today.toISOString().split('T')[0];

  // Check news activity for each popular stock (limit to avoid rate limits)
  const stocksToCheck = popularStocks.slice(0, 20);

  for (const symbol of stocksToCheck) {
    try {
      const response = await fetch(
        `${FINNHUB_BASE_URL}/company-news?symbol=${symbol}&from=${fromDate}&to=${toDate}&token=${FINNHUB_API_KEY}`
      );

      if (response.ok) {
        const news = await response.json();
        if (news.length > 0) {
          tickerActivity.push({
            symbol,
            mentions: news.length,
            latestHeadline: news[0]?.headline || ''
          });
        }
      }

      // Small delay to avoid rate limits (60 calls/min)
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (e) {
      // Skip failed fetches
    }
  }

  // Sort by news activity (most active first)
  const sorted = tickerActivity
    .sort((a, b) => b.mentions - a.mentions);

  // If we got results, return them. Otherwise return the full popular list
  if (sorted.length > 0) {
    return sorted;
  }

  // Fallback: return popular stocks without activity data
  return popularStocks.map(symbol => ({ symbol, mentions: 0 }));
}

/**
 * Fetch stocks with highest price changes (movers)
 * Uses multiple quote fetches to identify movers
 *
 * @param {string[]} tickers - Base list of tickers to check
 * @param {number} limit - Max number of movers to return
 * @returns {Promise<Object>} Gainers and losers arrays
 */
export async function fetchMarketMovers(tickers, limit = 20) {
  if (!FINNHUB_API_KEY) {
    throw new Error('Finnhub API key not configured');
  }

  const quotes = [];
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Fetch quotes for a sample of tickers (limited by rate)
  const sampleSize = Math.min(tickers.length, 50); // Limit API calls
  const sample = tickers.slice(0, sampleSize);

  for (const ticker of sample) {
    try {
      const quote = await fetchQuote(ticker);
      if (quote.currentPrice > 0) {
        quotes.push({
          symbol: ticker,
          price: quote.currentPrice,
          change: quote.change,
          percentChange: quote.percentChange
        });
      }
    } catch (e) {
      // Skip failed quotes
    }
    await delay(100); // Brief delay to avoid rate limits
  }

  // Sort by percent change
  const sorted = quotes.sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange));

  return {
    gainers: sorted.filter(q => q.percentChange > 0).slice(0, limit),
    losers: sorted.filter(q => q.percentChange < 0).slice(0, limit),
    mostActive: sorted.slice(0, limit)
  };
}

/**
 * Fetch recommended stocks based on multiple signals
 * Combines news mentions, price activity, and curated list
 *
 * @param {Object} options - Configuration options
 * @param {number} options.maxStocks - Maximum stocks to return
 * @param {boolean} options.includeTrending - Include trending from news
 * @param {string[]} options.baseTickers - Base list of tickers to include
 * @returns {Promise<Array>} Array of recommended ticker symbols
 */
export async function fetchRecommendedStocks(options = {}) {
  const {
    maxStocks = 100,
    includeTrending = true,
    baseTickers = []
  } = options;

  const recommended = new Set(baseTickers);

  try {
    // Add trending tickers from news
    if (includeTrending) {
      const trending = await fetchTrendingFromNews('general');
      trending.slice(0, 50).forEach(t => recommended.add(t.symbol));
    }
  } catch (e) {
    console.warn('Failed to fetch trending stocks:', e.message);
  }

  // Convert to array and limit
  return [...recommended].slice(0, maxStocks);
}

/**
 * Get low-priced stocks from a list (for cheap LEAPS scanning)
 * Fetches quotes to find stocks under a price threshold
 *
 * @param {string[]} tickers - Tickers to check
 * @param {number} maxPrice - Maximum stock price
 * @param {number} batchSize - How many to check (rate limited)
 * @returns {Promise<Array>} Array of low-priced stocks with prices
 */
export async function fetchLowPricedStocks(tickers, maxPrice = 30, batchSize = 60) {
  if (!FINNHUB_API_KEY) {
    throw new Error('Finnhub API key not configured');
  }

  const lowPriced = [];
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const batch = tickers.slice(0, batchSize);

  for (const ticker of batch) {
    try {
      const quote = await fetchQuote(ticker);
      if (quote.currentPrice > 0 && quote.currentPrice <= maxPrice) {
        lowPriced.push({
          symbol: ticker,
          price: quote.currentPrice,
          change: quote.change,
          percentChange: quote.percentChange
        });
      }
    } catch (e) {
      // Skip failed quotes
    }
    await delay(1100); // Stay under 60 calls/min
  }

  // Sort by price (cheapest first - better for cheap LEAPS)
  return lowPriced.sort((a, b) => a.price - b.price);
}

export default {
  fetchQuote,
  fetchMultipleQuotes,
  fetchCompanyProfile,
  searchSymbols,
  fetchUSStockSymbols,
  fetchTrendingFromNews,
  fetchMarketMovers,
  fetchRecommendedStocks,
  fetchLowPricedStocks,
  isFinnhubConfigured
};
