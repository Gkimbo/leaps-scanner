import { motion } from 'framer-motion';
import { Clock, AlertTriangle, Loader2, Zap } from 'lucide-react';

/**
 * ScanProgressBar Component
 *
 * Displays scanning progress with:
 * - Animated progress bar
 * - Current ticker being scanned
 * - Estimated time remaining
 * - Error count indicator
 *
 * @param {Object} props
 * @param {Object} props.progress - Progress state { currentTicker, currentIndex, totalTickers, percentComplete }
 * @param {number} props.estimatedTimeRemaining - Seconds remaining
 * @param {Array} props.errors - Array of errors encountered
 * @param {number} props.resultsFound - Number of matching results found so far
 * @param {string} props.apiProvider - Current API provider (polygon, yahoo, mock)
 */
export default function ScanProgressBar({
  progress,
  estimatedTimeRemaining = 0,
  errors = [],
  resultsFound = 0,
  apiProvider = 'unknown'
}) {
  const {
    currentTicker,
    currentIndex,
    totalTickers,
    percentComplete
  } = progress;

  // Format time remaining
  const formatTime = (seconds) => {
    if (seconds <= 0) return '0s';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-4 p-4 bg-black/20 rounded-lg border border-trading-border"
    >
      {/* Progress Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-neon-purple animate-spin" />
          <span className="text-sm text-gray-400">
            Scanning{' '}
            <span className="text-white font-mono font-semibold">
              {currentTicker || '...'}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="font-mono">
            {currentIndex} / {totalTickers}
          </span>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>~{formatTime(estimatedTimeRemaining)}</span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden">
        {/* Progress fill */}
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-neon-purple to-neon-blue rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${percentComplete}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />

        {/* Scanning shimmer effect */}
        <motion.div
          className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          animate={{
            x: ['0%', '400%']
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'linear'
          }}
          style={{
            left: `${Math.max(0, percentComplete - 10)}%`
          }}
        />
      </div>

      {/* Stats Row */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Percentage */}
          <span className="text-sm font-mono font-semibold text-neon-blue">
            {percentComplete}%
          </span>

          {/* Results found */}
          {resultsFound > 0 && (
            <span className="text-xs text-gray-400">
              <span className="text-bull font-semibold">{resultsFound}</span> matches found
            </span>
          )}
        </div>

        {/* Error indicator */}
        {errors.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-risk-medium">
            <AlertTriangle className="w-3 h-3" />
            <span>{errors.length} skipped</span>
          </div>
        )}
      </div>

      {/* Ticker Queue Preview (optional - shows next few tickers) */}
      {currentIndex < totalTickers - 1 && (
        <div className="mt-3 pt-3 border-t border-trading-border/50">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Next:</span>
            <div className="flex gap-1.5 overflow-hidden">
              {/* This would need to be passed the ticker list to show upcoming */}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
