import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  TrendingUp,
  BarChart3,
  DollarSign,
  AlertCircle
} from 'lucide-react';
import { calculateRiskLevel } from '../services/optionsApi';

/**
 * SummaryPanel Component
 *
 * Displays summary statistics for the current scan results:
 * - Total contracts found
 * - Average delta
 * - Average IV
 * - Risk distribution
 *
 * @param {Object} props
 * @param {Array} props.options - Array of filtered options
 * @param {string} props.ticker - Ticker symbol or description
 * @param {boolean} props.isAutoScan - Whether this is auto-scan mode
 */
export default function SummaryPanel({ options, ticker, isAutoScan = false }) {
  // Calculate summary statistics
  const stats = useMemo(() => {
    if (!options || options.length === 0) {
      return null;
    }

    const totalContracts = options.length;
    const avgDelta = options.reduce((sum, o) => sum + Math.abs(o.delta), 0) / totalContracts;
    const avgIV = options.reduce((sum, o) => sum + o.iv, 0) / totalContracts;
    const avgPrice = options.reduce((sum, o) => sum + o.premium, 0) / totalContracts;
    const lowestPrice = Math.min(...options.map(o => o.premium));
    const highestDelta = Math.max(...options.map(o => Math.abs(o.delta)));

    // Count unusual volume and high IV contracts
    const unusualVolumeCount = options.filter(o => o.unusualVolume).length;
    const highIVCount = options.filter(o => o.highIV).length;

    // Risk distribution
    const riskCounts = { low: 0, medium: 0, high: 0 };
    options.forEach(o => {
      const risk = calculateRiskLevel(o.delta, o.iv);
      riskCounts[risk]++;
    });

    // Unique tickers (for auto-scan mode)
    const uniqueTickers = [...new Set(options.map(o => o.symbol))];

    // Average score (for auto-scan mode)
    const avgScore = options.reduce((sum, o) => sum + (o.score || 0), 0) / totalContracts;

    return {
      totalContracts,
      avgDelta,
      avgIV,
      avgPrice,
      lowestPrice,
      highestDelta,
      unusualVolumeCount,
      highIVCount,
      riskCounts,
      uniqueTickers,
      avgScore
    };
  }, [options]);

  if (!stats) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-trading-card border border-trading-border rounded-xl p-4"
      >
        <div className="flex items-center gap-2 text-gray-400">
          <AlertCircle className="w-5 h-5" />
          <span>
            {isAutoScan
              ? 'Click "Start Scan" to scan all stocks'
              : 'Search for a ticker to see summary'}
          </span>
        </div>
      </motion.div>
    );
  }

  // Stat card component
  const StatCard = ({ icon: Icon, label, value, subValue, color = 'neon-blue' }) => (
    <div className="bg-black/20 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 text-${color}`} />
        <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      {subValue && <p className="text-xs text-gray-500 mt-1">{subValue}</p>}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-trading-card border border-trading-border rounded-xl p-5 card-glow"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full pulse-live ${isAutoScan ? 'bg-neon-purple' : 'bg-neon-green'}`} />
          <h3 className="text-lg font-semibold text-white">
            {isAutoScan ? (
              <>
                Top 50 Results:{' '}
                <span className="text-neon-purple">
                  {stats.uniqueTickers.length} Tickers
                </span>
              </>
            ) : (
              <>
                Scan Results: <span className="gradient-text">{ticker}</span>
              </>
            )}
          </h3>
        </div>
        <span className="text-sm text-gray-400">
          {stats.totalContracts} contracts
          {isAutoScan && stats.avgScore > 0 && (
            <span className="ml-2 text-neon-purple">
              Avg Score: {stats.avgScore.toFixed(1)}
            </span>
          )}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard
          icon={FileText}
          label="Contracts"
          value={stats.totalContracts}
          subValue={`Lowest: $${stats.lowestPrice.toFixed(2)}`}
        />
        <StatCard
          icon={TrendingUp}
          label="Avg Delta"
          value={stats.avgDelta.toFixed(3)}
          subValue={`Max: ${stats.highestDelta.toFixed(3)}`}
          color="bull"
        />
        <StatCard
          icon={BarChart3}
          label="Avg IV"
          value={`${(stats.avgIV * 100).toFixed(1)}%`}
          subValue={`${stats.highIVCount} high IV`}
          color="neon-purple"
        />
        <StatCard
          icon={DollarSign}
          label="Avg Price"
          value={`$${stats.avgPrice.toFixed(2)}`}
          subValue="per contract"
          color="neon-green"
        />
      </div>

      {/* Risk Distribution */}
      <div className="pt-4 border-t border-trading-border">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">
          Risk Distribution
        </p>
        <div className="flex gap-3">
          {/* Low Risk */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-risk-low">Low</span>
              <span className="text-xs text-gray-400">{stats.riskCounts.low}</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: `${(stats.riskCounts.low / stats.totalContracts) * 100}%`
                }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="h-full bg-risk-low rounded-full"
              />
            </div>
          </div>

          {/* Medium Risk */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-risk-medium">Medium</span>
              <span className="text-xs text-gray-400">{stats.riskCounts.medium}</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: `${(stats.riskCounts.medium / stats.totalContracts) * 100}%`
                }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="h-full bg-risk-medium rounded-full"
              />
            </div>
          </div>

          {/* High Risk */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-risk-high">High</span>
              <span className="text-xs text-gray-400">{stats.riskCounts.high}</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: `${(stats.riskCounts.high / stats.totalContracts) * 100}%`
                }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="h-full bg-risk-high rounded-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Alerts Section */}
      {(stats.unusualVolumeCount > 0 || stats.highIVCount > 0) && (
        <div className="mt-4 pt-4 border-t border-trading-border">
          <div className="flex flex-wrap gap-2">
            {stats.unusualVolumeCount > 0 && (
              <motion.span
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="flex items-center gap-1 px-2 py-1 bg-neon-purple/20
                         text-neon-purple text-xs rounded-lg"
              >
                {stats.unusualVolumeCount} with unusual volume
              </motion.span>
            )}
            {stats.highIVCount > 0 && (
              <motion.span
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex items-center gap-1 px-2 py-1 bg-risk-medium/20
                         text-risk-medium text-xs rounded-lg"
              >
                {stats.highIVCount} with high IV
              </motion.span>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
