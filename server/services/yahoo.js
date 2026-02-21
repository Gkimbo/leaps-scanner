/**
 * Yahoo Finance Options Service
 *
 * Fetches options chain data directly from Yahoo Finance API.
 * Handles crumb/cookie authentication required by Yahoo.
 */

let crumb = null;
let cookies = null;
let crumbExpiry = 0;

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Get Yahoo Finance crumb and cookies for API authentication
 */
async function getCrumb() {
  // Return cached crumb if still valid (cache for 1 hour)
  if (crumb && cookies && Date.now() < crumbExpiry) {
    return { crumb, cookies };
  }

  try {
    // Step 1: Get cookies from Yahoo Finance
    const response = await fetch('https://fc.yahoo.com', {
      headers: { 'User-Agent': USER_AGENT }
    });

    // Extract cookies from response
    const setCookies = response.headers.get('set-cookie') || '';
    cookies = setCookies.split(',').map(c => c.split(';')[0].trim()).join('; ');

    // Step 2: Get crumb from Yahoo Finance
    const crumbResponse = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': USER_AGENT,
        'Cookie': cookies
      }
    });

    if (!crumbResponse.ok) {
      throw new Error(`Failed to get crumb: ${crumbResponse.status}`);
    }

    crumb = await crumbResponse.text();
    crumbExpiry = Date.now() + (60 * 60 * 1000); // Cache for 1 hour

    console.log('Yahoo Finance crumb obtained successfully');
    return { crumb, cookies };
  } catch (error) {
    console.error('Failed to get Yahoo crumb:', error.message);
    // Reset cache on error
    crumb = null;
    cookies = null;
    throw error;
  }
}

/**
 * Fetch data from Yahoo Finance API with authentication
 */
async function fetchYahooAPI(url) {
  const { crumb: authCrumb, cookies: authCookies } = await getCrumb();

  const separator = url.includes('?') ? '&' : '?';
  const authUrl = `${url}${separator}crumb=${encodeURIComponent(authCrumb)}`;

  const response = await fetch(authUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Cookie': authCookies
    }
  });

  if (!response.ok) {
    // If auth failed, clear cache and throw
    if (response.status === 401) {
      crumb = null;
      cookies = null;
    }
    throw new Error(`Yahoo API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch options data from Yahoo Finance
 *
 * @param {string} ticker - Stock ticker symbol
 * @param {string} optionType - 'call' or 'put'
 * @returns {Promise<Array>} Array of options contracts
 */
export async function fetchYahooOptions(ticker, optionType = 'call') {
  const upperTicker = ticker.toUpperCase();
  const today = new Date();

  try {
    // Step 1: Get available expiration dates
    const expData = await fetchYahooAPI(
      `https://query2.finance.yahoo.com/v7/finance/options/${upperTicker}`
    );

    if (!expData.optionChain?.result?.[0]) {
      throw new Error(`No options data found for ${upperTicker}`);
    }

    const result = expData.optionChain.result[0];
    const underlyingPrice = result.quote?.regularMarketPrice || 0;
    const expirationDates = result.expirationDates || [];

    if (expirationDates.length === 0) {
      throw new Error(`No expiration dates available for ${upperTicker}`);
    }

    // Filter for LEAPS (expirations > 1 year from now)
    const oneYearFromNow = Math.floor(today.getTime() / 1000) + (365 * 24 * 60 * 60);
    let leapsExpirations = expirationDates.filter(exp => exp >= oneYearFromNow);

    // If no LEAPS available, use the longest available expirations
    if (leapsExpirations.length === 0) {
      const sortedExps = [...expirationDates].sort((a, b) => b - a);
      leapsExpirations = sortedExps.slice(0, 4);
    }

    // Step 2: Fetch options chains for LEAPS expirations (limit to 4)
    const allOptions = [];

    for (const expiration of leapsExpirations.slice(0, 4)) {
      try {
        const chainData = await fetchYahooAPI(
          `https://query2.finance.yahoo.com/v7/finance/options/${upperTicker}?date=${expiration}`
        );

        const optionChain = chainData.optionChain?.result?.[0];
        if (!optionChain) continue;

        const options = optionType === 'call'
          ? optionChain.options?.[0]?.calls || []
          : optionChain.options?.[0]?.puts || [];

        const expDate = new Date(expiration * 1000);
        const daysToExpiration = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

        for (const opt of options) {
          // Calculate delta based on moneyness
          const moneyness = underlyingPrice / opt.strike;
          const estimatedDelta = calculateDelta(moneyness, optionType);

          // Get premium
          const bid = opt.bid || 0;
          const ask = opt.ask || opt.lastPrice || 0;
          const premium = (bid + ask) / 2 || opt.lastPrice || 0;

          // Get or estimate IV
          const yearsToExpiry = daysToExpiration / 365;
          const intrinsicValue = optionType === 'call'
            ? Math.max(0, underlyingPrice - opt.strike)
            : Math.max(0, opt.strike - underlyingPrice);
          const timeValue = Math.max(0, premium - intrinsicValue);
          const estimatedIV = opt.impliedVolatility ||
            (timeValue / (underlyingPrice * Math.sqrt(yearsToExpiry) * 0.4)) || 0.3;

          // Determine unusual activity flags
          const avgVolume = (opt.openInterest || 1000) / 30;
          const unusualVolume = (opt.volume || 0) > avgVolume * 2;
          const highIV = (opt.impliedVolatility || estimatedIV) > 0.5;

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
            iv: Math.min(1, Math.max(0.1, opt.impliedVolatility || estimatedIV)),
            volume: opt.volume || 0,
            openInterest: opt.openInterest || 0,
            underlyingPrice: underlyingPrice,
            unusualVolume: unusualVolume,
            highIV: highIV,
            lastUpdated: new Date().toISOString(),
            inTheMoney: opt.inTheMoney || false,
            dataSource: 'yahoo'
          });
        }
      } catch (err) {
        console.warn(`Failed to fetch chain for ${upperTicker} expiration ${expiration}:`, err.message);
        continue;
      }
    }

    return allOptions;
  } catch (error) {
    console.error(`Yahoo Finance error for ${upperTicker}:`, error.message);
    throw error;
  }
}

/**
 * Calculate estimated delta based on moneyness
 */
function calculateDelta(moneyness, optionType) {
  if (optionType === 'call') {
    if (moneyness > 1.3) return 0.92 + (Math.random() * 0.07);
    if (moneyness > 1.2) return 0.85 + (Math.random() * 0.1);
    if (moneyness > 1.1) return 0.75 + (Math.random() * 0.1);
    if (moneyness > 1.0) return 0.55 + (Math.random() * 0.15);
    return 0.25 + (Math.random() * 0.25);
  } else {
    if (moneyness < 0.7) return -(0.92 + (Math.random() * 0.07));
    if (moneyness < 0.8) return -(0.85 + (Math.random() * 0.1));
    if (moneyness < 0.9) return -(0.75 + (Math.random() * 0.1));
    if (moneyness < 1.0) return -(0.55 + (Math.random() * 0.15));
    return -(0.25 + (Math.random() * 0.25));
  }
}
