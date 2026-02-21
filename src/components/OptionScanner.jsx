import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Loader2,
  Table,
  LayoutGrid,
  RefreshCw,
  AlertCircle,
  Wifi,
  WifiOff,
  Info,
  ExternalLink,
  Scan,
  StopCircle,
  RotateCcw,
  TrendingUp,
  Zap,
  CheckCircle2
} from 'lucide-react';

import FiltersPanel from './FiltersPanel';
import OptionsTable from './OptionsTable';
import { OptionCardsGrid } from './OptionCard';
import SummaryPanel from './SummaryPanel';
import ScanProgressBar from './ScanProgressBar';
import CalculatorModal from './CalculatorModal';
import { fetchOptionsChain, filterHighRiskLeaps, getApiProvider, calculateLeapsScore, checkDataSourceAvailability } from '../services/optionsApi';
import { useAutoScan } from '../hooks/useAutoScan';
import { getStockUniverse } from '../services/stockUniverse';
import { isFinnhubConfigured } from '../services/finnhubApi';
import { singleTickerCache } from '../services/scanCache';

// Default filter values for high-risk LEAPS
const DEFAULT_FILTERS = {
  minDelta: 0.8,
  maxPrice: 5.0,
  minOpenInterest: 0,
  minDaysToExpiration: 365,
  maxIV: 1.0,
  minScore: 0
};

// Popular tickers for quick access
const POPULAR_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'SPY'];

/**
 * OptionScanner Component
 *
 * Main dashboard component that orchestrates the LEAPS scanner:
 * - Search by ticker symbol
 * - Toggle between calls/puts
 * - Filter options based on criteria
 * - Display results in table or card view
 */
export default function OptionScanner() {
  // State management
  const [ticker, setTicker] = useState('');
  const [searchedTicker, setSearchedTicker] = useState('');
  const [optionType, setOptionType] = useState('call');
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'cards'
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [scanMode, setScanMode] = useState('single'); // 'single' or 'auto'

  // Data states
  const [rawOptions, setRawOptions] = useState([]);
  const [filteredOptions, setFilteredOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dataAge, setDataAge] = useState(null); // Track when data was fetched
  const [isFromCache, setIsFromCache] = useState(false);

  // Calculator modal state
  const [calculatorOption, setCalculatorOption] = useState(null);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);

  // Connectivity and data source state
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [dataSourceStatus, setDataSourceStatus] = useState(null);

  // Finnhub/Trending state
  const finnhubAvailable = isFinnhubConfigured();

  // API provider info
  const apiProvider = getApiProvider();

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check data source availability on mount and periodically
  useEffect(() => {
    const checkSources = async () => {
      try {
        const status = await checkDataSourceAvailability();
        setDataSourceStatus(status);
      } catch (e) {
        console.warn('Failed to check data sources:', e);
      }
    };
    checkSources();

    // Re-check every 30 seconds
    const interval = setInterval(checkSources, 30000);
    return () => clearInterval(interval);
  }, []);

  // Trending stocks toggle and price filter
  const [includeTrending, setIncludeTrending] = useState(false);
  const [trendingMaxPrice, setTrendingMaxPrice] = useState(50); // 50 = under $50, 3 = under $3

  // Auto-scan hook
  const {
    scanStatus,
    progress,
    results: autoScanResults,
    errors: autoScanErrors,
    startScan,
    stopScan,
    resetScan,
    refreshScan,
    isScanning,
    isComplete,
    hasErrors,
    estimatedTimeRemaining,
    tickersInResults,
    stockSource,
    dataSource,
    fallbackInfo,
    cacheInfo
  } = useAutoScan({
    optionType,
    filters,
    maxResults: 50,
    rateLimit: 60,
    includeTrending,
    trendingMaxPrice
  });

  // Determine which results to display based on scan mode
  const displayOptions = scanMode === 'auto' ? autoScanResults : filteredOptions;
  const displayTicker = scanMode === 'auto'
    ? `Top 50 (${tickersInResults.length} tickers)`
    : searchedTicker;

  // Apply filters whenever raw options or filters change
  useEffect(() => {
    if (rawOptions.length > 0) {
      const filtered = filterHighRiskLeaps(rawOptions, filters);
      // Sort by lowest price first
      filtered.sort((a, b) => a.premium - b.premium);
      setFilteredOptions(filtered);
    } else {
      setFilteredOptions([]);
    }
  }, [rawOptions, filters]);

  // Fetch options data (with caching)
  const handleSearch = useCallback(async (tickerSymbol = ticker, forceRefresh = false) => {
    if (!tickerSymbol.trim()) {
      setError('Please enter a ticker symbol');
      return;
    }

    const upperTicker = tickerSymbol.toUpperCase().trim();
    setSearchedTicker(upperTicker);
    setError(null);

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cachedData = singleTickerCache.get(upperTicker, optionType);
      if (cachedData) {
        setRawOptions(cachedData);
        setIsFromCache(true);
        setDataAge(singleTickerCache.getAge(upperTicker, optionType));
        console.log(`Using cached data for ${upperTicker} (${singleTickerCache.getAge(upperTicker, optionType)})`);
        return;
      }
    }

    setIsLoading(true);
    setIsFromCache(false);

    try {
      const options = await fetchOptionsChain(upperTicker, optionType);
      // Add score to each option for filtering and display
      const scoredOptions = options.map(opt => ({
        ...opt,
        score: calculateLeapsScore(opt)
      }));

      // Cache the results
      singleTickerCache.set(upperTicker, optionType, scoredOptions);
      setRawOptions(scoredOptions);
      setDataAge('Just now');

      if (scoredOptions.length === 0) {
        setError(`No LEAPS options found for ${upperTicker}. Try a different ticker.`);
      }
    } catch (err) {
      console.error('Error fetching options:', err);
      setError(err.message || 'Failed to fetch options data. Please try again.');
      setRawOptions([]);
      setFilteredOptions([]);
    } finally {
      setIsLoading(false);
    }
  }, [ticker, optionType]);

  // Handle ticker input change
  const handleTickerChange = (e) => {
    setTicker(e.target.value.toUpperCase());
    setError(null);
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    handleSearch();
  };

  // Handle option type toggle
  const handleOptionTypeChange = (type) => {
    setOptionType(type);
    if (searchedTicker) {
      // Automatically refresh when switching types
      setRawOptions([]);
      setFilteredOptions([]);
      setTimeout(() => handleSearch(searchedTicker), 100);
    }
  };

  // Reset filters
  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  // Open calculator for an option
  const handleOpenCalculator = useCallback((option) => {
    setCalculatorOption(option);
    setIsCalculatorOpen(true);
  }, []);

  // Quick ticker selection
  const handleQuickTicker = (tickerSymbol) => {
    setTicker(tickerSymbol);
    handleSearch(tickerSymbol);
  };

  return (
    <div className="min-h-screen p-4 lg:p-6">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white mb-1">
              High Risk <span className="gradient-text">LEAPS Scanner</span>
            </h1>
            <p className="text-sm text-gray-400">
              Scan for aggressive long-term options plays with high delta and low premiums
            </p>
          </div>

          {/* External Links & API Status */}
          <div className="flex items-center gap-3">
            {/* Trading Platform Links */}
            <a
              href="https://www.gurufocus.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 bg-trading-card
                       border border-trading-border rounded-lg hover:border-neon-blue
                       hover:bg-trading-hover transition-all duration-200 group"
            >
              <span className="text-xs text-gray-400 group-hover:text-white">GuruFocus</span>
              <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-neon-blue" />
            </a>

            <a
              href="https://trade.thinkorswim.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 bg-trading-card
                       border border-trading-border rounded-lg hover:border-neon-purple
                       hover:bg-trading-hover transition-all duration-200 group"
            >
              <span className="text-xs text-gray-400 group-hover:text-white">Thinkorswim</span>
              <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-neon-purple" />
            </a>

            {/* Connection Status Indicator */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all
                           ${!isOnline
                             ? 'bg-bear/20 border-bear/30'
                             : dataSourceStatus?.backendUp
                               ? 'bg-bull/10 border-bull/30'
                               : 'bg-trading-card border-trading-border'
                           }`}>
              {!isOnline ? (
                <>
                  <WifiOff className="w-4 h-4 text-bear animate-pulse" />
                  <span className="text-xs text-bear font-medium">Offline</span>
                </>
              ) : dataSourceStatus?.backendUp ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-bull" />
                  <span className="text-xs text-bull">Connected</span>
                </>
              ) : (
                <>
                  <Wifi className="w-4 h-4 text-gray-400" />
                  <span className="text-xs text-gray-400">Online</span>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.header>

      {/* Offline Warning */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6"
          >
            <div className="p-4 bg-gradient-to-r from-bear/10 to-risk-medium/10 border border-bear/30 rounded-xl">
              <div className="flex items-start gap-3">
                <WifiOff className="w-6 h-6 text-bear flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-bear mb-1">No Internet Connection</h3>
                  <p className="text-sm text-gray-300">
                    Unable to fetch market data. Please check your internet connection and try again.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Search Section - Only show in single ticker mode */}
      <AnimatePresence>
        {scanMode === 'single' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-trading-card border border-trading-border rounded-xl p-4 mb-6 card-glow"
          >
            <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row gap-4">
          {/* Ticker Input */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={ticker}
                onChange={handleTickerChange}
                placeholder="Enter ticker symbol (e.g., AAPL)"
                className="w-full pl-10 pr-4 py-3 bg-black/30 border border-trading-border
                         rounded-lg text-white placeholder-gray-500 focus:outline-none
                         focus:border-neon-blue focus:ring-1 focus:ring-neon-blue/50
                         transition-all duration-200"
              />
            </div>
          </div>

          {/* Option Type Toggle */}
          <div className="flex bg-black/30 rounded-lg p-1 border border-trading-border">
            <button
              type="button"
              onClick={() => handleOptionTypeChange('call')}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all
                        ${optionType === 'call'
                  ? 'bg-bull text-white'
                  : 'text-gray-400 hover:text-white'
                }`}
            >
              Calls
            </button>
            <button
              type="button"
              onClick={() => handleOptionTypeChange('put')}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all
                        ${optionType === 'put'
                  ? 'bg-bear text-white'
                  : 'text-gray-400 hover:text-white'
                }`}
            >
              Puts
            </button>
          </div>

          {/* Search Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-3 bg-neon-blue text-white font-medium rounded-lg
                     hover:bg-neon-blue/80 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-200 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Scan
              </>
            )}
          </button>
        </form>

        {/* Popular Tickers */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Popular:</span>
          {POPULAR_TICKERS.map((t) => (
            <button
              key={t}
              onClick={() => handleQuickTicker(t)}
              className={`px-2 py-1 text-xs rounded-md transition-all
                        ${searchedTicker === t
                  ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/30'
                  : 'bg-black/30 text-gray-400 hover:text-white border border-transparent'
                }`}
            >
              {t}
            </button>
          ))}
        </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scan Mode Toggle */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-trading-card border border-trading-border rounded-xl p-4 mb-6"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Mode Toggle */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">Mode:</span>
            <div className="flex bg-black/30 rounded-lg p-1 border border-trading-border">
              <button
                onClick={() => {
                  setScanMode('single');
                  resetScan();
                }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all
                          ${scanMode === 'single'
                    ? 'bg-neon-blue/20 text-neon-blue'
                    : 'text-gray-400 hover:text-white'
                  }`}
              >
                Single Ticker
              </button>
              <button
                onClick={() => setScanMode('auto')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all
                          ${scanMode === 'auto'
                    ? 'bg-neon-purple/20 text-neon-purple'
                    : 'text-gray-400 hover:text-white'
                  }`}
              >
                Auto-Scan{includeTrending ? '' : ` (${apiProvider === 'polygon' ? '25' : getStockUniverse().length} Stocks)`}
              </button>
            </div>
          </div>

          {/* Scan Controls (only in auto mode) */}
          {scanMode === 'auto' && (
            <div className="flex items-center gap-3">
              {/* Trending Toggle */}
              {!isScanning && !isComplete && (
                <div className="relative group">
                  <button
                    onClick={() => finnhubAvailable && setIncludeTrending(!includeTrending)}
                    disabled={!finnhubAvailable}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all
                              ${!finnhubAvailable
                      ? 'bg-trading-card text-gray-600 border-trading-border cursor-not-allowed opacity-50'
                      : includeTrending
                        ? 'bg-neon-green/20 text-neon-green border-neon-green/30'
                        : 'bg-trading-card text-gray-400 border-trading-border hover:text-white'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-sm">Trending</span>
                    {includeTrending && finnhubAvailable && <Zap className="w-3 h-3" />}
                  </button>
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2
                                bg-trading-card border border-trading-border rounded-lg shadow-xl
                                opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none
                                whitespace-nowrap z-50">
                    {finnhubAvailable ? (
                      <span className="text-xs text-gray-300">
                        {includeTrending ? 'Trending stocks enabled' : 'Include trending stocks from Finnhub'}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">
                        Finnhub API key not configured
                      </span>
                    )}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1
                                  border-4 border-transparent border-t-trading-border"></div>
                  </div>
                </div>
              )}

              {/* Price Filter - Only show when Trending is enabled */}
              {!isScanning && !isComplete && includeTrending && (
                <div className="flex items-center gap-1 p-1 bg-trading-card border border-trading-border rounded-lg">
                  <button
                    onClick={() => setTrendingMaxPrice(50)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-all
                              ${trendingMaxPrice === 50
                      ? 'bg-neon-blue/20 text-neon-blue'
                      : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    ≤$50
                  </button>
                  <button
                    onClick={() => setTrendingMaxPrice(3)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-all
                              ${trendingMaxPrice === 3
                      ? 'bg-neon-purple/20 text-neon-purple'
                      : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    ≤$3
                  </button>
                </div>
              )}

              {!isScanning && !isComplete && (
                <button
                  onClick={startScan}
                  className="flex items-center gap-2 px-4 py-2 bg-neon-purple text-white
                           font-medium rounded-lg hover:bg-neon-purple/80 transition-all"
                >
                  <Scan className="w-5 h-5" />
                  Start Scan
                </button>
              )}

              {isScanning && (
                <button
                  onClick={stopScan}
                  className="flex items-center gap-2 px-4 py-2 bg-bear text-white
                           font-medium rounded-lg hover:bg-bear/80 transition-all"
                >
                  <StopCircle className="w-5 h-5" />
                  Stop
                </button>
              )}

              {isComplete && (
                <>
                  <button
                    onClick={resetScan}
                    className="flex items-center gap-2 px-3 py-2 bg-trading-card
                             text-gray-400 border border-trading-border rounded-lg
                             hover:text-white hover:border-neon-blue transition-all"
                  >
                    <RotateCcw className="w-4 h-4" />
                    New Scan
                  </button>
                  <button
                    onClick={refreshScan}
                    className="flex items-center gap-2 px-3 py-2 bg-neon-purple/20
                             text-neon-purple border border-neon-purple/30 rounded-lg
                             hover:bg-neon-purple/30 transition-all"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refresh Data
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Progress Bar (only during active scan) */}
        <AnimatePresence>
          {scanMode === 'auto' && isScanning && (
            <ScanProgressBar
              progress={progress}
              estimatedTimeRemaining={estimatedTimeRemaining}
              errors={autoScanErrors}
              resultsFound={autoScanResults.length}
              apiProvider={apiProvider}
            />
          )}
        </AnimatePresence>

        {/* Scan Error Display */}
        <AnimatePresence>
          {scanMode === 'auto' && scanStatus === 'error' && autoScanErrors.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 p-4 bg-bear/10 border border-bear/30 rounded-xl"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-bear flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-bear font-medium mb-1">Scan Failed</p>
                  <p className="text-sm text-gray-300">
                    {autoScanErrors[0]?.error || 'An error occurred while starting the scan.'}
                  </p>
                  <button
                    onClick={resetScan}
                    className="mt-3 px-3 py-1.5 text-sm text-gray-400 hover:text-white
                             bg-trading-card border border-trading-border rounded-lg
                             hover:border-gray-500 transition-all"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Data Source Info */}
        <AnimatePresence>
          {scanMode === 'auto' && (isScanning || isComplete) && fallbackInfo?.backendFailed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 p-3 bg-black/30 border border-trading-border rounded-lg"
            >
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-400">Data source:</span>
                <span className="flex items-center gap-1.5 px-2 py-1 bg-neon-blue/10 rounded-lg text-neon-blue font-medium capitalize">
                  <Wifi className="w-3 h-3" />
                  {fallbackInfo.fallbackProvider}
                </span>
                {fallbackInfo.fallbackProvider === 'polygon' && (
                  <span className="text-xs text-gray-500">
                    (Rate limited - scanning may take longer)
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* API Error Warning */}
        {scanMode === 'auto' && isComplete && autoScanErrors.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 p-3 bg-bear/10 border border-bear/30 rounded-lg"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-bear flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-bear font-medium">
                  Some Tickers Failed
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {autoScanErrors.length} of {progress.totalTickers} tickers failed.
                  Some tickers may not have LEAPS options available.
                </p>
                <details className="mt-2">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                    Show errors ({autoScanErrors.length})
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                    {autoScanErrors.slice(0, 30).map(err => (
                      <span key={err.ticker} className="px-2 py-0.5 bg-bear/20 text-bear text-xs rounded" title={err.error}>
                        {err.ticker}
                      </span>
                    ))}
                    {autoScanErrors.length > 30 && (
                      <span className="text-xs text-gray-500">+{autoScanErrors.length - 30} more</span>
                    )}
                  </div>
                </details>
              </div>
            </div>
          </motion.div>
        )}

        {/* Auto-scan results summary */}
        {scanMode === 'auto' && isComplete && autoScanResults.length > 0 && (
          <div className="mt-4 pt-4 border-t border-trading-border/50">
            {/* Cache status indicator */}
            {cacheInfo?.isFromCache && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <div className="w-2 h-2 bg-amber-400 rounded-full"></div>
                <span className="text-xs text-amber-400">
                  Using cached data from {cacheInfo.cacheAge}
                </span>
                <span className="text-xs text-gray-500">•</span>
                <span className="text-xs text-gray-500">
                  Click "Refresh Data" to fetch new data
                </span>
              </div>
            )}
            {/* Data source info */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-xs text-gray-500">Data:</span>
              <span className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full
                             ${dataSource.provider === 'backend' || dataSource.provider === 'yahoo'
                ? 'bg-bull/20 text-bull'
                : dataSource.provider === 'polygon'
                ? 'bg-neon-blue/20 text-neon-blue'
                : dataSource.provider === 'mock'
                  ? 'bg-risk-medium/20 text-risk-medium'
                  : 'bg-gray-700 text-gray-400'
              }`}>
                <Wifi className="w-3 h-3" />
                {dataSource.provider === 'backend' ? 'Yahoo Finance' :
                 dataSource.provider === 'polygon' ? 'Polygon.io' :
                 dataSource.provider === 'yahoo' ? 'Yahoo Finance' :
                 dataSource.provider}
              </span>

              {/* Stock source info */}
              <span className="text-xs text-gray-500">•</span>
              <span className="text-xs text-gray-500">Stocks:</span>
              <span className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full
                             ${stockSource.source === 'finnhub'
                ? 'bg-neon-green/10 text-neon-green'
                : stockSource.source === 'polygon-limited'
                ? 'bg-neon-blue/10 text-neon-blue'
                : 'bg-gray-700 text-gray-400'
              }`}>
                {stockSource.source === 'finnhub' ? (
                  <>
                    <TrendingUp className="w-3 h-3" />
                    Finnhub Trending
                  </>
                ) : stockSource.source === 'polygon-limited' ? (
                  'Low-priced (free tier limit)'
                ) : (
                  'Static List'
                )}
              </span>
              {stockSource.trendingCount > 0 && (
                <span className="text-xs text-gray-500">
                  ({stockSource.trendingCount} trending + {stockSource.staticCount} base)
                </span>
              )}
              <span className="text-xs text-gray-500">
                • Scanned {stockSource.totalCount || progress.totalTickers} stocks
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-400">Found in:</span>
              {tickersInResults.slice(0, 15).map(t => (
                <span
                  key={t}
                  className="px-2 py-0.5 bg-neon-purple/10 text-neon-purple text-xs rounded-full"
                >
                  {t}
                </span>
              ))}
              {tickersInResults.length > 15 && (
                <span className="text-xs text-gray-500">
                  +{tickersInResults.length - 15} more
                </span>
              )}
            </div>
          </div>
        )}
      </motion.div>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6"
          >
            <div className="p-4 bg-bear/10 border border-bear/30 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-bear flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-bear font-medium mb-2">Failed to fetch options data</p>
                  <p className="text-sm text-gray-300">{error}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter Warning - when we have raw data but filters exclude everything */}
      <AnimatePresence>
        {!isLoading && rawOptions.length > 0 && filteredOptions.length === 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6"
          >
            <div className="flex items-start gap-3 p-4 bg-neon-blue/10 border border-neon-blue/30 rounded-xl">
              <Info className="w-5 h-5 text-neon-blue flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-neon-blue font-medium">
                  No contracts match your filter criteria
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Found {rawOptions.length} options total. Try lowering the minimum delta,
                  increasing max price, or reducing the minimum expiration days.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters Panel - Left Sidebar */}
        <div className="lg:col-span-1">
          <FiltersPanel
            filters={filters}
            onFilterChange={setFilters}
            onReset={handleResetFilters}
          />
        </div>

        {/* Results Panel - Main Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Summary Panel */}
          <SummaryPanel
            options={displayOptions}
            ticker={displayTicker}
            isAutoScan={scanMode === 'auto'}
          />

          {/* View Mode Toggle & Refresh */}
          <div className="flex items-center justify-between">
            <div className="flex bg-black/30 rounded-lg p-1 border border-trading-border">
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all
                          ${viewMode === 'table'
                    ? 'bg-trading-card text-white'
                    : 'text-gray-400 hover:text-white'
                  }`}
              >
                <Table className="w-4 h-4" />
                Table
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all
                          ${viewMode === 'cards'
                    ? 'bg-trading-card text-white'
                    : 'text-gray-400 hover:text-white'
                  }`}
              >
                <LayoutGrid className="w-4 h-4" />
                Cards
              </button>
            </div>

            {scanMode === 'single' && searchedTicker && (
              <div className="flex items-center gap-3">
                {dataAge && (
                  <span className={`text-xs ${isFromCache ? 'text-amber-400' : 'text-gray-500'}`}>
                    {isFromCache ? `Cached: ${dataAge}` : `Fetched: ${dataAge}`}
                  </span>
                )}
                <button
                  onClick={() => handleSearch(searchedTicker, true)}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400
                           hover:text-white transition-all disabled:opacity-50"
                  title="Force refresh from API"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            )}
          </div>

          {/* Results Display */}
          <AnimatePresence mode="wait">
            {viewMode === 'table' ? (
              <motion.div
                key="table"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <OptionsTable
                  options={displayOptions}
                  isLoading={scanMode === 'single' ? isLoading : (isScanning && displayOptions.length === 0)}
                  onCalculate={handleOpenCalculator}
                />
              </motion.div>
            ) : (
              <motion.div
                key="cards"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <OptionCardsGrid
                  options={displayOptions}
                  isLoading={scanMode === 'single' ? isLoading : (isScanning && displayOptions.length === 0)}
                  onCalculate={handleOpenCalculator}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8 pt-6 border-t border-trading-border text-center"
      >
        <p className="text-xs text-gray-500">
          High Risk LEAPS Scanner • Options trading involves substantial risk of loss •
          Not financial advice
        </p>
      </motion.footer>

      {/* Calculator Modal */}
      <CalculatorModal
        option={calculatorOption}
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
      />
    </div>
  );
}
