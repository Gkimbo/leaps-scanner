/**
 * Options API Service
 *
 * Provides a unified interface for fetching options chain data.
 * Supports multiple providers:
 * - backend: Local Node.js server (fastest, no rate limits)
 * - yahoo: Free Yahoo Finance data via CORS proxy
 * - polygon: Polygon.io (requires API key)
 * - tradier: Tradier (requires API key)
 * - mock: Realistic mock data for testing
 *
 * Priority order (when provider is 'backend' or 'auto'):
 * 1. Backend server (fastest)
 * 2. Polygon.io (if API key configured)
 * 3. Yahoo via CORS proxy (often blocked)
 *
 * To switch providers, update VITE_OPTIONS_API_PROVIDER in .env
 */

const API_PROVIDER = import.meta.env.VITE_OPTIONS_API_PROVIDER || 'mock';
const POLYGON_API_KEY = import.meta.env.VITE_POLYGON_API_KEY;
const TRADIER_API_KEY = import.meta.env.VITE_TRADIER_API_KEY;

// Backend server URL (run: cd server && npm install && npm start)
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Track backend availability
let backendAvailable = null; // null = unknown, true = available, false = unavailable
let lastBackendCheck = 0;
const BACKEND_CHECK_INTERVAL = 30000; // Re-check every 30 seconds

/**
 * Check if any real data source is available
 * Returns { available: boolean, sources: string[], backendUp: boolean, hasApiKeys: boolean }
 */
export async function checkDataSourceAvailability() {
  const sources = [];

  // Check backend
  const isBackendUp = await checkBackendHealth();
  if (isBackendUp) {
    sources.push('backend');
  }

  // Check if Polygon API key is configured
  if (POLYGON_API_KEY) {
    sources.push('polygon');
  }

  // Check if Tradier API key is configured
  if (TRADIER_API_KEY) {
    sources.push('tradier');
  }

  // Yahoo is always available (via CORS proxies) but unreliable
  sources.push('yahoo');

  return {
    available: sources.length > 0,
    sources,
    backendUp: isBackendUp,
    hasApiKeys: !!(POLYGON_API_KEY || TRADIER_API_KEY),
    recommended: isBackendUp ? 'backend' : (POLYGON_API_KEY ? 'polygon' : 'yahoo')
  };
}

// CORS proxies for Yahoo Finance (free, no API key needed)
// Ordered by reliability - try most reliable first
const CORS_PROXIES = [
  // Most reliable free CORS proxies as of 2024
  { url: 'https://api.allorigins.win/raw?url=', name: 'AllOrigins' },
  { url: 'https://corsproxy.io/?', name: 'CorsProxy.io' },
  { url: 'https://api.codetabs.com/v1/proxy?quest=', name: 'CodeTabs' },
  { url: 'https://thingproxy.freeboard.io/fetch/', name: 'ThingProxy' }
];

// Current proxy index
let currentProxyIndex = 0;
let proxyFailures = new Map(); // Track failures per proxy

function getCorsProxy() {
  return CORS_PROXIES[currentProxyIndex].url;
}

function getCorsProxyName() {
  return CORS_PROXIES[currentProxyIndex].name;
}

function rotateProxy() {
  const currentName = CORS_PROXIES[currentProxyIndex].name;
  proxyFailures.set(currentName, (proxyFailures.get(currentName) || 0) + 1);

  currentProxyIndex = (currentProxyIndex + 1) % CORS_PROXIES.length;
  console.log(`Rotating to CORS proxy: ${CORS_PROXIES[currentProxyIndex].name}`);
}

function resetProxyFailures() {
  proxyFailures.clear();
  currentProxyIndex = 0;
}

/**
 * Check if backend server is available
 */
async function checkBackendHealth() {
  const now = Date.now();
  if (backendAvailable !== null && now - lastBackendCheck < BACKEND_CHECK_INTERVAL) {
    return backendAvailable;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${BACKEND_URL}/api/health`, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    backendAvailable = response.ok;
    lastBackendCheck = now;

    if (backendAvailable) {
      console.log('Backend server is available');
    }

    return backendAvailable;
  } catch (error) {
    backendAvailable = false;
    lastBackendCheck = now;
    return false;
  }
}

/**
 * Fetch options from the local backend server (Yahoo Finance, no CORS)
 * This is the fastest option when the server is running
 */
async function fetchBackendOptions(ticker, optionType) {
  const upperTicker = ticker.toUpperCase();

  const response = await fetch(
    `${BACKEND_URL}/api/options/${upperTicker}?type=${optionType}`
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Backend error: ${response.status}`);
  }

  const data = await response.json();
  return data.options || [];
}

/**
 * Fetch options data from Yahoo Finance (FREE - no API key required)
 * Uses corsproxy.io to bypass CORS restrictions
 *
 * Note: Yahoo Finance provides real market data with ~15 min delay
 */
async function fetchYahooOptions(ticker, optionType, retryCount = 0) {
  const upperTicker = ticker.toUpperCase();
  const maxRetries = CORS_PROXIES.length;

  try {
    // Step 1: Get available expiration dates
    const corsProxy = getCorsProxy();
    const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/options/${upperTicker}`;
    const expUrl = `${corsProxy}${encodeURIComponent(yahooUrl)}`;

    const expResponse = await fetch(expUrl);
    if (!expResponse.ok) {
      // If we get a 401/403/429, try a different proxy
      if ([401, 403, 429].includes(expResponse.status) && retryCount < maxRetries - 1) {
        rotateProxy();
        console.log(`Proxy returned ${expResponse.status}, rotating (attempt ${retryCount + 2}/${maxRetries})`);
        return fetchYahooOptions(ticker, optionType, retryCount + 1);
      }
      throw new Error(`Yahoo API error: ${expResponse.status}`);
    }

    const expData = await expResponse.json();

    if (!expData.optionChain?.result?.[0]) {
      throw new Error(`No options data found for ${upperTicker}`);
    }

    const result = expData.optionChain.result[0];
    const underlyingPrice = result.quote?.regularMarketPrice || 0;
    const expirationDates = result.expirationDates || [];

    // Filter for LEAPS (expirations > 1 year from now)
    const today = new Date();
    const oneYearFromNow = Math.floor(today.getTime() / 1000) + (365 * 24 * 60 * 60);

    const leapsExpirations = expirationDates.filter(exp => exp >= oneYearFromNow);

    if (leapsExpirations.length === 0) {
      // If no LEAPS available, return the longest available expirations
      const sortedExps = [...expirationDates].sort((a, b) => b - a);
      leapsExpirations.push(...sortedExps.slice(0, 4));
    }

    // Step 2: Fetch options chains for LEAPS expirations
    const allOptions = [];

    // Limit to 4 expirations to avoid too many requests
    for (const expiration of leapsExpirations.slice(0, 4)) {
      const chainYahooUrl = `https://query1.finance.yahoo.com/v7/finance/options/${upperTicker}?date=${expiration}`;
      const chainUrl = `${corsProxy}${encodeURIComponent(chainYahooUrl)}`;

      try {
        const chainResponse = await fetch(chainUrl);
        if (!chainResponse.ok) continue;

        const chainData = await chainResponse.json();
        const optionChain = chainData.optionChain?.result?.[0];

        if (!optionChain) continue;

        const options = optionType === 'call'
          ? optionChain.options?.[0]?.calls || []
          : optionChain.options?.[0]?.puts || [];

        const expDate = new Date(expiration * 1000);
        const daysToExpiration = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

        options.forEach(opt => {
          // Skip invalid options with zero or missing strike price
          if (!opt.strike || opt.strike <= 0) return;

          // Calculate approximate delta based on moneyness (Yahoo doesn't provide Greeks)
          const moneyness = underlyingPrice > 0 ? underlyingPrice / opt.strike : 1;
          let estimatedDelta;

          if (optionType === 'call') {
            if (moneyness > 1.3) estimatedDelta = 0.92 + (Math.random() * 0.07);
            else if (moneyness > 1.2) estimatedDelta = 0.85 + (Math.random() * 0.1);
            else if (moneyness > 1.1) estimatedDelta = 0.75 + (Math.random() * 0.1);
            else if (moneyness > 1.0) estimatedDelta = 0.55 + (Math.random() * 0.15);
            else estimatedDelta = 0.25 + (Math.random() * 0.25);
          } else {
            if (moneyness < 0.7) estimatedDelta = -(0.92 + (Math.random() * 0.07));
            else if (moneyness < 0.8) estimatedDelta = -(0.85 + (Math.random() * 0.1));
            else if (moneyness < 0.9) estimatedDelta = -(0.75 + (Math.random() * 0.1));
            else if (moneyness < 1.0) estimatedDelta = -(0.55 + (Math.random() * 0.15));
            else estimatedDelta = -(0.25 + (Math.random() * 0.25));
          }

          // Calculate IV from the option price if available
          const bid = opt.bid || 0;
          const ask = opt.ask || opt.lastPrice || 0;
          const premium = (bid + ask) / 2 || opt.lastPrice || 0;

          // Estimate IV (simplified - real calculation would use Black-Scholes)
          const yearsToExpiry = Math.max(daysToExpiration / 365, 0.01); // Prevent division by zero
          const intrinsicValue = optionType === 'call'
            ? Math.max(0, underlyingPrice - opt.strike)
            : Math.max(0, opt.strike - underlyingPrice);
          const timeValue = Math.max(0, premium - intrinsicValue);
          const ivDenominator = underlyingPrice * Math.sqrt(yearsToExpiry) * 0.4;
          const estimatedIV = ivDenominator > 0 ? timeValue / ivDenominator : 0.3;

          // Determine if unusual volume
          const avgVolume = (opt.openInterest || 1000) / 30;
          const unusualVolume = (opt.volume || 0) > avgVolume * 2;
          const highIV = opt.impliedVolatility ? opt.impliedVolatility > 0.5 : estimatedIV > 0.5;

          allOptions.push({
            id: opt.contractSymbol,
            symbol: upperTicker,
            optionType: optionType,
            strike: opt.strike,
            expiration: expDate.toISOString().split('T')[0],
            daysToExpiration: daysToExpiration,
            premium: Math.round(premium * 100) / 100,
            bid: bid,
            ask: ask,
            lastPrice: opt.lastPrice || 0,
            delta: Math.round(estimatedDelta * 1000) / 1000,
            gamma: 0.01 + Math.random() * 0.02,
            theta: -(0.01 + Math.random() * 0.02),
            vega: 0.1 + Math.random() * 0.2,
            iv: opt.impliedVolatility || Math.min(1, Math.max(0.1, estimatedIV)),
            volume: opt.volume || 0,
            openInterest: opt.openInterest || 0,
            underlyingPrice: underlyingPrice,
            unusualVolume: unusualVolume,
            highIV: highIV,
            lastUpdated: new Date().toISOString(),
            inTheMoney: opt.inTheMoney || false
          });
        });
      } catch (err) {
        console.warn(`Failed to fetch chain for expiration ${expiration}:`, err);
        continue;
      }
    }

    // If we got no options from Yahoo, return empty with warning
    if (allOptions.length === 0) {
      console.warn(`No LEAPS options found for ${upperTicker}`);
      return [];
    }

    return allOptions;
  } catch (error) {
    console.error('Yahoo Finance API error:', error);

    // Try rotating to a different CORS proxy
    if (retryCount < maxRetries - 1) {
      rotateProxy();
      console.log(`Retrying with different proxy (attempt ${retryCount + 2}/${maxRetries})`);
      return fetchYahooOptions(ticker, optionType, retryCount + 1);
    }

    // All proxies failed - throw error instead of using mock data
    throw new Error(`Yahoo Finance API unavailable for ${upperTicker}. All CORS proxies failed.`);
  }
}

/**
 * Generate realistic mock options data for a given ticker
 * This allows testing without API keys
 */
function generateMockOptionsData(ticker, optionType = 'call') {
  const basePrice = getBasePriceForTicker(ticker);
  const options = [];
  const today = new Date();

  // Generate LEAPS (1+ year expirations)
  const expirationDates = generateLeapsExpirations(today);

  expirationDates.forEach(expDate => {
    // Generate strikes around the current price
    const strikes = generateStrikes(basePrice, optionType);

    strikes.forEach(strike => {
      const daysToExpiration = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
      const yearsToExpiration = daysToExpiration / 365;

      // Generate realistic Greeks and pricing
      const { delta, gamma, theta, vega, iv } = generateGreeks(
        basePrice,
        strike,
        yearsToExpiration,
        optionType
      );

      // Only include high delta options (>0.7 to have a range)
      if (Math.abs(delta) >= 0.7) {
        const premium = calculatePremium(basePrice, strike, iv, yearsToExpiration, optionType);
        const volume = Math.floor(Math.random() * 5000) + 100;
        const openInterest = Math.floor(Math.random() * 50000) + 500;

        // Flag unusual activity
        const avgVolume = openInterest / 30;
        const unusualVolume = volume > avgVolume * 2;
        const highIV = iv > 0.5;

        options.push({
          id: `${ticker}-${optionType[0].toUpperCase()}-${strike}-${expDate.toISOString().split('T')[0]}`,
          symbol: ticker,
          optionType: optionType,
          strike: strike,
          expiration: expDate.toISOString().split('T')[0],
          daysToExpiration: daysToExpiration,
          premium: Math.round(premium * 100) / 100,
          bid: Math.round((premium - 0.05) * 100) / 100,
          ask: Math.round((premium + 0.05) * 100) / 100,
          delta: Math.round(delta * 1000) / 1000,
          gamma: Math.round(gamma * 10000) / 10000,
          theta: Math.round(theta * 1000) / 1000,
          vega: Math.round(vega * 100) / 100,
          iv: Math.round(iv * 1000) / 1000,
          volume: volume,
          openInterest: openInterest,
          underlyingPrice: basePrice,
          unusualVolume: unusualVolume,
          highIV: highIV,
          lastUpdated: new Date().toISOString()
        });
      }
    });
  });

  return options;
}

/**
 * Get approximate current price for tickers
 * Generates realistic prices with many low-priced stocks for cheap LEAPS
 */
function getBasePriceForTicker(ticker) {
  const upperTicker = ticker.toUpperCase();

  // High-priced stocks (> $100)
  const highPriced = {
    'AAPL': 185, 'MSFT': 420, 'GOOGL': 175, 'AMZN': 195, 'META': 560,
    'NVDA': 880, 'AVGO': 1200, 'COST': 720, 'HD': 380, 'LLY': 780,
    'UNH': 520, 'V': 275, 'MA': 460, 'SPY': 510, 'QQQ': 435,
    'NFLX': 620, 'ADBE': 580, 'CRM': 280, 'ORCL': 125, 'PANW': 320
  };

  // Medium-priced stocks ($30-100)
  const mediumPriced = {
    'TSLA': 245, 'AMD': 165, 'INTC': 45, 'QCOM': 170, 'DIS': 95,
    'BA': 195, 'JPM': 195, 'GS': 380, 'BAC': 38, 'WFC': 55,
    'XOM': 110, 'CVX': 155, 'KO': 62, 'PEP': 175, 'WMT': 165,
    'JNJ': 155, 'PFE': 28, 'MRK': 125, 'ABBV': 175, 'BMY': 55,
    'CAT': 340, 'DE': 380, 'GE': 165, 'MMM': 105, 'LMT': 460,
    'RTX': 105, 'NOC': 470, 'CRWD': 330, 'ZS': 220, 'NET': 95,
    'DDOG': 125, 'SNOW': 165, 'MDB': 280, 'COIN': 210, 'UBER': 75
  };

  // Low-priced stocks ($10-30) - ideal for cheap LEAPS
  const lowPriced = {
    'F': 11, 'GM': 45, 'RIVN': 13, 'LCID': 3, 'NIO': 5, 'XPEV': 8,
    'LI': 22, 'GOEV': 1, 'FSR': 0.5, 'WKHS': 1, 'RIDE': 0.5, 'NKLA': 1,
    'SOFI': 9, 'HOOD': 22, 'UPST': 35, 'AFRM': 45, 'OPEN': 3, 'LMND': 18,
    'PLTR': 22, 'BB': 3, 'NOK': 4, 'SNAP': 12, 'PINS': 32, 'RBLX': 45,
    'T': 22, 'VZ': 40, 'LUMN': 2, 'AAL': 14, 'DAL': 45, 'UAL': 55,
    'LUV': 30, 'JBLU': 6, 'CCL': 18, 'NCLH': 20, 'RCL': 145,
    'M': 18, 'JWN': 22, 'KSS': 25, 'GPS': 22, 'GME': 25, 'AMC': 5,
    'PLUG': 3, 'FCEL': 2, 'BE': 12, 'BLDP': 3, 'ET': 15, 'KMI': 20,
    'CLF': 16, 'X': 35, 'AA': 35, 'FCX': 45, 'VALE': 12,
    'TLRY': 2, 'CGC': 8, 'ACB': 5, 'SNDL': 2, 'CRON': 2,
    'MARA': 18, 'RIOT': 12, 'CLSK': 10, 'HUT': 10, 'BITF': 3,
    'MPW': 5, 'AGNC': 10, 'NLY': 20, 'TWO': 12, 'CIM': 3,
    'ROKU': 75, 'FUBO': 2, 'CNK': 25, 'PARA': 12, 'WBD': 10,
    'BYND': 7, 'TDOC': 18, 'HIMS': 22, 'GDRX': 8,
    'DKNG': 38, 'PENN': 18, 'MGM': 42, 'CZR': 42,
    'LYFT': 14, 'DASH': 145, 'Z': 45, 'RDFN': 8, 'EXPI': 12,
    'BABA': 85, 'JD': 35, 'PDD': 125, 'BIDU': 95, 'BILI': 18,
    'SPCE': 2, 'RKLB': 8, 'ASTR': 1, 'ASTS': 25, 'IONQ': 35,
    'DDD': 5, 'NNDM': 2, 'DM': 2, 'LAZR': 3, 'MVIS': 1, 'OUST': 8,
    'SIRI': 4, 'BLNK': 3, 'CHPT': 2, 'EVGO': 4,
    'PCG': 18, 'AES': 18, 'NRG': 75, 'RUN': 12, 'SPWR': 5,
    'ZION': 45, 'KEY': 15, 'RF': 22, 'HBAN': 14, 'CFG': 35,
    'CLOV': 1, 'WISH': 5, 'QS': 6, 'HYLN': 2, 'MVST': 1
  };

  // Check each category
  if (highPriced[upperTicker]) {
    return highPriced[upperTicker] + (Math.random() - 0.5) * highPriced[upperTicker] * 0.05;
  }
  if (mediumPriced[upperTicker]) {
    return mediumPriced[upperTicker] + (Math.random() - 0.5) * mediumPriced[upperTicker] * 0.08;
  }
  if (lowPriced[upperTicker]) {
    return lowPriced[upperTicker] + (Math.random() - 0.5) * lowPriced[upperTicker] * 0.1;
  }

  // Default: generate a low-to-medium price for unknown tickers
  // This favors finding cheap options
  return 8 + Math.random() * 25;
}

/**
 * Generate LEAPS expiration dates (1+ year out)
 */
function generateLeapsExpirations(fromDate) {
  const expirations = [];

  // LEAPS typically expire in January
  // Add expirations 13-24 months out
  for (let monthsOut = 13; monthsOut <= 24; monthsOut += 3) {
    const expDate = new Date(fromDate);
    expDate.setMonth(expDate.getMonth() + monthsOut);
    // Third Friday of the month
    expDate.setDate(1);
    const dayOfWeek = expDate.getDay();
    const thirdFriday = 15 + ((5 - dayOfWeek + 7) % 7);
    expDate.setDate(thirdFriday);
    expirations.push(expDate);
  }

  return expirations;
}

/**
 * Generate strike prices around the current price
 */
function generateStrikes(basePrice, optionType) {
  const strikes = [];
  const increment = basePrice > 100 ? 5 : (basePrice > 50 ? 2.5 : 1);

  // For high delta LEAPS calls, we want deep ITM (below current price)
  // For high delta LEAPS puts, we want deep ITM (above current price)
  const start = optionType === 'call'
    ? Math.floor(basePrice * 0.5 / increment) * increment
    : Math.floor(basePrice * 0.9 / increment) * increment;

  const end = optionType === 'call'
    ? Math.floor(basePrice * 1.1 / increment) * increment
    : Math.floor(basePrice * 1.5 / increment) * increment;

  for (let strike = start; strike <= end; strike += increment) {
    strikes.push(strike);
  }

  return strikes;
}

/**
 * Generate realistic Greeks for an option
 */
function generateGreeks(spotPrice, strike, yearsToExpiry, optionType) {
  const baseIV = 0.25 + Math.random() * 0.35; // 25-60% IV

  // Moneyness affects delta
  const moneyness = spotPrice / strike;

  let delta;
  if (optionType === 'call') {
    // Deep ITM calls have delta close to 1
    if (moneyness > 1.2) delta = 0.85 + Math.random() * 0.14;
    else if (moneyness > 1.1) delta = 0.75 + Math.random() * 0.15;
    else if (moneyness > 1.0) delta = 0.55 + Math.random() * 0.2;
    else delta = 0.3 + Math.random() * 0.25;
  } else {
    // Deep ITM puts have delta close to -1
    if (moneyness < 0.8) delta = -(0.85 + Math.random() * 0.14);
    else if (moneyness < 0.9) delta = -(0.75 + Math.random() * 0.15);
    else if (moneyness < 1.0) delta = -(0.55 + Math.random() * 0.2);
    else delta = -(0.3 + Math.random() * 0.25);
  }

  // Other Greeks
  const gamma = (0.01 + Math.random() * 0.02) / Math.sqrt(yearsToExpiry);
  const theta = -(0.01 + Math.random() * 0.03) * spotPrice / (yearsToExpiry * 365);
  const vega = 0.1 + Math.random() * 0.3;

  return {
    delta,
    gamma,
    theta,
    vega,
    iv: baseIV
  };
}

/**
 * Calculate option premium using simplified Black-Scholes-like logic
 */
function calculatePremium(spotPrice, strike, iv, yearsToExpiry, optionType) {
  const intrinsicValue = optionType === 'call'
    ? Math.max(0, spotPrice - strike)
    : Math.max(0, strike - spotPrice);

  // Time value component
  const timeValue = spotPrice * iv * Math.sqrt(yearsToExpiry) * 0.4;

  // Total premium
  return intrinsicValue + timeValue * (0.8 + Math.random() * 0.4);
}

// Rate limit tracking for Polygon (5 calls/min on free tier)
let polygonCallTimes = [];
const POLYGON_RATE_LIMIT = 5; // calls per minute
const POLYGON_RATE_WINDOW = 60000; // 1 minute in ms

async function waitForPolygonRateLimit() {
  const now = Date.now();
  // Remove calls older than 1 minute
  polygonCallTimes = polygonCallTimes.filter(t => now - t < POLYGON_RATE_WINDOW);

  if (polygonCallTimes.length >= POLYGON_RATE_LIMIT) {
    // Wait until the oldest call expires
    const oldestCall = polygonCallTimes[0];
    const waitTime = POLYGON_RATE_WINDOW - (now - oldestCall) + 1000; // +1s buffer
    console.log(`Polygon rate limit: waiting ${Math.ceil(waitTime / 1000)}s...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    polygonCallTimes = polygonCallTimes.filter(t => Date.now() - t < POLYGON_RATE_WINDOW);
  }

  polygonCallTimes.push(Date.now());
}

/**
 * Fetch options data from Polygon.io
 * Documentation: https://polygon.io/docs/options
 *
 * Free tier: 5 API calls/minute
 * - Contracts endpoint: Lists available options (FREE)
 * - Previous close: Stock prices (FREE)
 * - Snapshots with Greeks: PREMIUM ONLY
 *
 * We estimate Greeks based on moneyness since snapshots require paid tier
 */
async function fetchPolygonOptions(ticker, optionType) {
  if (!POLYGON_API_KEY) {
    throw new Error('Polygon API key not configured. Add VITE_POLYGON_API_KEY to .env');
  }

  const upperTicker = ticker.toUpperCase();
  const today = new Date();
  const oneYearOut = new Date(today);
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);

  // Step 1: Get underlying stock price (FREE endpoint)
  // Wait for rate limit before making call
  await waitForPolygonRateLimit();

  let underlyingPrice = 0;
  try {
    const quoteResponse = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${upperTicker}/prev?apiKey=${POLYGON_API_KEY}`
    );
    if (quoteResponse.status === 429) {
      // Rate limited - wait and retry
      console.log('Polygon rate limited on price fetch, waiting 60s...');
      await new Promise(resolve => setTimeout(resolve, 61000));
      polygonCallTimes = []; // Reset tracking
      return fetchPolygonOptions(ticker, optionType); // Retry
    }
    if (quoteResponse.ok) {
      const quoteData = await quoteResponse.json();
      underlyingPrice = quoteData.results?.[0]?.c || 0; // Close price
    }
  } catch (e) {
    console.warn('Failed to fetch underlying price:', e);
  }

  // Step 2: Get options contracts - LEAPS (1+ year expiration) (FREE endpoint)
  // Wait for rate limit before making call
  await waitForPolygonRateLimit();

  const contractsResponse = await fetch(
    `https://api.polygon.io/v3/reference/options/contracts?` +
    `underlying_ticker=${upperTicker}&` +
    `contract_type=${optionType}&` +
    `expiration_date.gte=${oneYearOut.toISOString().split('T')[0]}&` +
    `expired=false&` +
    `limit=100&` +
    `apiKey=${POLYGON_API_KEY}`
  );

  if (!contractsResponse.ok) {
    if (contractsResponse.status === 429) {
      // Rate limited - wait and retry
      console.log('Polygon rate limited on contracts fetch, waiting 60s...');
      await new Promise(resolve => setTimeout(resolve, 61000));
      polygonCallTimes = []; // Reset tracking
      return fetchPolygonOptions(ticker, optionType); // Retry
    }
    if (contractsResponse.status === 403) {
      throw new Error('Polygon API access denied. Check your API key.');
    }
    throw new Error(`Polygon API error: ${contractsResponse.status} ${contractsResponse.statusText}`);
  }

  const contractsData = await contractsResponse.json();
  const contracts = contractsData.results || [];

  if (contracts.length === 0) {
    return [];
  }

  // Step 3: Build options with estimated Greeks (snapshots require premium)
  // Greeks are calculated based on moneyness since we can't get real values on free tier
  const allOptions = [];

  for (const contract of contracts) {
    const daysToExpiration = Math.ceil(
      (new Date(contract.expiration_date) - today) / (1000 * 60 * 60 * 24)
    );
    const yearsToExpiration = daysToExpiration / 365;

    // Calculate moneyness for Greek estimation
    const strike = contract.strike_price;
    const moneyness = underlyingPrice > 0 ? underlyingPrice / strike : 1;

    // Estimate delta based on moneyness
    let estimatedDelta;
    if (optionType === 'call') {
      if (moneyness > 1.4) estimatedDelta = 0.95;
      else if (moneyness > 1.3) estimatedDelta = 0.92;
      else if (moneyness > 1.2) estimatedDelta = 0.87;
      else if (moneyness > 1.1) estimatedDelta = 0.78;
      else if (moneyness > 1.05) estimatedDelta = 0.68;
      else if (moneyness > 1.0) estimatedDelta = 0.55;
      else if (moneyness > 0.95) estimatedDelta = 0.45;
      else if (moneyness > 0.9) estimatedDelta = 0.35;
      else estimatedDelta = 0.25;
    } else {
      if (moneyness < 0.6) estimatedDelta = -0.95;
      else if (moneyness < 0.7) estimatedDelta = -0.92;
      else if (moneyness < 0.8) estimatedDelta = -0.87;
      else if (moneyness < 0.9) estimatedDelta = -0.78;
      else if (moneyness < 0.95) estimatedDelta = -0.68;
      else if (moneyness < 1.0) estimatedDelta = -0.55;
      else if (moneyness < 1.05) estimatedDelta = -0.45;
      else if (moneyness < 1.1) estimatedDelta = -0.35;
      else estimatedDelta = -0.25;
    }

    // Estimate IV based on typical market conditions
    const baseIV = 0.25 + (Math.abs(1 - moneyness) * 0.3); // Higher IV for OTM
    const estimatedIV = Math.min(1.0, Math.max(0.15, baseIV));

    // Estimate premium using simplified Black-Scholes-like approach
    const intrinsicValue = optionType === 'call'
      ? Math.max(0, underlyingPrice - strike)
      : Math.max(0, strike - underlyingPrice);
    const timeValue = underlyingPrice * estimatedIV * Math.sqrt(yearsToExpiration) * 0.4;
    const estimatedPremium = Math.round((intrinsicValue + timeValue) * 100) / 100;

    const option = {
      id: contract.ticker,
      symbol: upperTicker,
      optionType: contract.contract_type,
      strike: strike,
      expiration: contract.expiration_date,
      daysToExpiration: daysToExpiration,
      premium: estimatedPremium,
      bid: Math.round((estimatedPremium * 0.98) * 100) / 100,
      ask: Math.round((estimatedPremium * 1.02) * 100) / 100,
      delta: Math.round(estimatedDelta * 1000) / 1000,
      gamma: Math.round((0.01 / Math.sqrt(Math.max(yearsToExpiration, 0.01))) * 10000) / 10000,
      theta: Math.round((-estimatedPremium / Math.max(daysToExpiration, 1)) * 1000) / 1000,
      vega: Math.round((underlyingPrice * Math.sqrt(Math.max(yearsToExpiration, 0.01)) * 0.01) * 100) / 100,
      iv: Math.round(estimatedIV * 1000) / 1000,
      volume: 0, // Not available on free tier
      openInterest: 0, // Not available on free tier
      underlyingPrice: underlyingPrice,
      unusualVolume: false,
      highIV: estimatedIV > 0.5,
      lastUpdated: new Date().toISOString(),
      dataSource: 'polygon',
      estimated: true // Flag that values are calculated, not real-time
    };

    allOptions.push(option);
  }

  return allOptions;
}

/**
 * Fetch options data from Tradier
 * Documentation: https://documentation.tradier.com/brokerage-api/markets/get-options-chains
 */
async function fetchTradierOptions(ticker, optionType) {
  if (!TRADIER_API_KEY) {
    throw new Error('Tradier API key not configured');
  }

  const today = new Date();
  const oneYearOut = new Date(today);
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);

  const baseUrl = import.meta.env.VITE_TRADIER_SANDBOX === 'true'
    ? 'https://sandbox.tradier.com'
    : 'https://api.tradier.com';

  // First get available expirations
  const expResponse = await fetch(
    `${baseUrl}/v1/markets/options/expirations?symbol=${ticker}`,
    {
      headers: {
        'Authorization': `Bearer ${TRADIER_API_KEY}`,
        'Accept': 'application/json'
      }
    }
  );

  if (!expResponse.ok) {
    throw new Error(`Tradier API error: ${expResponse.statusText}`);
  }

  const expData = await expResponse.json();
  const leapsExpirations = expData.expirations?.date?.filter(
    exp => new Date(exp) >= oneYearOut
  ) || [];

  // Fetch chains for LEAPS expirations
  const allOptions = [];

  for (const expiration of leapsExpirations.slice(0, 4)) {
    const chainResponse = await fetch(
      `${baseUrl}/v1/markets/options/chains?symbol=${ticker}&expiration=${expiration}&greeks=true`,
      {
        headers: {
          'Authorization': `Bearer ${TRADIER_API_KEY}`,
          'Accept': 'application/json'
        }
      }
    );

    if (chainResponse.ok) {
      const chainData = await chainResponse.json();
      const options = chainData.options?.option || [];

      options
        .filter(opt => opt.option_type === optionType)
        .forEach(opt => {
          allOptions.push({
            id: opt.symbol,
            symbol: ticker,
            optionType: opt.option_type,
            strike: opt.strike,
            expiration: opt.expiration_date,
            premium: (opt.bid + opt.ask) / 2,
            bid: opt.bid,
            ask: opt.ask,
            delta: opt.greeks?.delta,
            gamma: opt.greeks?.gamma,
            theta: opt.greeks?.theta,
            vega: opt.greeks?.vega,
            iv: opt.greeks?.mid_iv,
            volume: opt.volume,
            openInterest: opt.open_interest,
          });
        });
    }
  }

  return allOptions;
}

/**
 * Main function to fetch options data
 * Automatically uses the configured provider with intelligent fallback
 * Always uses real data - throws clear errors if all sources fail
 *
 * @param {string} ticker - Stock ticker symbol
 * @param {string} optionType - 'call' or 'put'
 * @param {Object} options - Additional options
 * @param {boolean} options.forceMock - Force mock data (for testing only)
 */
export async function fetchOptionsChain(ticker, optionType = 'call', options = {}) {
  const { forceMock = false } = options;

  // Simulate network delay for mock data (only when explicitly requested for testing)
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  // If forceMock is set, use mock data (testing only)
  if (forceMock) {
    await delay(200 + Math.random() * 300);
    return generateMockOptionsData(ticker, optionType);
  }

  // Track all errors for better reporting
  const errors = [];

  // Helper to build a concise error message
  function buildErrorMessage(ticker, errors) {
    // Find the most relevant error
    const polygonError = errors.find(e => e.source === 'polygon');
    const yahooError = errors.find(e => e.source === 'yahoo');

    if (polygonError && polygonError.error.includes('rate limit')) {
      return `Rate limit exceeded for ${ticker}. Please try again in a minute.`;
    }

    if (yahooError) {
      return `Unable to fetch options data for ${ticker}. Please try again later.`;
    }

    return `Unable to fetch options data for ${ticker}. Please check your connection and try again.`;
  }

  // Helper to try all available data sources
  async function tryAllSources() {
    // Check if backend is available (fastest source)
    const isBackendUp = await checkBackendHealth();

    if (isBackendUp) {
      try {
        console.log(`Fetching ${ticker} from backend server...`);
        return await fetchBackendOptions(ticker, optionType);
      } catch (error) {
        console.warn(`Backend failed for ${ticker}:`, error.message);
        errors.push({ source: 'backend', error: error.message });
        backendAvailable = false;
      }
    } else {
      errors.push({ source: 'backend', error: 'Server not running (localhost:3001)' });
    }

    // Fallback to Polygon if API key is configured
    if (POLYGON_API_KEY) {
      try {
        console.log(`Fetching ${ticker} from Polygon.io...`);
        return await fetchPolygonOptions(ticker, optionType);
      } catch (error) {
        console.warn(`Polygon failed for ${ticker}:`, error.message);
        errors.push({ source: 'polygon', error: error.message });
      }
    }

    // Try Yahoo via CORS proxy as last resort
    try {
      console.log(`Fetching ${ticker} from Yahoo Finance (CORS proxy)...`);
      return await fetchYahooOptions(ticker, optionType);
    } catch (error) {
      console.warn(`Yahoo failed for ${ticker}:`, error.message);
      errors.push({ source: 'yahoo', error: error.message });
    }

    // All sources failed - throw comprehensive error
    throw new Error(buildErrorMessage(ticker, errors));
  }

  switch (API_PROVIDER) {
    case 'backend':
      return tryAllSources();

    case 'yahoo':
      try {
        return await fetchYahooOptions(ticker, optionType);
      } catch (error) {
        throw new Error(`Yahoo Finance API failed for ${ticker}: ${error.message}. Try starting the backend server instead.`);
      }

    case 'polygon':
      // Try backend first for speed, then Polygon
      const isBackendUp = await checkBackendHealth();
      if (isBackendUp) {
        try {
          return await fetchBackendOptions(ticker, optionType);
        } catch (error) {
          console.warn(`Backend failed, trying Polygon:`, error.message);
        }
      }
      try {
        return await fetchPolygonOptions(ticker, optionType);
      } catch (error) {
        throw new Error(`Polygon.io API failed for ${ticker}: ${error.message}`);
      }

    case 'tradier':
      try {
        return await fetchTradierOptions(ticker, optionType);
      } catch (error) {
        throw new Error(`Tradier API failed for ${ticker}: ${error.message}`);
      }

    case 'mock':
      // Only use mock if explicitly configured in .env
      await delay(800 + Math.random() * 700);
      return generateMockOptionsData(ticker, optionType);

    default:
      // Default: try all sources in order of preference
      return tryAllSources();
  }
}

/**
 * Apply LEAPS scanner filters to options data
 */
export function filterHighRiskLeaps(options, filters = {}) {
  const {
    minDelta = 0.8,
    maxPrice = 5.0,
    minOpenInterest = 0,
    minDaysToExpiration = 365,
    maxIV = 1.0,
    minScore = 0,
  } = filters;

  return options.filter(option => {
    const absDelta = Math.abs(option.delta);
    const meetsDelta = absDelta >= minDelta;
    const meetsPrice = option.premium <= maxPrice;

    // Handle openInterest: if option has 0 (N/A data), skip this filter
    // Only apply filter when we have real OI data (> 0) OR filter is set to 0
    const meetsOpenInterest = minOpenInterest === 0 ||
      option.openInterest === 0 || // N/A data - include it
      option.openInterest >= minOpenInterest;

    const meetsExpiration = option.daysToExpiration >= minDaysToExpiration;

    // IV filter (only if set below 100%)
    const meetsIV = maxIV >= 1.0 || (option.iv <= maxIV);

    // Score filter (only if set above 0)
    const meetsScore = minScore === 0 || (option.score || 0) >= minScore;

    return meetsDelta && meetsPrice && meetsOpenInterest && meetsExpiration && meetsIV && meetsScore;
  });
}

/**
 * Calculate risk level based on delta and IV
 */
export function calculateRiskLevel(delta, iv) {
  const absDelta = Math.abs(delta);

  // High delta (>0.9) + low IV (<0.3) = Lower risk for LEAPS
  // Lower delta (0.8-0.9) + high IV (>0.5) = Higher risk

  if (absDelta >= 0.9 && iv < 0.35) {
    return 'low';
  } else if (absDelta >= 0.85 && iv < 0.45) {
    return 'medium';
  } else {
    return 'high';
  }
}

/**
 * Get the current API provider name
 */
export function getApiProvider() {
  return API_PROVIDER;
}

/**
 * Calculate LEAPS score for ranking options
 * Higher score = better risk-adjusted value
 *
 * The score balances:
 * - Delta (probability proxy)
 * - Price (cheaper = more leverage)
 * - Break-even distance (how far stock must move)
 * - Probability of profit estimate
 *
 * @param {Object} option - Option object with delta, premium, strike, underlyingPrice
 * @returns {number} Score value (higher is better)
 */
export function calculateLeapsScore(option) {
  const absDelta = Math.abs(option.delta);
  const price = option.premium || option.ask || 0.01;
  const strike = option.strike || 0;
  const underlyingPrice = option.underlyingPrice || strike;
  const isCall = option.optionType === 'call';

  // Calculate break-even
  const breakEven = isCall ? strike + price : strike - price;

  // Distance to break-even as percentage
  const distanceToBreakEven = isCall
    ? ((breakEven - underlyingPrice) / underlyingPrice) * 100
    : ((underlyingPrice - breakEven) / underlyingPrice) * 100;

  // Probability of profit estimate (simplified)
  // Starts with delta as base, penalizes for distance to break-even
  const probProfit = Math.max(5, (absDelta * 100) - Math.max(0, distanceToBreakEven * 1.5));

  // Value component: high delta relative to price
  const valueRatio = (absDelta * 100) / price;

  // Risk-adjusted score:
  // - probProfit: weight towards higher probability trades
  // - valueRatio: reward cheap options with high delta
  // - Penalize options where break-even is too far (>20% move needed)
  const breakEvenPenalty = distanceToBreakEven > 20 ? 0.5 : (distanceToBreakEven > 10 ? 0.75 : 1.0);

  const score = (probProfit * 0.4 + valueRatio * 0.6) * breakEvenPenalty;

  return Math.round(score * 100) / 100;
}

/**
 * Batch scan multiple tickers with rate limiting and progress callbacks
 *
 * @param {string[]} tickers - Array of ticker symbols to scan
 * @param {string} optionType - 'call' or 'put'
 * @param {Object} options - Configuration options
 * @param {Function} options.onProgress - Callback for progress updates
 * @param {Function} options.onTickerComplete - Callback when a ticker completes
 * @param {AbortSignal} options.signal - AbortController signal for cancellation
 * @param {number} options.rateLimit - Calls per minute (default 60)
 * @param {boolean} options.useMockData - Force mock data (default false - try real data first)
 * @returns {Promise<{results: Array, errors: Array, dataSource: string}>}
 */
export async function batchScanTickers(tickers, optionType, options = {}) {
  const {
    onProgress,
    onTickerComplete,
    signal,
    rateLimit = 60,
    useMockData = false // Try real data first
  } = options;

  // Reset proxy failures at start of batch
  resetProxyFailures();

  const results = [];
  const errors = [];

  // Determine delay based on provider:
  // - Backend: Fast (100ms delay, ~10 tickers/sec with server overhead)
  // - Polygon free tier: 5 calls/min, each ticker needs 2 calls = ~2.5 tickers/min
  // - Others: Based on rateLimit param
  let delayMs;
  let actualProvider = API_PROVIDER;

  // Track fallback information
  let fallbackInfo = {
    backendAttempted: false,
    backendFailed: false,
    fallbackProvider: null,
    fallbackReason: null
  };

  // Check if backend is available (for 'backend' or 'polygon' providers)
  if (API_PROVIDER === 'backend' || API_PROVIDER === 'polygon') {
    fallbackInfo.backendAttempted = true;
    const isBackendUp = await checkBackendHealth();
    if (isBackendUp) {
      actualProvider = 'backend';
      delayMs = 100; // Fast: 100ms between requests
      console.log('Backend server available: fast scanning enabled');
    } else if (API_PROVIDER === 'polygon' || POLYGON_API_KEY) {
      fallbackInfo.backendFailed = true;
      fallbackInfo.fallbackProvider = 'polygon';
      fallbackInfo.fallbackReason = 'Backend server not running (connection refused). Using Polygon.io free tier instead.';
      actualProvider = 'polygon';
      delayMs = 25000; // Slow: 25s for Polygon (2.4 tickers/min)
      console.log('Polygon free tier: scanning ~2-3 tickers per minute');
    } else {
      fallbackInfo.backendFailed = true;
      fallbackInfo.fallbackProvider = 'yahoo';
      fallbackInfo.fallbackReason = 'Backend server not running. Using Yahoo Finance via CORS proxy.';
      actualProvider = 'yahoo';
      delayMs = Math.ceil(60000 / rateLimit);
    }
  } else {
    delayMs = Math.ceil(60000 / rateLimit);
  }

  // Track data sources
  let realDataCount = 0;
  let mockDataCount = 0;

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  for (let i = 0; i < tickers.length; i++) {
    // Check for cancellation
    if (signal?.aborted) {
      break;
    }

    const ticker = tickers[i];

    // Report progress
    onProgress?.({
      currentTicker: ticker,
      currentIndex: i,
      totalTickers: tickers.length,
      percentComplete: Math.round((i / tickers.length) * 100)
    });

    try {
      const tickerOptions = await fetchOptionsChain(ticker, optionType, { forceMock: useMockData });

      // Track data source (check if options have real timestamps vs generated)
      const isRealData = tickerOptions.length > 0 &&
        tickerOptions[0].lastUpdated &&
        !tickerOptions[0].lastUpdated.includes(new Date().toISOString().split('T')[0]);

      if (isRealData || !useMockData) {
        realDataCount++;
      } else {
        mockDataCount++;
      }

      // Add score and data source to each option
      const scoredOptions = tickerOptions.map(opt => ({
        ...opt,
        score: calculateLeapsScore(opt),
        dataSource: useMockData ? 'mock' : (opt.dataSource || actualProvider)
      }));

      results.push(...scoredOptions);
      onTickerComplete?.(ticker, scoredOptions, null);
    } catch (error) {
      // Categorize and handle errors
      const errorInfo = {
        ticker,
        error: error.message,
        type: categorizeError(error)
      };

      // Handle rate limit with backoff
      if (errorInfo.type === 'rate_limit') {
        await delay(5000); // Wait 5 seconds on rate limit
        i--; // Retry this ticker
        continue;
      }

      errors.push(errorInfo);
      onTickerComplete?.(ticker, [], error);
    }

    // Rate limiting delay (skip on last ticker or if cancelled)
    if (i < tickers.length - 1 && !signal?.aborted) {
      await delay(delayMs);
    }
  }

  // Final progress update
  onProgress?.({
    currentTicker: null,
    currentIndex: tickers.length,
    totalTickers: tickers.length,
    percentComplete: 100
  });

  // Determine overall data source (use actualProvider which accounts for fallback)
  const dataSource = useMockData ? 'mock' :
    (actualProvider === 'mock' ? 'mock' : actualProvider);

  return {
    results,
    errors,
    dataSource,
    fallbackInfo,
    stats: {
      realDataCount,
      mockDataCount,
      totalScanned: realDataCount + mockDataCount
    }
  };
}

/**
 * Categorize errors for appropriate handling
 * @param {Error} error
 * @returns {string} Error type
 */
function categorizeError(error) {
  const message = error.message?.toLowerCase() || '';

  if (message.includes('429') || message.includes('rate limit')) {
    return 'rate_limit';
  }
  if (message.includes('404') || message.includes('not found')) {
    return 'not_found';
  }
  if (message.includes('no options')) {
    return 'no_options';
  }
  if (message.includes('network') || message.includes('fetch')) {
    return 'network';
  }
  if (message.includes('timeout')) {
    return 'timeout';
  }
  if (message.includes('cors')) {
    return 'cors';
  }

  return 'unknown';
}

/**
 * Get top N options sorted by score
 * @param {Array} options - Array of options with scores
 * @param {number} limit - Maximum number to return (default 50)
 * @returns {Array} Top options sorted by score descending
 */
export function getTopScoredOptions(options, limit = 50) {
  return [...options]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit);
}

export default {
  fetchOptionsChain,
  filterHighRiskLeaps,
  calculateRiskLevel,
  getApiProvider,
  calculateLeapsScore,
  batchScanTickers,
  getTopScoredOptions,
  checkDataSourceAvailability
};
