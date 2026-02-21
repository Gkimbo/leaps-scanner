/**
 * Mock Options Data
 * Realistic test data for options contracts
 */

// Mock option contract that passes all default filters
export const mockHighDeltaOption = {
  id: 'AAPL-C-150-2026-01-16',
  symbol: 'AAPL',
  optionType: 'call',
  strike: 150,
  expiration: '2026-01-16',
  daysToExpiration: 400,
  premium: 3.50,
  bid: 3.45,
  ask: 3.55,
  delta: 0.92,
  gamma: 0.015,
  theta: -0.02,
  vega: 0.25,
  iv: 0.28,
  volume: 1500,
  openInterest: 25000,
  underlyingPrice: 185,
  unusualVolume: false,
  highIV: false,
  lastUpdated: '2025-01-15T10:30:00Z'
};

// Mock option with unusual volume
export const mockUnusualVolumeOption = {
  id: 'TSLA-C-200-2026-01-16',
  symbol: 'TSLA',
  optionType: 'call',
  strike: 200,
  expiration: '2026-01-16',
  daysToExpiration: 400,
  premium: 4.25,
  bid: 4.20,
  ask: 4.30,
  delta: 0.88,
  gamma: 0.018,
  theta: -0.025,
  vega: 0.30,
  iv: 0.45,
  volume: 5000,
  openInterest: 15000,
  underlyingPrice: 245,
  unusualVolume: true,
  highIV: false,
  lastUpdated: '2025-01-15T10:30:00Z'
};

// Mock option with high IV
export const mockHighIVOption = {
  id: 'NVDA-C-800-2026-01-16',
  symbol: 'NVDA',
  optionType: 'call',
  strike: 800,
  expiration: '2026-01-16',
  daysToExpiration: 400,
  premium: 4.80,
  bid: 4.75,
  ask: 4.85,
  delta: 0.85,
  gamma: 0.012,
  theta: -0.03,
  vega: 0.35,
  iv: 0.58,
  volume: 2000,
  openInterest: 30000,
  underlyingPrice: 880,
  unusualVolume: false,
  highIV: true,
  lastUpdated: '2025-01-15T10:30:00Z'
};

// Mock put option
export const mockPutOption = {
  id: 'SPY-P-550-2026-01-16',
  symbol: 'SPY',
  optionType: 'put',
  strike: 550,
  expiration: '2026-01-16',
  daysToExpiration: 400,
  premium: 2.80,
  bid: 2.75,
  ask: 2.85,
  delta: -0.90,
  gamma: 0.010,
  theta: -0.015,
  vega: 0.20,
  iv: 0.22,
  volume: 3000,
  openInterest: 45000,
  underlyingPrice: 510,
  unusualVolume: false,
  highIV: false,
  lastUpdated: '2025-01-15T10:30:00Z'
};

// Option that fails delta filter (too low)
export const mockLowDeltaOption = {
  id: 'AAPL-C-200-2026-01-16',
  symbol: 'AAPL',
  optionType: 'call',
  strike: 200,
  expiration: '2026-01-16',
  daysToExpiration: 400,
  premium: 1.50,
  bid: 1.45,
  ask: 1.55,
  delta: 0.55,
  gamma: 0.025,
  theta: -0.01,
  vega: 0.15,
  iv: 0.32,
  volume: 500,
  openInterest: 10000,
  underlyingPrice: 185,
  unusualVolume: false,
  highIV: false,
  lastUpdated: '2025-01-15T10:30:00Z'
};

// Option that fails price filter (too expensive)
export const mockExpensiveOption = {
  id: 'MSFT-C-350-2026-01-16',
  symbol: 'MSFT',
  optionType: 'call',
  strike: 350,
  expiration: '2026-01-16',
  daysToExpiration: 400,
  premium: 12.50,
  bid: 12.40,
  ask: 12.60,
  delta: 0.92,
  gamma: 0.008,
  theta: -0.04,
  vega: 0.40,
  iv: 0.25,
  volume: 800,
  openInterest: 20000,
  underlyingPrice: 420,
  unusualVolume: false,
  highIV: false,
  lastUpdated: '2025-01-15T10:30:00Z'
};

// Option that fails expiration filter (too short)
export const mockShortExpirationOption = {
  id: 'GOOGL-C-160-2025-06-20',
  symbol: 'GOOGL',
  optionType: 'call',
  strike: 160,
  expiration: '2025-06-20',
  daysToExpiration: 180,
  premium: 2.00,
  bid: 1.95,
  ask: 2.05,
  delta: 0.88,
  gamma: 0.020,
  theta: -0.025,
  vega: 0.18,
  iv: 0.30,
  volume: 1200,
  openInterest: 18000,
  underlyingPrice: 175,
  unusualVolume: false,
  highIV: false,
  lastUpdated: '2025-01-15T10:30:00Z'
};

// Collection of options that pass default filters
export const mockFilteredOptions = [
  mockHighDeltaOption,
  mockUnusualVolumeOption,
  mockHighIVOption,
  mockPutOption
];

// Collection of all mock options including those that fail filters
export const mockAllOptions = [
  mockHighDeltaOption,
  mockUnusualVolumeOption,
  mockHighIVOption,
  mockPutOption,
  mockLowDeltaOption,
  mockExpensiveOption,
  mockShortExpirationOption
];

// Default filter values
export const defaultFilters = {
  minDelta: 0.8,
  maxPrice: 5.0,
  minOpenInterest: 0,
  minDaysToExpiration: 365
};

// Yahoo Finance mock response
export const mockYahooResponse = {
  optionChain: {
    result: [{
      quote: {
        regularMarketPrice: 185.50
      },
      expirationDates: [1737072000, 1768608000, 1800144000], // Unix timestamps
      options: [{
        calls: [
          {
            contractSymbol: 'AAPL260116C00150000',
            strike: 150,
            bid: 35.50,
            ask: 36.00,
            lastPrice: 35.75,
            volume: 1500,
            openInterest: 25000,
            impliedVolatility: 0.28,
            inTheMoney: true
          },
          {
            contractSymbol: 'AAPL260116C00180000',
            strike: 180,
            bid: 12.50,
            ask: 13.00,
            lastPrice: 12.75,
            volume: 2500,
            openInterest: 35000,
            impliedVolatility: 0.32,
            inTheMoney: true
          }
        ],
        puts: [
          {
            contractSymbol: 'AAPL260116P00200000',
            strike: 200,
            bid: 18.50,
            ask: 19.00,
            lastPrice: 18.75,
            volume: 1800,
            openInterest: 22000,
            impliedVolatility: 0.30,
            inTheMoney: true
          }
        ]
      }]
    }]
  }
};
