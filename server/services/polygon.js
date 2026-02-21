/**
 * Polygon.io Options Service
 *
 * Fetches options chain data from Polygon.io API.
 * Requires API key (set POLYGON_API_KEY env var or pass as parameter)
 */

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || process.env.VITE_POLYGON_API_KEY;

// Cache for stock prices (to reduce API calls)
const priceCache = new Map();
const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch current stock price from Polygon
 */
async function fetchStockPrice(ticker, apiKey) {
  const upperTicker = ticker.toUpperCase();

  // Check cache
  const cached = priceCache.get(upperTicker);
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
    return cached.price;
  }

  try {
    // Try previous day close first (more reliable)
    const prevResponse = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${upperTicker}/prev?apiKey=${apiKey}`
    );

    if (prevResponse.ok) {
      const data = await prevResponse.json();
      const price = data.results?.[0]?.c || 0;
      if (price > 0) {
        priceCache.set(upperTicker, { price, timestamp: Date.now() });
        return price;
      }
    }

    // Fallback: Try snapshot
    const snapshotResponse = await fetch(
      `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${upperTicker}?apiKey=${apiKey}`
    );

    if (snapshotResponse.ok) {
      const data = await snapshotResponse.json();
      const price = data.ticker?.day?.c || data.ticker?.prevDay?.c || 0;
      if (price > 0) {
        priceCache.set(upperTicker, { price, timestamp: Date.now() });
        return price;
      }
    }
  } catch (e) {
    console.warn(`Failed to fetch price for ${upperTicker}:`, e.message);
  }

  return 0;
}

/**
 * Fetch options data from Polygon.io
 *
 * @param {string} ticker - Stock ticker symbol
 * @param {string} optionType - 'call' or 'put'
 * @param {string} apiKey - Optional API key override
 * @returns {Promise<Array>} Array of options contracts
 */
export async function fetchPolygonOptions(ticker, optionType = 'call', apiKey = null) {
  const key = apiKey || POLYGON_API_KEY;

  if (!key) {
    throw new Error('Polygon API key not configured. Set POLYGON_API_KEY environment variable.');
  }

  const upperTicker = ticker.toUpperCase();
  const today = new Date();
  const oneYearOut = new Date(today);
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);

  try {
    // Step 1: Get underlying stock price
    const underlyingPrice = await fetchStockPrice(upperTicker, key);

    if (underlyingPrice === 0) {
      console.warn(`Could not get price for ${upperTicker}, estimates will be inaccurate`);
    }

    // Step 2: Get options contracts - LEAPS (1+ year expiration)
    const contractsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?` +
      `underlying_ticker=${upperTicker}&` +
      `contract_type=${optionType}&` +
      `expiration_date.gte=${oneYearOut.toISOString().split('T')[0]}&` +
      `expired=false&` +
      `limit=100&` +
      `apiKey=${key}`
    );

    if (!contractsResponse.ok) {
      if (contractsResponse.status === 403) {
        throw new Error('Polygon API access denied. Check your API key.');
      }
      if (contractsResponse.status === 429) {
        throw new Error('Polygon rate limit exceeded. Wait and try again.');
      }
      throw new Error(`Polygon API error: ${contractsResponse.status}`);
    }

    const contractsData = await contractsResponse.json();
    const contracts = contractsData.results || [];

    if (contracts.length === 0) {
      // Try without the expiration filter for stocks without LEAPS
      const fallbackResponse = await fetch(
        `https://api.polygon.io/v3/reference/options/contracts?` +
        `underlying_ticker=${upperTicker}&` +
        `contract_type=${optionType}&` +
        `expired=false&` +
        `limit=50&` +
        `order=desc&` +
        `sort=expiration_date&` +
        `apiKey=${key}`
      );

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        contracts.push(...(fallbackData.results || []));
      }
    }

    if (contracts.length === 0) {
      return [];
    }

    // Step 3: Build options with estimated Greeks
    const allOptions = [];

    for (const contract of contracts) {
      const strike = contract.strike_price;
      const daysToExpiration = Math.ceil(
        (new Date(contract.expiration_date) - today) / (1000 * 60 * 60 * 24)
      );
      const yearsToExpiration = daysToExpiration / 365;

      // Calculate moneyness for Greek estimation
      // For calls: ITM when stock > strike (moneyness > 1)
      // For puts: ITM when stock < strike (moneyness < 1)
      const moneyness = underlyingPrice > 0 ? underlyingPrice / strike : 1;

      // Estimate delta based on moneyness (more accurate calculation)
      const estimatedDelta = calculateDelta(moneyness, optionType, yearsToExpiration);

      // Estimate IV based on typical market conditions
      const atmIV = 0.30; // Assume 30% ATM IV as baseline
      const skewFactor = Math.abs(1 - moneyness) * 0.5; // IV skew
      const estimatedIV = Math.min(1.0, Math.max(0.15, atmIV + skewFactor));

      // Estimate premium using Black-Scholes approximation
      let estimatedPremium = 0;
      if (underlyingPrice > 0) {
        const intrinsicValue = optionType === 'call'
          ? Math.max(0, underlyingPrice - strike)
          : Math.max(0, strike - underlyingPrice);

        // Time value approximation
        const timeValue = underlyingPrice * estimatedIV * Math.sqrt(yearsToExpiration) * 0.4;

        // For deep ITM options, time value is smaller
        const adjustedTimeValue = timeValue * (1 - Math.min(0.8, Math.abs(estimatedDelta) - 0.5));

        estimatedPremium = Math.round((intrinsicValue + Math.max(0.1, adjustedTimeValue)) * 100) / 100;
      }

      allOptions.push({
        id: contract.ticker,
        symbol: upperTicker,
        optionType: contract.contract_type,
        strike: strike,
        expiration: contract.expiration_date,
        daysToExpiration: daysToExpiration,
        premium: estimatedPremium,
        bid: Math.round((estimatedPremium * 0.97) * 100) / 100,
        ask: Math.round((estimatedPremium * 1.03) * 100) / 100,
        delta: Math.round(estimatedDelta * 1000) / 1000,
        gamma: Math.round((0.02 / Math.sqrt(yearsToExpiration)) * 10000) / 10000,
        theta: Math.round((-estimatedPremium / daysToExpiration) * 1000) / 1000,
        vega: Math.round((underlyingPrice * Math.sqrt(yearsToExpiration) * 0.01) * 100) / 100,
        iv: Math.round(estimatedIV * 1000) / 1000,
        volume: 0, // Not available on free tier
        openInterest: 0, // Not available on free tier
        underlyingPrice: underlyingPrice,
        unusualVolume: false,
        highIV: estimatedIV > 0.5,
        lastUpdated: new Date().toISOString(),
        dataSource: 'polygon',
        estimated: true
      });
    }

    return allOptions;
  } catch (error) {
    console.error(`Polygon error for ${upperTicker}:`, error.message);
    throw error;
  }
}

/**
 * Calculate estimated delta based on moneyness using a simplified model
 * This approximates the Black-Scholes delta
 */
function calculateDelta(moneyness, optionType, yearsToExpiry) {
  // Simple delta approximation based on moneyness and time
  // More time = delta closer to 0.5 for ATM options
  // Less time = delta more extreme (closer to 0 or 1)

  const timeAdjustment = Math.sqrt(yearsToExpiry);

  if (optionType === 'call') {
    if (moneyness >= 1.5) return 0.98;
    if (moneyness >= 1.4) return 0.95;
    if (moneyness >= 1.3) return 0.92;
    if (moneyness >= 1.2) return 0.87;
    if (moneyness >= 1.15) return 0.82;
    if (moneyness >= 1.1) return 0.75;
    if (moneyness >= 1.05) return 0.65;
    if (moneyness >= 1.0) return 0.52 + (timeAdjustment * 0.03);
    if (moneyness >= 0.95) return 0.42;
    if (moneyness >= 0.9) return 0.32;
    if (moneyness >= 0.85) return 0.22;
    if (moneyness >= 0.8) return 0.15;
    return 0.08;
  } else {
    // Put delta (negative)
    if (moneyness <= 0.5) return -0.98;
    if (moneyness <= 0.6) return -0.95;
    if (moneyness <= 0.7) return -0.92;
    if (moneyness <= 0.8) return -0.87;
    if (moneyness <= 0.85) return -0.82;
    if (moneyness <= 0.9) return -0.75;
    if (moneyness <= 0.95) return -0.65;
    if (moneyness <= 1.0) return -0.52 - (timeAdjustment * 0.03);
    if (moneyness <= 1.05) return -0.42;
    if (moneyness <= 1.1) return -0.32;
    if (moneyness <= 1.15) return -0.22;
    if (moneyness <= 1.2) return -0.15;
    return -0.08;
  }
}
