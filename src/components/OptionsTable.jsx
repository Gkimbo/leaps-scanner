import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronUp,
  ChevronDown,
  TrendingUp,
  AlertTriangle,
  Zap,
  Activity,
  Calculator,
  ThumbsUp,
  ThumbsDown,
  Eye,
  EyeOff
} from 'lucide-react';
import { calculateRiskLevel } from '../services/optionsApi';

/**
 * Calculate recommendation for an option
 * Returns: 'BUY' | 'SELL' | 'WATCH' | 'DONT_WATCH'
 */
const calculateRecommendation = (option) => {
  if (!option) return { recommendation: null, score: 0 };

  const premium = option.premium || option.ask || 0;
  const strike = option.strike;
  const underlyingPrice = option.underlyingPrice;
  const isCall = option.optionType === 'call';
  const iv = option.iv || 0.3;
  const yearsToExpiry = option.daysToExpiration / 365;
  const riskFreeRate = 0.05;

  // Standard normal CDF approximation
  const normalCDF = (x) => {
    if (x < 0) return 1 - normalCDF(-x);
    const a1 = 0.319381530, a2 = -0.356563782, a3 = 1.781477937;
    const a4 = -1.821255978, a5 = 1.330274429, p = 0.2316419;
    const t = 1.0 / (1.0 + p * x);
    const pdf = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
    return 1 - pdf * t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  };

  // Calculate d2 from Black-Scholes
  const calcD2 = (S, K, vol, T) => {
    if (T <= 0 || vol <= 0) return 0;
    return (Math.log(S / K) + (riskFreeRate - vol * vol / 2) * T) / (vol * Math.sqrt(T));
  };

  // Break-even price
  const breakEven = isCall ? strike + premium : strike - premium;

  // Distance to break-even
  const distanceToBreakEven = isCall
    ? ((breakEven - underlyingPrice) / underlyingPrice) * 100
    : ((underlyingPrice - breakEven) / underlyingPrice) * 100;

  // Probability of profit
  const calcProbReachingPrice = (target) => {
    if (yearsToExpiry <= 0 || iv <= 0) return 50;
    const d2 = calcD2(underlyingPrice, target, iv, yearsToExpiry);
    const probAbove = normalCDF(d2) * 100;
    return isCall ? probAbove : (100 - probAbove);
  };
  const probProfit = calcProbReachingPrice(breakEven);

  // Expected move and profit potential
  const expectedMove = underlyingPrice * iv * Math.sqrt(yearsToExpiry);
  const oneSigmaTarget = isCall ? underlyingPrice + expectedMove : underlyingPrice - expectedMove;
  const intrinsicAtTarget = isCall
    ? Math.max(0, oneSigmaTarget - strike)
    : Math.max(0, strike - oneSigmaTarget);
  const profitAtTarget = intrinsicAtTarget * 100 - premium * 100;
  const riskRewardRatio = premium > 0 ? profitAtTarget / (premium * 100) : 0;

  // Current intrinsic and time value
  const currentIntrinsic = isCall
    ? Math.max(0, underlyingPrice - strike)
    : Math.max(0, strike - underlyingPrice);
  const timeValue = premium - currentIntrinsic;

  // Calculate expected return
  const avgProfitIfWin = Math.max(0, profitAtTarget);
  const expectedValue = (probProfit / 100 * avgProfitIfWin) - ((100 - probProfit) / 100 * premium * 100);
  const expectedReturn = premium > 0 ? (expectedValue / (premium * 100)) * 100 : 0;

  // Score components
  const scores = {
    probScore: Math.min(100, probProfit * 1.2),
    rrScore: Math.min(100, Math.max(0, riskRewardRatio) * 40),
    erScore: Math.min(100, Math.max(0, 50 + Math.min(expectedReturn, 100) * 0.5)),
    timeEfficiency: timeValue <= 0 ? 100 : Math.max(0, 100 - (timeValue / premium) * 100),
    breakEvenScore: distanceToBreakEven <= 0 ? 100 : Math.max(0, 100 - distanceToBreakEven * 5)
  };

  // Calculate weighted score (probability weighted more heavily)
  let score = (
    scores.probScore * 0.40 +
    scores.rrScore * 0.20 +
    scores.erScore * 0.15 +
    scores.timeEfficiency * 0.15 +
    scores.breakEvenScore * 0.10
  );

  // Cap score based on probability thresholds
  // High scores should require reasonable probability
  if (probProfit < 30) {
    score = Math.min(score, 45);
  } else if (probProfit < 40) {
    score = Math.min(score, 60);
  } else if (probProfit < 50) {
    score = Math.min(score, 75);
  }

  // Determine recommendation
  let recommendation;
  if (score >= 65 && probProfit >= 45 && riskRewardRatio >= 0.8) {
    recommendation = 'BUY';
  } else if (score >= 50 && probProfit >= 35) {
    recommendation = 'WATCH';
  } else if (score < 35 || probProfit < 25 || riskRewardRatio < 0.3) {
    recommendation = 'DONT_WATCH';
  } else {
    recommendation = 'WATCH';
  }

  // Override to SELL if particularly unfavorable
  if (probProfit < 20 || (riskRewardRatio < 0.25 && probProfit < 40)) {
    recommendation = 'SELL';
  }

  return { recommendation, score };
};

/**
 * OptionsTable Component
 *
 * Displays filtered options in a sortable table format with:
 * - Sortable columns (click header to sort)
 * - Risk indicator badges
 * - Unusual volume/high IV highlighting
 * - Smooth row animations
 */
export default function OptionsTable({ options, isLoading, onCalculate }) {
  const [sortConfig, setSortConfig] = useState({
    key: 'premium',
    direction: 'asc'
  });

  // Sort options based on current sort configuration
  const sortedOptions = useMemo(() => {
    if (!options || options.length === 0) return [];

    return [...options].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Handle special cases
      if (sortConfig.key === 'delta') {
        aValue = Math.abs(aValue);
        bValue = Math.abs(bValue);
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [options, sortConfig]);

  // Handle column header click for sorting
  const handleSort = (key) => {
    setSortConfig(prevConfig => ({
      key,
      direction:
        prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Render sort indicator
  const SortIndicator = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return <span className="w-4 h-4" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ChevronUp className="w-4 h-4 text-neon-blue" />
    ) : (
      <ChevronDown className="w-4 h-4 text-neon-blue" />
    );
  };

  // Column headers configuration
  const columns = [
    { key: 'symbol', label: 'Symbol', align: 'left' },
    { key: 'optionType', label: 'Type', align: 'center' },
    { key: 'strike', label: 'Strike', align: 'right' },
    { key: 'premium', label: 'Price', align: 'right' },
    { key: 'recommendation', label: 'Rec', align: 'center', noSort: true },
    { key: 'score', label: 'Score', align: 'right' },
    { key: 'delta', label: 'Delta', align: 'right' },
    { key: 'iv', label: 'IV', align: 'right' },
    { key: 'openInterest', label: 'Open Int', align: 'right' },
    { key: 'expiration', label: 'Expiration', align: 'right' },
    { key: 'risk', label: 'Risk', align: 'center' },
    { key: 'calc', label: '', align: 'center', noSort: true }
  ];

  // Recommendation badge component
  const RecommendationBadge = ({ option }) => {
    const { recommendation, score } = calculateRecommendation(option);

    if (!recommendation) return <span className="text-gray-600">—</span>;

    const config = {
      BUY: {
        bg: 'bg-bull/20',
        text: 'text-bull',
        icon: ThumbsUp,
        label: 'BUY'
      },
      SELL: {
        bg: 'bg-bear/20',
        text: 'text-bear',
        icon: ThumbsDown,
        label: 'SELL'
      },
      WATCH: {
        bg: 'bg-neon-blue/20',
        text: 'text-neon-blue',
        icon: Eye,
        label: 'WATCH'
      },
      DONT_WATCH: {
        bg: 'bg-gray-700/50',
        text: 'text-gray-500',
        icon: EyeOff,
        label: 'SKIP'
      }
    };

    const { bg, text, icon: Icon, label } = config[recommendation];

    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
          <Icon className="w-3 h-3" />
          {label}
        </span>
        <span className="text-[10px] text-gray-500 font-mono">{score.toFixed(0)}</span>
      </div>
    );
  };

  // Risk badge component
  const RiskBadge = ({ delta, iv }) => {
    const risk = calculateRiskLevel(delta, iv);
    const config = {
      low: {
        bg: 'bg-risk-low/20',
        text: 'text-risk-low',
        label: 'Low'
      },
      medium: {
        bg: 'bg-risk-medium/20',
        text: 'text-risk-medium',
        label: 'Med'
      },
      high: {
        bg: 'bg-risk-high/20',
        text: 'text-risk-high',
        label: 'High'
      }
    };

    const { bg, text, label } = config[risk];

    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
        {label}
      </span>
    );
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="bg-trading-card border border-trading-border rounded-xl overflow-hidden">
        <div className="p-4">
          <div className="animate-pulse space-y-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="h-6 bg-gray-700 rounded w-16" />
                <div className="h-6 bg-gray-700 rounded w-12" />
                <div className="h-6 bg-gray-700 rounded w-20" />
                <div className="h-6 bg-gray-700 rounded w-16" />
                <div className="h-6 bg-gray-700 rounded flex-1" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!options || options.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-trading-card border border-trading-border rounded-xl p-12 text-center"
      >
        <Activity className="w-12 h-12 mx-auto text-gray-600 mb-4" />
        <h3 className="text-lg font-medium text-gray-400 mb-2">
          No contracts found
        </h3>
        <p className="text-sm text-gray-500">
          Try adjusting your filters or search for a different ticker
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="bg-trading-card border border-trading-border rounded-xl overflow-hidden card-glow"
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-trading-border">
              {columns.map((column) => (
                <th
                  key={column.key}
                  onClick={() => !column.noSort && column.key !== 'risk' && handleSort(column.key)}
                  className={`px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider
                             ${!column.noSort ? 'cursor-pointer hover:text-white' : ''} transition-colors
                             ${column.align === 'left' ? 'text-left' : ''}
                             ${column.align === 'center' ? 'text-center' : ''}
                             ${column.align === 'right' ? 'text-right' : ''}`}
                >
                  <div className={`flex items-center gap-1
                                 ${column.align === 'right' ? 'justify-end' : ''}
                                 ${column.align === 'center' ? 'justify-center' : ''}`}>
                    <span>{column.label}</span>
                    {!column.noSort && column.key !== 'risk' && <SortIndicator columnKey={column.key} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {sortedOptions.map((option, index) => (
                <motion.tr
                  key={option.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2, delay: index * 0.02 }}
                  className="border-b border-trading-border/50 table-row-hover transition-colors"
                >
                  {/* Symbol */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">
                        {option.symbol}
                      </span>
                      {/* Highlight badges */}
                      <div className="flex gap-1">
                        {option.estimated && (
                          <span className="px-1.5 py-0.5 bg-gray-700/50 text-gray-400 text-xs rounded"
                                title="Greeks are estimated (Polygon free tier)">
                            Est
                          </span>
                        )}
                        {option.unusualVolume && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5
                                         bg-neon-purple/20 text-neon-purple text-xs rounded">
                            <Zap className="w-3 h-3" />
                            Vol
                          </span>
                        )}
                        {option.highIV && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5
                                         bg-risk-medium/20 text-risk-medium text-xs rounded">
                            <AlertTriangle className="w-3 h-3" />
                            IV
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Type */}
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium
                                ${option.optionType === 'call'
                          ? 'bg-bull/20 text-bull'
                          : 'bg-bear/20 text-bear'
                        }`}
                    >
                      {option.optionType.toUpperCase()}
                    </span>
                  </td>

                  {/* Strike */}
                  <td className="px-4 py-3 text-right font-mono text-gray-300">
                    ${option.strike.toFixed(2)}
                  </td>

                  {/* Premium */}
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-neon-green font-medium">
                      ${option.premium.toFixed(2)}
                    </span>
                  </td>

                  {/* Recommendation */}
                  <td className="px-4 py-3 text-center">
                    <RecommendationBadge option={option} />
                  </td>

                  {/* Score */}
                  <td className="px-4 py-3 text-right">
                    <span className={`font-mono font-medium ${
                      option.score >= 50 ? 'text-neon-green' :
                      option.score >= 20 ? 'text-neon-blue' :
                      'text-gray-400'
                    }`}>
                      {option.score?.toFixed(1) || '—'}
                    </span>
                  </td>

                  {/* Delta */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-mono text-gray-300">
                        {option.delta.toFixed(3)}
                      </span>
                      {Math.abs(option.delta) >= 0.9 && (
                        <TrendingUp className="w-4 h-4 text-bull" />
                      )}
                    </div>
                  </td>

                  {/* IV */}
                  <td className="px-4 py-3 text-right font-mono text-gray-300">
                    {(option.iv * 100).toFixed(1)}%
                  </td>

                  {/* Open Interest */}
                  <td className="px-4 py-3 text-right font-mono text-gray-400">
                    {option.openInterest > 0 ? option.openInterest.toLocaleString() : (
                      <span className="text-gray-600">N/A</span>
                    )}
                  </td>

                  {/* Expiration */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end">
                      <span className="text-gray-300">{option.expiration}</span>
                      <span className="text-xs text-gray-500">
                        {option.daysToExpiration} days
                      </span>
                    </div>
                  </td>

                  {/* Risk */}
                  <td className="px-4 py-3 text-center">
                    <RiskBadge delta={option.delta} iv={option.iv} />
                  </td>

                  {/* Calculator */}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => onCalculate?.(option)}
                      className="p-1.5 text-gray-400 hover:text-neon-purple hover:bg-neon-purple/10
                               rounded-lg transition-colors"
                      title="Open Calculator"
                    >
                      <Calculator className="w-4 h-4" />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
