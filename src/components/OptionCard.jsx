import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  BarChart3,
  Zap,
  AlertTriangle,
  Calculator
} from 'lucide-react';
import { calculateRiskLevel } from '../services/optionsApi';

/**
 * OptionCard Component
 *
 * Card-based display for individual option contracts
 * Alternative to table view for a more visual layout
 */
export default function OptionCard({ option, index, onCalculate }) {
  const {
    symbol,
    optionType,
    strike,
    premium,
    delta,
    iv,
    openInterest,
    volume,
    expiration,
    daysToExpiration,
    unusualVolume,
    highIV,
    underlyingPrice,
    score,
    estimated
  } = option;

  const risk = calculateRiskLevel(delta, iv);
  const isCall = optionType === 'call';

  // Risk badge styling
  const riskConfig = {
    low: {
      bg: 'from-risk-low/20 to-risk-low/5',
      border: 'border-risk-low/30',
      text: 'text-risk-low',
      label: 'Low Risk'
    },
    medium: {
      bg: 'from-risk-medium/20 to-risk-medium/5',
      border: 'border-risk-medium/30',
      text: 'text-risk-medium',
      label: 'Medium Risk'
    },
    high: {
      bg: 'from-risk-high/20 to-risk-high/5',
      border: 'border-risk-high/30',
      text: 'text-risk-high',
      label: 'High Risk'
    }
  };

  const { bg, border, text, label } = riskConfig[risk];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      whileHover={{ scale: 1.02, y: -4 }}
      className={`bg-gradient-to-br ${bg} border ${border}
                  rounded-xl p-4 card-glow transition-all duration-300
                  hover:shadow-lg cursor-pointer`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-bold text-white">{symbol}</h3>
            <span
              className={`px-2 py-0.5 rounded text-xs font-semibold
                        ${isCall ? 'bg-bull/20 text-bull' : 'bg-bear/20 text-bear'}`}
            >
              {optionType.toUpperCase()}
            </span>
            {estimated && (
              <span className="px-1.5 py-0.5 bg-gray-700/50 text-gray-400 text-xs rounded"
                    title="Greeks are estimated (Polygon free tier)">
                Est
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">
            ${strike.toFixed(2)} Strike
          </p>
        </div>

        {/* Score & Risk Badge */}
        <div className="flex flex-col items-end gap-1">
          {score !== undefined && (
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
              score >= 50 ? 'bg-neon-green/20 text-neon-green' :
              score >= 20 ? 'bg-neon-blue/20 text-neon-blue' :
              'bg-gray-700/50 text-gray-400'
            }`}>
              Score: {score.toFixed(1)}
            </span>
          )}
          <span className={`px-2 py-1 rounded-lg text-xs font-medium ${text} bg-black/20`}>
            {label}
          </span>
        </div>
      </div>

      {/* Price Section */}
      <div className="bg-black/20 rounded-lg p-3 mb-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-neon-green">
            ${premium.toFixed(2)}
          </span>
          <span className="text-sm text-gray-400">per contract</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Underlying: ${underlyingPrice?.toFixed(2) || 'N/A'}
        </p>
      </div>

      {/* Greeks & Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Delta */}
        <div className="bg-black/10 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-1">
            {isCall ? (
              <TrendingUp className="w-3 h-3 text-bull" />
            ) : (
              <TrendingDown className="w-3 h-3 text-bear" />
            )}
            <span className="text-xs text-gray-400">Delta</span>
          </div>
          <p className="text-sm font-mono font-medium text-white">
            {delta.toFixed(3)}
          </p>
        </div>

        {/* IV */}
        <div className="bg-black/10 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-1">
            <BarChart3 className="w-3 h-3 text-neon-purple" />
            <span className="text-xs text-gray-400">IV</span>
            {highIV && <AlertTriangle className="w-3 h-3 text-risk-medium" />}
          </div>
          <p className="text-sm font-mono font-medium text-white">
            {(iv * 100).toFixed(1)}%
          </p>
        </div>

        {/* Open Interest */}
        <div className="bg-black/10 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-xs text-gray-400">Open Int</span>
          </div>
          <p className="text-sm font-mono font-medium text-white">
            {openInterest > 0 ? openInterest.toLocaleString() : (
              <span className="text-gray-500">N/A</span>
            )}
          </p>
        </div>

        {/* Volume */}
        <div className="bg-black/10 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-xs text-gray-400">Volume</span>
            {unusualVolume && <Zap className="w-3 h-3 text-neon-purple" />}
          </div>
          <p className="text-sm font-mono font-medium text-white">
            {volume > 0 ? volume.toLocaleString() : (
              <span className="text-gray-500">N/A</span>
            )}
          </p>
        </div>
      </div>

      {/* Expiration Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-white/10">
        <div className="flex items-center gap-2 text-gray-400">
          <Clock className="w-4 h-4" />
          <span className="text-sm">{expiration}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {daysToExpiration} days
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCalculate?.(option);
            }}
            className="p-1.5 text-gray-400 hover:text-neon-purple hover:bg-neon-purple/10
                     rounded-lg transition-colors"
            title="Open Calculator"
          >
            <Calculator className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Alert Badges */}
      {(unusualVolume || highIV) && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-white/10">
          {unusualVolume && (
            <span className="flex items-center gap-1 px-2 py-1 bg-neon-purple/20
                           text-neon-purple text-xs rounded-lg">
              <Zap className="w-3 h-3" />
              Unusual Volume
            </span>
          )}
          {highIV && (
            <span className="flex items-center gap-1 px-2 py-1 bg-risk-medium/20
                           text-risk-medium text-xs rounded-lg">
              <AlertTriangle className="w-3 h-3" />
              High IV
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}

/**
 * OptionCards Grid Component
 *
 * Container for rendering multiple OptionCard components
 */
export function OptionCardsGrid({ options, isLoading, onCalculate }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="bg-trading-card border border-trading-border rounded-xl p-4 animate-pulse"
          >
            <div className="flex justify-between mb-4">
              <div className="h-6 bg-gray-700 rounded w-20" />
              <div className="h-6 bg-gray-700 rounded w-16" />
            </div>
            <div className="h-12 bg-gray-700 rounded mb-4" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-16 bg-gray-700 rounded" />
              <div className="h-16 bg-gray-700 rounded" />
              <div className="h-16 bg-gray-700 rounded" />
              <div className="h-16 bg-gray-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!options || options.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {options.map((option, index) => (
        <OptionCard key={option.id} option={option} index={index} onCalculate={onCalculate} />
      ))}
    </div>
  );
}
