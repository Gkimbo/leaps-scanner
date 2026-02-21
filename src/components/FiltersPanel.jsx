import { motion } from 'framer-motion';
import { SlidersHorizontal, RotateCcw } from 'lucide-react';

/**
 * FiltersPanel Component
 *
 * Provides filter controls for the LEAPS scanner including:
 * - Minimum delta slider
 * - Maximum price slider
 * - Minimum expiration days slider
 */
export default function FiltersPanel({ filters, onFilterChange, onReset }) {
  const handleSliderChange = (key, value) => {
    onFilterChange({ ...filters, [key]: parseFloat(value) });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-trading-card border border-trading-border rounded-xl p-5 card-glow"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-5 h-5 text-neon-blue" />
          <h3 className="text-lg font-semibold text-white">Filters</h3>
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400
                     hover:text-white hover:bg-trading-hover rounded-lg transition-all duration-200"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
      </div>

      {/* Filter Sliders */}
      <div className="space-y-6">
        {/* Minimum Delta */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm text-gray-400">Minimum Delta</label>
            <span className="text-sm font-mono text-neon-blue">
              {filters.minDelta.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="0.99"
            step="0.01"
            value={filters.minDelta}
            onChange={(e) => handleSliderChange('minDelta', e.target.value)}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>0.50</span>
            <span>0.99</span>
          </div>
        </div>

        {/* Maximum Price */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm text-gray-400">Maximum Price ($)</label>
            <span className="text-sm font-mono text-neon-blue">
              ${filters.maxPrice.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            step="1"
            value={filters.maxPrice}
            onChange={(e) => handleSliderChange('maxPrice', e.target.value)}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>$1</span>
            <span>$100</span>
          </div>
        </div>

        {/* Minimum Open Interest */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm text-gray-400">Min Open Interest</label>
            <span className="text-sm font-mono text-neon-blue">
              {filters.minOpenInterest.toLocaleString()}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="50000"
            step="500"
            value={filters.minOpenInterest}
            onChange={(e) => handleSliderChange('minOpenInterest', e.target.value)}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>0</span>
            <span>50,000</span>
          </div>
        </div>

        {/* Minimum Days to Expiration */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm text-gray-400">Min Days to Expiry</label>
            <span className="text-sm font-mono text-neon-blue">
              {filters.minDaysToExpiration} days
            </span>
          </div>
          <input
            type="range"
            min="180"
            max="730"
            step="30"
            value={filters.minDaysToExpiration}
            onChange={(e) => handleSliderChange('minDaysToExpiration', e.target.value)}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>6 months</span>
            <span>2 years</span>
          </div>
        </div>

        {/* Maximum IV */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm text-gray-400">Maximum IV</label>
            <span className="text-sm font-mono text-neon-blue">
              {filters.maxIV >= 1.0 ? 'Any' : `${(filters.maxIV * 100).toFixed(0)}%`}
            </span>
          </div>
          <input
            type="range"
            min="0.2"
            max="1.0"
            step="0.05"
            value={filters.maxIV}
            onChange={(e) => handleSliderChange('maxIV', e.target.value)}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>20%</span>
            <span>Any</span>
          </div>
        </div>

        {/* Minimum Score */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm text-gray-400">Min LEAPS Score</label>
            <span className="text-sm font-mono text-neon-blue">
              {filters.minScore === 0 ? 'Any' : filters.minScore}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="30"
            step="1"
            value={filters.minScore}
            onChange={(e) => handleSliderChange('minScore', e.target.value)}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Any</span>
            <span>30+</span>
          </div>
          <p className="text-xs text-gray-600">
            Higher scores = better probability-adjusted value
          </p>
        </div>
      </div>

      {/* Active Filters Summary */}
      <div className="mt-6 pt-4 border-t border-trading-border">
        <p className="text-xs text-gray-500 mb-2">Active Criteria:</p>
        <div className="flex flex-wrap gap-2">
          <span className="px-2 py-1 bg-neon-blue/10 text-neon-blue text-xs rounded-full">
            Delta ≥ {filters.minDelta.toFixed(2)}
          </span>
          <span className="px-2 py-1 bg-neon-purple/10 text-neon-purple text-xs rounded-full">
            Price ≤ ${filters.maxPrice.toFixed(2)}
          </span>
          {filters.minOpenInterest > 0 && (
            <span className="px-2 py-1 bg-risk-medium/10 text-risk-medium text-xs rounded-full">
              OI ≥ {filters.minOpenInterest.toLocaleString()}
            </span>
          )}
          <span className="px-2 py-1 bg-neon-green/10 text-neon-green text-xs rounded-full">
            DTE ≥ {filters.minDaysToExpiration}
          </span>
          {filters.maxIV < 1.0 && (
            <span className="px-2 py-1 bg-risk-high/10 text-risk-high text-xs rounded-full">
              IV ≤ {(filters.maxIV * 100).toFixed(0)}%
            </span>
          )}
          {filters.minScore > 0 && (
            <span className="px-2 py-1 bg-bull/10 text-bull text-xs rounded-full">
              Score ≥ {filters.minScore}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
