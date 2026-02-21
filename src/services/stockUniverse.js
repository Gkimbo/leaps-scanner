// services/stockUniverse.js

/**
 * Stock Universe for Auto-Scan
 *
 * Includes a mix of:
 * - Popular tech giants and blue chips
 * - Low-priced stocks ($5-30) where cheap high-delta LEAPS are possible
 *
 * For cheap LEAPS with delta 0.8+ and price under $5:
 * - Need underlying stock price < $30 typically
 * - Deep ITM options on low-priced stocks have affordable premiums
 */

// High-profile stocks (may have expensive options)
const POPULAR_STOCKS = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA', 'SPY',
  'AMD', 'AVGO', 'CRM', 'ADBE', 'NFLX', 'INTC', 'QCOM', 'ORCL',
  'V', 'MA', 'JPM', 'GS', 'BAC', 'WFC', 'C', 'USB',
  'XOM', 'CVX', 'COP', 'SLB', 'OXY', 'HAL', 'MPC', 'VLO',
  'UNH', 'JNJ', 'PFE', 'MRK', 'ABBV', 'LLY', 'BMY', 'AMGN',
  'KO', 'PEP', 'WMT', 'COST', 'HD', 'LOW', 'TGT', 'DG',
  'DIS', 'CMCSA', 'PARA', 'WBD', 'FOX', 'NWSA', 'VIAC',
  'BA', 'LMT', 'RTX', 'NOC', 'GD', 'CAT', 'DE', 'MMM'
];

// Low-priced stocks (< $30) - ideal for cheap LEAPS
const LOW_PRICED_STOCKS = [
  // EV & Auto
  'F', 'GM', 'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'GOEV', 'FSR',
  'WKHS', 'RIDE', 'NKLA', 'ARVL', 'FFIE', 'MULN', 'EVGO', 'CHPT',

  // Fintech & Digital Banking
  'SOFI', 'HOOD', 'UPST', 'AFRM', 'OPEN', 'LMND', 'ROOT', 'UWMC',
  'RKT', 'CLOV', 'WISH', 'BTRS', 'PAYO', 'PSFE', 'PRCH', 'OLO',

  // Tech & Software
  'PLTR', 'BB', 'NOK', 'ERIC', 'ZNGA', 'RBLX', 'SNAP', 'PINS',
  'MTCH', 'BMBL', 'PUBM', 'TTD', 'MGNI', 'APPS', 'IRNT', 'ME',

  // Telecom
  'T', 'VZ', 'TMUS', 'LUMN', 'USM', 'SHEN', 'ATUS', 'FYBR',

  // Airlines
  'AAL', 'DAL', 'UAL', 'LUV', 'JBLU', 'ALGT', 'SAVE', 'MESA',

  // Cruise & Travel
  'CCL', 'NCLH', 'RCL', 'EXPE', 'BKNG', 'ABNB', 'TRIP', 'TRVG',

  // Retail
  'M', 'JWN', 'KSS', 'GPS', 'URBN', 'ANF', 'AEO', 'EXPR',
  'BBY', 'GME', 'AMC', 'BBBY', 'WOOF', 'CHWY', 'CVNA', 'PRTY',

  // Energy & Clean Energy
  'PLUG', 'FCEL', 'BE', 'BLDP', 'SEDG', 'ENPH', 'RUN', 'NOVA',
  'ET', 'KMI', 'WMB', 'OKE', 'EPD', 'MMP', 'PAA', 'MPLX',

  // Mining & Materials
  'CLF', 'X', 'NUE', 'STLD', 'AA', 'FCX', 'TECK', 'RIO',
  'VALE', 'MT', 'SID', 'GGB', 'TX', 'CMC', 'SCCO', 'HBM',

  // Cannabis
  'TLRY', 'CGC', 'ACB', 'SNDL', 'HEXO', 'OGI', 'CRON', 'CURLF',

  // Biotech & Pharma (Small Cap)
  'MRNA', 'BNTX', 'NVAX', 'INO', 'VXRT', 'OCGN', 'SRNE', 'AGEN',
  'SAVA', 'APLS', 'HGEN', 'VRTX', 'REGN', 'BIIB', 'GILD', 'VRTX',

  // Crypto & Blockchain
  'COIN', 'MARA', 'RIOT', 'CLSK', 'HUT', 'BITF', 'BTBT', 'CIFR',
  'GREE', 'BTCM', 'CORZ', 'IREN', 'MSTR', 'SQ', 'PYPL', 'COIN',

  // REITs
  'MPW', 'OHI', 'AGNC', 'NLY', 'STWD', 'TWO', 'CIM', 'PMT',
  'RWT', 'NYMT', 'ARR', 'IVR', 'MFA', 'RC', 'BRMK', 'GPMT',

  // Industrial
  'GE', 'F', 'AAL', 'UAL', 'JBLU', 'XRX', 'HPE', 'HPQ',
  'DELL', 'WDC', 'STX', 'MU', 'QRVO', 'SWKS', 'MRVL', 'ON',

  // Entertainment & Media
  'ROKU', 'FUBO', 'AMC', 'CNK', 'IMAX', 'LGF.A', 'LION', 'MSGS',
  'EDR', 'LYV', 'NCMI', 'TGNA', 'SBGI', 'GTN', 'SSP', 'NXST',

  // Food & Beverage
  'BYND', 'TTCF', 'OTLY', 'OATLY', 'SJM', 'GIS', 'K', 'CPB',
  'MDLZ', 'HSY', 'HRL', 'TSN', 'CAG', 'KHC', 'LNDC', 'SMPL',

  // Healthcare Services
  'TDOC', 'AMWL', 'HIMS', 'TALK', 'GDRX', 'OSCR', 'ALHC', 'CANO',

  // SPACs & Special Situations
  'IPOF', 'PSTH', 'CCIV', 'GGPI', 'DCRC', 'MVST', 'DNA', 'QS',
  'CHPT', 'CLVR', 'IONQ', 'ARQQ', 'RGTI', 'QUBT', 'QBTS', 'LAES',

  // Gaming & E-sports
  'DKNG', 'PENN', 'WYNN', 'MGM', 'CZR', 'LVS', 'GENI', 'SKLZ',
  'RSI', 'BETZ', 'EVRI', 'IGT', 'AGYS', 'GAMB', 'PLTK', 'DDI',

  // Insurance
  'MET', 'PRU', 'LNC', 'VOYA', 'RGA', 'UNM', 'GL', 'AFL',
  'ALL', 'TRV', 'PGR', 'CB', 'HIG', 'AIG', 'CINF', 'L',

  // Consumer Services
  'UBER', 'LYFT', 'DASH', 'GRUB', 'BIRD', 'LIME', 'SHPW', 'CRSR',

  // Shipping & Logistics
  'ZIM', 'GOGL', 'SBLK', 'EGLE', 'NMM', 'DSX', 'GNK', 'CTRM',
  'SHIP', 'TOPS', 'SINO', 'ESEA', 'GLNG', 'FLNG', 'KNOP', 'TGP',

  // Real Estate
  'Z', 'ZG', 'RDFN', 'EXPI', 'OPEN', 'COMP', 'RLGY', 'HOUS',

  // Chinese ADRs
  'BABA', 'JD', 'PDD', 'BIDU', 'NIO', 'XPEV', 'LI', 'TAL',
  'EDU', 'BILI', 'IQ', 'TME', 'VNET', 'WB', 'YMM', 'DIDI',

  // Cybersecurity
  'CRWD', 'ZS', 'NET', 'OKTA', 'S', 'CYBR', 'TENB', 'VRNS',
  'SAIL', 'PANW', 'FTNT', 'QLYS', 'RPD', 'RBRK', 'CVLT', 'RDWR',

  // Cloud & SaaS
  'DDOG', 'SNOW', 'MDB', 'ESTC', 'CFLT', 'CLDR', 'SUMO', 'PD',
  'DT', 'NEWR', 'SPT', 'BRZE', 'DOCN', 'GTLB', 'HCP', 'ZUO',

  // Semiconductors
  'INTC', 'MU', 'QCOM', 'TXN', 'ADI', 'MCHP', 'NXPI', 'ON',
  'SWKS', 'QRVO', 'WOLF', 'CREE', 'LSCC', 'SITM', 'ALGM', 'POWI',

  // Space & Aerospace
  'RKLB', 'ASTR', 'SPCE', 'RDW', 'VORB', 'ASTS', 'BKSY', 'PL',
  'MAXR', 'IRDM', 'GSAT', 'SATS', 'VSAT', 'GILT', 'LOAR', 'HWM',

  // 3D Printing & Robotics
  'DDD', 'SSYS', 'XONE', 'NNDM', 'DM', 'MKFG', 'PRNT', 'VLD',
  'IRBT', 'PATH', 'LAZR', 'VLDR', 'OUST', 'MVIS', 'LIDR', 'INVZ',

  // Additional Low-Priced Stocks
  'SIRI', 'SIRIUS', 'WOW', 'SATS', 'BLNK', 'GOEV', 'ARVL', 'LEV',
  'XL', 'HYLN', 'RMO', 'PTRA', 'ELMS', 'SOLO', 'FUV', 'AYRO',
  'WKHS', 'RIDE', 'GOEV', 'FSR', 'VLDR', 'LAZR', 'MVIS', 'LIDR',

  // Meme Stocks & High Volatility
  'GME', 'AMC', 'BBBY', 'BB', 'NOK', 'EXPR', 'KOSS', 'NAKD',
  'SNDL', 'TLRY', 'CLOV', 'WISH', 'WKHS', 'GOEV', 'QS', 'HYLN',

  // Utilities (Often cheap options)
  'PCG', 'EXC', 'AES', 'NRG', 'VST', 'CWEN', 'BEPC', 'BEP',
  'NEP', 'NOVA', 'RUN', 'SPWR', 'FSLR', 'ENPH', 'SEDG', 'JKS',

  // Banks (Regional & Small)
  'ZION', 'KEY', 'RF', 'HBAN', 'CFG', 'MTB', 'FITB', 'CMA',
  'FRC', 'SBNY', 'WAL', 'PACW', 'FHN', 'SNV', 'UMBF', 'BOKF',

  // Additional Tech
  'CIEN', 'LITE', 'VIAV', 'COHR', 'IIVI', 'LUMENTUM', 'AAOI', 'FNSR',
  'JNPR', 'ANET', 'FFIV', 'NTAP', 'PSTG', 'NEWR', 'ESTC', 'MDB'
];

// Combine and deduplicate
const STOCK_UNIVERSE = [...new Set([...POPULAR_STOCKS, ...LOW_PRICED_STOCKS])];

// Cache for dynamic stock data
let dynamicStocksCache = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get the static stock universe (hardcoded list)
 * @returns {string[]} Array of ticker symbols
 */
export function getStockUniverse() {
  return STOCK_UNIVERSE;
}

/**
 * Fetch dynamic/trending stocks from Finnhub
 * Returns cached data if available and fresh
 *
 * @param {Object} options - Configuration options
 * @param {boolean} options.forceRefresh - Force refresh even if cached
 * @returns {Promise<Object>} Dynamic stock data
 */
export async function fetchDynamicStocks(options = {}) {
  const { forceRefresh = false, maxPrice = 50 } = options;

  // Use different cache keys for different price filters
  const cacheKey = `trending_${maxPrice}`;

  // Return cached data if fresh
  const now = Date.now();
  if (!forceRefresh && dynamicStocksCache?.key === cacheKey && (now - lastFetchTime) < CACHE_DURATION) {
    return dynamicStocksCache;
  }

  // Popular/volatile stocks under $50
  const FALLBACK_TRENDING_50 = [
    'SOFI', 'PLTR', 'NIO', 'F', 'RIVN', 'LCID', 'SNAP', 'HOOD', 'MARA', 'RIOT',
    'AMC', 'BB', 'NOK', 'AAL', 'DAL', 'UAL', 'CCL', 'NCLH', 'RCL', 'PARA',
    'WBD', 'INTC', 'T', 'VZ', 'WFC', 'C', 'BAC', 'USB', 'PFE', 'BMY',
    'DKNG', 'PENN', 'MGM', 'WYNN', 'PLUG', 'FCEL', 'CHPT', 'COIN', 'GM', 'XPEV',
    'RBLX', 'U', 'PATH', 'AFRM', 'UPST', 'LC', 'MRNA', 'BNTX', 'LUV', 'JBLU'
  ];

  // Penny stocks under $3 - high volatility, speculative
  const FALLBACK_TRENDING_3 = [
    'SIRI', 'DNA', 'TELL', 'GEVO', 'WKHS', 'GOEV', 'MULN', 'FFIE', 'NKLA', 'LAZR',
    'QS', 'SKLZ', 'WISH', 'CLOV', 'OPEN', 'BARK', 'ASTS', 'RKT', 'PSFE', 'ORGN',
    'CIFR', 'BTBT', 'ANY', 'SOS', 'CLSK', 'BITF', 'HUT', 'CORZ', 'KULR', 'BIOR',
    'SNDL', 'TLRY', 'ACB', 'CGC', 'BNGO', 'IONQ', 'FSR', 'RIDE', 'STEM', 'MVST'
  ];

  const FALLBACK_TRENDING = maxPrice <= 3 ? FALLBACK_TRENDING_3 : FALLBACK_TRENDING_50;

  try {
    // Dynamically import to avoid issues if Finnhub is not configured
    const finnhub = await import('./finnhubApi.js');

    if (!finnhub.isFinnhubConfigured()) {
      return {
        key: cacheKey,
        trending: FALLBACK_TRENDING,
        fromNews: [],
        source: 'popular',
        message: `Using popular stocks under $${maxPrice} (Finnhub API key not configured)`
      };
    }

    // Fetch trending stocks from news with appropriate price filter
    const trendingFromNews = await finnhub.fetchTrendingFromNews('general', { maxPrice });

    // Extract unique tickers
    let trendingTickers = trendingFromNews
      .slice(0, 100)
      .map(t => t.symbol)
      .filter(s => s && s.length <= 5 && /^[A-Z]+$/.test(s)); // Filter valid US tickers

    // If Finnhub returned no tickers, use fallback popular stocks
    if (trendingTickers.length === 0) {
      console.log(`Finnhub returned no trending tickers under $${maxPrice}, using fallback`);
      trendingTickers = FALLBACK_TRENDING;
    }

    // Cache the results
    dynamicStocksCache = {
      key: cacheKey,
      trending: trendingTickers,
      fromNews: trendingFromNews.slice(0, 50),
      source: trendingTickers === FALLBACK_TRENDING ? 'popular' : 'finnhub',
      fetchedAt: new Date().toISOString(),
      message: `Found ${trendingTickers.length} trending stocks under $${maxPrice}`
    };
    lastFetchTime = now;

    return dynamicStocksCache;
  } catch (error) {
    console.error('Failed to fetch dynamic stocks:', error);
    // Return fallback on error
    return {
      key: cacheKey,
      trending: FALLBACK_TRENDING,
      fromNews: [],
      source: 'popular',
      message: 'Using popular stocks (API error)'
    };
  }
}

/**
 * Get combined stock universe (static + dynamic)
 * Merges hardcoded list with trending stocks from Finnhub
 *
 * @param {Object} options - Configuration options
 * @param {boolean} options.includeTrending - Include trending stocks
 * @param {boolean} options.trendingOnly - Only return trending stocks
 * @param {number} options.maxPrice - Max stock price filter (50 or 3)
 * @returns {Promise<Object>} Combined stock data
 */
export async function getEnhancedStockUniverse(options = {}) {
  const {
    includeTrending = true,
    trendingOnly = false,
    maxPrice = 50
  } = options;

  const staticStocks = [...STOCK_UNIVERSE];
  let trendingStocks = [];
  let dynamicData = null;

  if (includeTrending || trendingOnly) {
    dynamicData = await fetchDynamicStocks({ maxPrice });
    trendingStocks = dynamicData.trending || [];
  }

  // If trendingOnly, return only trending stocks (no static list)
  if (trendingOnly) {
    return {
      stocks: trendingStocks,
      staticCount: 0,
      trendingCount: trendingStocks.length,
      totalCount: trendingStocks.length,
      source: dynamicData?.source || 'finnhub',
      trendingData: dynamicData,
      maxPrice
    };
  }

  // Otherwise return static stocks only (trending is handled separately)
  return {
    stocks: staticStocks,
    staticCount: staticStocks.length,
    trendingCount: 0,
    totalCount: staticStocks.length,
    source: 'static',
    trendingData: null
  };
}

/**
 * Clear the dynamic stocks cache
 */
export function clearDynamicCache() {
  dynamicStocksCache = null;
  lastFetchTime = 0;
}

// Export for testing
export { STOCK_UNIVERSE, POPULAR_STOCKS, LOW_PRICED_STOCKS };
