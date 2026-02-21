import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Calculator,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Percent,
  AlertTriangle,
  CheckCircle,
  MinusCircle,
  BookOpen,
  HelpCircle,
  ChevronDown,
  Lightbulb,
  Clock,
  Shield,
  ThumbsUp,
  ThumbsDown,
  Eye,
  EyeOff,
  Sparkles
} from 'lucide-react';

/**
 * CalculatorModal Component
 *
 * Options profit/loss calculator with:
 * - Pre-filled contract information
 * - Adjustable number of contracts
 * - Target price scenarios
 * - Probability estimates based on delta
 * - Break-even calculation
 * - Profit/loss projections
 */
export default function CalculatorModal({ option, isOpen, onClose }) {
  const [numContracts, setNumContracts] = useState(10);
  const [targetPrice, setTargetPrice] = useState(
    option ? Math.round(option.underlyingPrice * 1.2) : 0
  );
  const [showEducation, setShowEducation] = useState(false);

  // Option trading (buy/sell the contract itself)
  const [sellPrice, setSellPrice] = useState(
    option ? Math.round((option.premium || option.ask || 0) * 1.5 * 100) / 100 : 0
  );

  // Reset target price and sell price when option changes
  useEffect(() => {
    if (option) {
      setTargetPrice(Math.round(option.underlyingPrice * 1.2));
      const premium = option.premium || option.ask || 0;
      setSellPrice(Math.round(premium * 1.5 * 100) / 100);
    }
  }, [option?.id]);

  // Calculate all the metrics
  const calculations = useMemo(() => {
    if (!option) return null;

    const premium = option.premium || option.ask || 0;
    const strike = option.strike;
    const underlyingPrice = option.underlyingPrice;
    const delta = Math.abs(option.delta);
    const isCall = option.optionType === 'call';

    // Cost calculations (options are priced per share, 100 shares per contract)
    const costPerContract = premium * 100;
    const totalCost = costPerContract * numContracts;
    const sharesControlled = 100 * numContracts;

    // Break-even price
    const breakEven = isCall
      ? strike + premium
      : strike - premium;

    // Distance to break-even
    const distanceToBreakEven = isCall
      ? ((breakEven - underlyingPrice) / underlyingPrice) * 100
      : ((underlyingPrice - breakEven) / underlyingPrice) * 100;

    // ========================================
    // PROBABILITY CALCULATIONS
    // Using proper statistical methods based on log-normal distribution
    // ========================================

    const iv = option.iv || 0.3; // Implied volatility (annualized)
    const yearsToExpiry = option.daysToExpiration / 365;
    const riskFreeRate = 0.05; // Approximate risk-free rate

    // Standard normal CDF approximation (Abramowitz & Stegun 26.2.17)
    // Maximum error: 7.5e-8
    const normalCDF = (x) => {
      // Handle negative values by symmetry: Φ(-x) = 1 - Φ(x)
      if (x < 0) return 1 - normalCDF(-x);

      // Coefficients for the rational approximation
      const a1 = 0.319381530;
      const a2 = -0.356563782;
      const a3 = 1.781477937;
      const a4 = -1.821255978;
      const a5 = 1.330274429;
      const p = 0.2316419;

      const t = 1.0 / (1.0 + p * x);
      // Standard normal PDF: φ(x) = (1/√2π) * exp(-x²/2)
      const pdf = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
      // Q(x) = 1 - Φ(x) ≈ φ(x) * t * (a1 + t*(a2 + t*(a3 + t*(a4 + t*a5))))
      const Q = pdf * t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));

      return 1 - Q;
    };

    // Calculate d2 from Black-Scholes (probability of ITM in risk-neutral world)
    // d2 = [ln(S/K) + (r - σ²/2) * T] / (σ * √T)
    const calcD2 = (stockPrice, strikePrice, vol, time) => {
      if (time <= 0 || vol <= 0) return 0;
      const d2 = (Math.log(stockPrice / strikePrice) + (riskFreeRate - (vol * vol) / 2) * time) / (vol * Math.sqrt(time));
      return d2;
    };

    // Probability of stock reaching a target price using log-normal distribution
    // For calls: P(S_T > target), For puts: P(S_T < target)
    const calcProbReachingPrice = (targetPrice) => {
      if (yearsToExpiry <= 0 || iv <= 0) return 50;
      const d2 = calcD2(underlyingPrice, targetPrice, iv, yearsToExpiry);
      // N(d2) gives probability stock > target (for log-normal)
      const probAbove = normalCDF(d2) * 100;
      return isCall ? probAbove : (100 - probAbove);
    };

    // Probability of finishing ITM (stock > strike for calls, stock < strike for puts)
    const d2Strike = calcD2(underlyingPrice, strike, iv, yearsToExpiry);
    const probITM = isCall ? normalCDF(d2Strike) * 100 : (1 - normalCDF(d2Strike)) * 100;

    // Probability of profit (reaching break-even)
    const probProfit = calcProbReachingPrice(breakEven);

    // Expected move based on IV (1 standard deviation)
    const expectedMove = underlyingPrice * iv * Math.sqrt(yearsToExpiry);
    const oneSigmaUp = underlyingPrice + expectedMove;
    const oneSigmaDown = Math.max(0, underlyingPrice - expectedMove);
    const twoSigmaUp = underlyingPrice + (expectedMove * 2);

    // Price needed for various profit levels
    const priceFor50Profit = isCall
      ? strike + premium + (premium * 0.5)
      : strike - premium - (premium * 0.5);
    const priceFor100Profit = isCall
      ? strike + (premium * 2)
      : strike - (premium * 2);
    const priceFor200Profit = isCall
      ? strike + (premium * 3)
      : strike - (premium * 3);

    // Calculate probabilities for each profit level
    const prob50Profit = calcProbReachingPrice(priceFor50Profit);
    const prob100Profit = calcProbReachingPrice(priceFor100Profit);
    const prob200Profit = calcProbReachingPrice(priceFor200Profit);

    // Probability of max loss (option expires worthless)
    const probMaxLoss = Math.max(0, 100 - probITM);

    // Calculate potential profit at the user's target price
    const intrinsicAtUserTarget = isCall
      ? Math.max(0, targetPrice - strike)
      : Math.max(0, strike - targetPrice);
    const profitAtUserTarget = intrinsicAtUserTarget * sharesControlled - totalCost;

    // Risk/Reward ratio = potential reward / risk
    // Risk = total cost (max you can lose)
    // Reward = profit at user's target price (or expected move if higher)
    const profitAtExpectedMove = isCall
      ? Math.max(0, oneSigmaUp - strike) * sharesControlled - totalCost
      : Math.max(0, strike - oneSigmaDown) * sharesControlled - totalCost;

    // Use the better of user target or expected move for reward calculation
    const potentialReward = Math.max(0, Math.max(profitAtUserTarget, profitAtExpectedMove));
    const riskRewardRatio = totalCost > 0 ? potentialReward / totalCost : 0;

    // Expected value calculation using probability-weighted outcomes
    // If stock reaches break-even+ we profit, otherwise we lose
    const avgProfitIfWin = potentialReward > 0 ? potentialReward : (expectedMove * sharesControlled * 0.5);
    const expectedValue = (probProfit / 100 * avgProfitIfWin) - ((100 - probProfit) / 100 * totalCost);
    const expectedReturn = totalCost > 0 ? (expectedValue / totalCost) * 100 : 0;

    // Value at target price
    const intrinsicAtTarget = isCall
      ? Math.max(0, targetPrice - strike)
      : Math.max(0, strike - targetPrice);

    const valueAtTarget = intrinsicAtTarget * 100 * numContracts;
    const profitAtTarget = valueAtTarget - totalCost;
    const returnAtTarget = totalCost > 0 ? (profitAtTarget / totalCost) * 100 : 0;

    // Scenario calculations
    const scenarios = [
      { label: '-20%', price: underlyingPrice * 0.8 },
      { label: '-10%', price: underlyingPrice * 0.9 },
      { label: 'Current', price: underlyingPrice },
      { label: '+10%', price: underlyingPrice * 1.1 },
      { label: '+20%', price: underlyingPrice * 1.2 },
      { label: '+30%', price: underlyingPrice * 1.3 },
      { label: '+50%', price: underlyingPrice * 1.5 },
    ].map(s => {
      const intrinsic = isCall
        ? Math.max(0, s.price - strike)
        : Math.max(0, strike - s.price);
      const value = intrinsic * 100 * numContracts;
      const profit = value - totalCost;
      const returnPct = totalCost > 0 ? (profit / totalCost) * 100 : 0;
      return { ...s, intrinsic, value, profit, returnPct };
    });

    // Max loss is premium paid
    const maxLoss = totalCost;

    // Max gain for calls is theoretically unlimited, for puts it's strike - premium
    const maxGain = isCall ? 'Unlimited' : (strike - premium) * 100 * numContracts;

    // Leverage and comparison metrics
    const stockCostForSameShares = underlyingPrice * sharesControlled;
    const leverageRatio = stockCostForSameShares / totalCost;
    const savings = stockCostForSameShares - totalCost;
    const savingsPercent = (savings / stockCostForSameShares) * 100;

    // Intrinsic value (current)
    const currentIntrinsic = isCall
      ? Math.max(0, underlyingPrice - strike)
      : Math.max(0, strike - underlyingPrice);
    const timeValue = premium - currentIntrinsic;

    // Options vs Stock comparison at various price levels
    const compareAtPrices = [
      { label: '-20%', pct: -20, price: underlyingPrice * 0.8 },
      { label: '-10%', pct: -10, price: underlyingPrice * 0.9 },
      { label: '+10%', pct: 10, price: underlyingPrice * 1.1 },
      { label: '+20%', pct: 20, price: underlyingPrice * 1.2 },
      { label: '+30%', pct: 30, price: underlyingPrice * 1.3 },
      { label: '+50%', pct: 50, price: underlyingPrice * 1.5 },
    ].map(s => {
      // Stock return
      const stockValue = s.price * sharesControlled;
      const stockProfit = stockValue - stockCostForSameShares;
      const stockReturn = (stockProfit / stockCostForSameShares) * 100;

      // Option return
      const optionIntrinsic = isCall
        ? Math.max(0, s.price - strike)
        : Math.max(0, strike - s.price);
      const optionValue = optionIntrinsic * sharesControlled;
      const optionProfit = optionValue - totalCost;
      const optionReturn = (optionProfit / totalCost) * 100;

      // Which is better
      const winner = optionProfit > stockProfit ? 'option' : stockProfit > optionProfit ? 'stock' : 'tie';
      const advantage = Math.abs(optionProfit - stockProfit);

      return {
        ...s,
        stockValue,
        stockProfit,
        stockReturn,
        optionValue,
        optionProfit,
        optionReturn,
        winner,
        advantage
      };
    });

    // Find crossover point where options start outperforming stocks (same $ invested)
    // Derived: options beat stocks when price > strike * leverage / (leverage - 1) for calls
    // For puts: when price < strike * leverage / (leverage + 1)
    const optionOutperformPrice = isCall
      ? (leverageRatio > 1 ? strike * leverageRatio / (leverageRatio - 1) : strike * 2)
      : (strike * leverageRatio / (leverageRatio + 1));
    const optionOutperformPct = ((optionOutperformPrice - underlyingPrice) / underlyingPrice) * 100;

    // ========================================
    // RECOMMENDATION ALGORITHM
    // Scoring system based on multiple factors
    // ========================================

    // Score components (each 0-100, weighted)
    const scores = {
      // Probability of profit (weight: 30%)
      probScore: Math.min(100, probProfit * 1.2), // Boost slightly, cap at 100

      // Risk/Reward ratio (weight: 25%)
      // 2:1 or better is excellent, 1:1 is decent, below 0.5:1 is poor
      rrScore: Math.min(100, riskRewardRatio * 40),

      // Expected return (weight: 20%)
      // Positive expected return is good
      erScore: Math.min(100, Math.max(0, 50 + expectedReturn * 0.5)),

      // Time value efficiency (weight: 15%)
      // Lower time value relative to premium = better (less theta decay risk)
      // For deep ITM options, time value can be negative (trading at discount)
      timeEfficiency: timeValue <= 0
        ? 100 // Trading at intrinsic or discount - excellent
        : Math.max(0, 100 - (timeValue / premium) * 100),

      // Distance to break-even (weight: 10%)
      // Already ITM (negative distance for calls) = better
      breakEvenScore: distanceToBreakEven <= 0
        ? 100 // Already past break-even
        : Math.max(0, 100 - distanceToBreakEven * 5)
    };

    // Calculate weighted total score
    const recommendationScore = (
      scores.probScore * 0.30 +
      scores.rrScore * 0.25 +
      scores.erScore * 0.20 +
      scores.timeEfficiency * 0.15 +
      scores.breakEvenScore * 0.10
    );

    // Determine recommendation based on score and key thresholds
    let recommendation;
    let recommendationReason;

    if (recommendationScore >= 65 && probProfit >= 45 && riskRewardRatio >= 0.8) {
      recommendation = 'BUY';
      recommendationReason = `Strong setup: ${probProfit.toFixed(0)}% profit probability with ${riskRewardRatio.toFixed(1)}:1 reward potential`;
    } else if (recommendationScore >= 50 && probProfit >= 35) {
      recommendation = 'WATCH';
      recommendationReason = `Decent potential but wait for better entry. Current odds: ${probProfit.toFixed(0)}%`;
    } else if (recommendationScore < 35 || probProfit < 25 || riskRewardRatio < 0.3) {
      recommendation = 'DONT_WATCH';
      recommendationReason = `Poor risk/reward profile. Only ${probProfit.toFixed(0)}% chance of profit`;
    } else {
      recommendation = 'WATCH';
      recommendationReason = `Moderate opportunity. Consider if stock has strong catalyst`;
    }

    // Override to SELL if conditions are particularly unfavorable
    if (probProfit < 20 || (riskRewardRatio < 0.25 && probProfit < 40)) {
      recommendation = 'SELL';
      recommendationReason = `Unfavorable odds: ${probProfit.toFixed(0)}% profit chance, ${riskRewardRatio.toFixed(2)}:1 risk/reward`;
    }

    return {
      premium,
      costPerContract,
      totalCost,
      breakEven,
      distanceToBreakEven,
      probITM,
      probProfit,
      prob50Profit,
      prob100Profit,
      prob200Profit,
      probMaxLoss,
      expectedValue,
      expectedReturn,
      riskRewardRatio,
      expectedMove,
      oneSigmaUp,
      oneSigmaDown,
      twoSigmaUp,
      priceFor50Profit,
      priceFor100Profit,
      priceFor200Profit,
      valueAtTarget,
      profitAtTarget,
      returnAtTarget,
      scenarios,
      maxLoss,
      maxGain,
      isCall,
      sharesControlled,
      stockCostForSameShares,
      leverageRatio,
      savings,
      savingsPercent,
      currentIntrinsic,
      timeValue,
      compareAtPrices,
      optionOutperformPrice,
      optionOutperformPct,
      // Recommendation
      recommendation,
      recommendationReason,
      recommendationScore,
      scores
    };
  }, [option, numContracts, targetPrice]);

  // Option trading calculations (buy and sell the contract itself)
  const tradingCalcs = useMemo(() => {
    if (!option || !calculations) return null;

    const buyPrice = calculations.premium;
    const totalSpent = buyPrice * 100 * numContracts;
    const totalSellValue = sellPrice * 100 * numContracts;
    const profitLoss = totalSellValue - totalSpent;
    const percentReturn = ((sellPrice - buyPrice) / buyPrice) * 100;

    // Quick scenario presets
    const scenarios = [
      { label: '-50%', multiplier: 0.5 },
      { label: '-25%', multiplier: 0.75 },
      { label: 'Break-even', multiplier: 1.0 },
      { label: '+25%', multiplier: 1.25 },
      { label: '+50%', multiplier: 1.5 },
      { label: '+100%', multiplier: 2.0 },
      { label: '+200%', multiplier: 3.0 },
    ].map(s => ({
      ...s,
      sellPrice: Math.round(buyPrice * s.multiplier * 100) / 100,
      profitLoss: (buyPrice * s.multiplier - buyPrice) * 100 * numContracts,
      percentReturn: (s.multiplier - 1) * 100
    }));

    return {
      buyPrice,
      totalSpent,
      totalSellValue,
      profitLoss,
      percentReturn,
      scenarios
    };
  }, [option, calculations, numContracts, sellPrice]);

  if (!isOpen || !option) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-trading-card border border-trading-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-trading-border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-neon-purple/20 rounded-lg">
                <Calculator className="w-5 h-5 text-neon-purple" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  {option.symbol} {option.optionType.toUpperCase()} Calculator
                </h2>
                <p className="text-sm text-gray-400">
                  ${option.strike} Strike • Exp: {option.expiration}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-6">
            {/* Contract Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-black/30 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Current Price</p>
                <p className="text-lg font-bold text-white">
                  ${option.underlyingPrice?.toFixed(2)}
                </p>
              </div>
              <div className="bg-black/30 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Premium</p>
                <p className="text-lg font-bold text-neon-green">
                  ${calculations?.premium.toFixed(2)}
                </p>
              </div>
              <div className="bg-black/30 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Delta</p>
                <p className="text-lg font-bold text-neon-blue">
                  {option.delta?.toFixed(3)}
                </p>
              </div>
              <div className="bg-black/30 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Days to Exp</p>
                <p className="text-lg font-bold text-gray-300">
                  {option.daysToExpiration}
                </p>
              </div>
            </div>

            {/* Inputs */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Number of Contracts
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={numContracts}
                  onChange={e => setNumContracts(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-4 py-3 bg-black/30 border border-trading-border rounded-lg
                           text-white font-mono text-lg focus:outline-none focus:border-neon-blue"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Target Stock Price
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={targetPrice}
                    onChange={e => setTargetPrice(parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-4 py-3 bg-black/30 border border-trading-border rounded-lg
                             text-white font-mono text-lg focus:outline-none focus:border-neon-blue"
                  />
                </div>
              </div>
            </div>

            {/* Recommendation Banner */}
            {calculations?.recommendation && (
              <div className={`rounded-xl p-4 border-2 ${
                calculations.recommendation === 'BUY'
                  ? 'bg-gradient-to-r from-bull/20 to-neon-green/10 border-bull/50'
                  : calculations.recommendation === 'SELL'
                  ? 'bg-gradient-to-r from-bear/20 to-red-900/10 border-bear/50'
                  : calculations.recommendation === 'WATCH'
                  ? 'bg-gradient-to-r from-neon-blue/20 to-neon-purple/10 border-neon-blue/50'
                  : 'bg-gradient-to-r from-gray-800/50 to-gray-900/50 border-gray-600/50'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Recommendation Icon */}
                    <div className={`p-3 rounded-xl ${
                      calculations.recommendation === 'BUY'
                        ? 'bg-bull/20'
                        : calculations.recommendation === 'SELL'
                        ? 'bg-bear/20'
                        : calculations.recommendation === 'WATCH'
                        ? 'bg-neon-blue/20'
                        : 'bg-gray-700/50'
                    }`}>
                      {calculations.recommendation === 'BUY' && <ThumbsUp className="w-6 h-6 text-bull" />}
                      {calculations.recommendation === 'SELL' && <ThumbsDown className="w-6 h-6 text-bear" />}
                      {calculations.recommendation === 'WATCH' && <Eye className="w-6 h-6 text-neon-blue" />}
                      {calculations.recommendation === 'DONT_WATCH' && <EyeOff className="w-6 h-6 text-gray-500" />}
                    </div>

                    {/* Recommendation Text */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xl font-bold ${
                          calculations.recommendation === 'BUY'
                            ? 'text-bull'
                            : calculations.recommendation === 'SELL'
                            ? 'text-bear'
                            : calculations.recommendation === 'WATCH'
                            ? 'text-neon-blue'
                            : 'text-gray-500'
                        }`}>
                          {calculations.recommendation === 'DONT_WATCH' ? "DON'T WATCH" : calculations.recommendation}
                        </span>
                        <Sparkles className={`w-4 h-4 ${
                          calculations.recommendation === 'BUY' ? 'text-bull' :
                          calculations.recommendation === 'WATCH' ? 'text-neon-blue' :
                          'text-gray-600'
                        }`} />
                      </div>
                      <p className="text-sm text-gray-400 mt-0.5">
                        {calculations.recommendationReason}
                      </p>
                    </div>
                  </div>

                  {/* Score */}
                  <div className="text-right">
                    <div className="text-xs text-gray-500 mb-1">Score</div>
                    <div className={`text-2xl font-bold ${
                      calculations.recommendationScore >= 65 ? 'text-bull' :
                      calculations.recommendationScore >= 50 ? 'text-neon-blue' :
                      calculations.recommendationScore >= 35 ? 'text-risk-medium' :
                      'text-bear'
                    }`}>
                      {calculations.recommendationScore.toFixed(0)}
                    </div>
                  </div>
                </div>

                {/* Score Breakdown */}
                <div className="mt-4 pt-3 border-t border-white/10">
                  <div className="grid grid-cols-5 gap-2 text-xs">
                    <div className="text-center">
                      <div className="text-gray-500 mb-1">Prob</div>
                      <div className={`font-mono font-medium ${calculations.scores.probScore >= 60 ? 'text-bull' : calculations.scores.probScore >= 40 ? 'text-neon-blue' : 'text-bear'}`}>
                        {calculations.scores.probScore.toFixed(0)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500 mb-1">R/R</div>
                      <div className={`font-mono font-medium ${calculations.scores.rrScore >= 60 ? 'text-bull' : calculations.scores.rrScore >= 40 ? 'text-neon-blue' : 'text-bear'}`}>
                        {calculations.scores.rrScore.toFixed(0)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500 mb-1">E[R]</div>
                      <div className={`font-mono font-medium ${calculations.scores.erScore >= 60 ? 'text-bull' : calculations.scores.erScore >= 40 ? 'text-neon-blue' : 'text-bear'}`}>
                        {calculations.scores.erScore.toFixed(0)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500 mb-1">Time</div>
                      <div className={`font-mono font-medium ${calculations.scores.timeEfficiency >= 60 ? 'text-bull' : calculations.scores.timeEfficiency >= 40 ? 'text-neon-blue' : 'text-bear'}`}>
                        {calculations.scores.timeEfficiency.toFixed(0)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500 mb-1">B/E</div>
                      <div className={`font-mono font-medium ${calculations.scores.breakEvenScore >= 60 ? 'text-bull' : calculations.scores.breakEvenScore >= 40 ? 'text-neon-blue' : 'text-bear'}`}>
                        {calculations.scores.breakEvenScore.toFixed(0)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Investment Summary */}
            <div className="bg-gradient-to-br from-neon-purple/10 via-trading-card to-neon-blue/10 border border-neon-purple/30 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-trading-border/50">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-neon-purple" />
                  <h3 className="text-sm font-semibold text-white">Investment Summary</h3>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-neon-green/10 rounded-full">
                  <span className="text-xs text-gray-400">Leverage:</span>
                  <span className="text-sm font-bold text-neon-green">
                    {calculations?.leverageRatio.toFixed(1)}x
                  </span>
                </div>
              </div>

              {/* Main Cost Section */}
              <div className="p-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {/* Your Cost */}
                  <div className="bg-black/30 rounded-xl p-4 border border-neon-green/20">
                    <p className="text-xs text-gray-400 mb-1">Your Total Cost</p>
                    <p className="text-3xl font-bold text-neon-green">
                      ${calculations?.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {numContracts} contract{numContracts > 1 ? 's' : ''} × ${calculations?.costPerContract.toFixed(0)}/each
                    </p>
                  </div>

                  {/* Shares Controlled */}
                  <div className="bg-black/30 rounded-xl p-4 border border-neon-blue/20">
                    <p className="text-xs text-gray-400 mb-1">Shares Controlled</p>
                    <p className="text-3xl font-bold text-neon-blue">
                      {calculations?.sharesControlled.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      100 shares × {numContracts} contracts
                    </p>
                  </div>
                </div>

                {/* Options vs Stock Comparison */}
                <div className="bg-black/20 rounded-xl p-4 mb-4 border border-trading-border/50">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold text-white">Options vs Buying Stock</h4>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs">
                        <span className="w-3 h-3 bg-neon-purple rounded-sm"></span>
                        <span className="text-gray-400">Options</span>
                      </span>
                      <span className="flex items-center gap-1 text-xs">
                        <span className="w-3 h-3 bg-neon-blue rounded-sm"></span>
                        <span className="text-gray-400">Stock</span>
                      </span>
                    </div>
                  </div>

                  {/* Capital Comparison */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-neon-purple/10 border border-neon-purple/30 rounded-lg p-3">
                      <p className="text-xs text-gray-400 mb-1">Options Cost</p>
                      <p className="text-xl font-bold text-neon-purple">
                        ${calculations?.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                      <p className="text-xs text-gray-500">
                        Controls {calculations?.sharesControlled} shares
                      </p>
                    </div>
                    <div className="bg-neon-blue/10 border border-neon-blue/30 rounded-lg p-3">
                      <p className="text-xs text-gray-400 mb-1">Stock Cost (same shares)</p>
                      <p className="text-xl font-bold text-neon-blue">
                        ${calculations?.stockCostForSameShares.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                      <p className="text-xs text-neon-green">
                        Save {calculations?.savingsPercent.toFixed(0)}% upfront
                      </p>
                    </div>
                  </div>

                  {/* Comparison Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-500 text-xs border-b border-trading-border/30">
                          <th className="text-left py-2 pr-2">If Stock</th>
                          <th className="text-right py-2 px-2">Stock P/L</th>
                          <th className="text-right py-2 px-2">Stock %</th>
                          <th className="text-right py-2 px-2">Option P/L</th>
                          <th className="text-right py-2 px-2">Option %</th>
                          <th className="text-right py-2 pl-2">Winner</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calculations?.compareAtPrices.map((row, i) => (
                          <tr key={i} className="border-b border-trading-border/20">
                            <td className="py-2 pr-2">
                              <span className={`font-medium ${row.pct >= 0 ? 'text-bull' : 'text-bear'}`}>
                                {row.label}
                              </span>
                              <span className="text-gray-500 text-xs ml-1">
                                (${row.price.toFixed(0)})
                              </span>
                            </td>
                            <td className={`py-2 px-2 text-right font-mono ${row.stockProfit >= 0 ? 'text-neon-blue' : 'text-bear'}`}>
                              {row.stockProfit >= 0 ? '+' : ''}{row.stockProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </td>
                            <td className={`py-2 px-2 text-right font-mono text-xs ${row.stockReturn >= 0 ? 'text-neon-blue' : 'text-bear'}`}>
                              {row.stockReturn >= 0 ? '+' : ''}{row.stockReturn.toFixed(0)}%
                            </td>
                            <td className={`py-2 px-2 text-right font-mono ${row.optionProfit >= 0 ? 'text-neon-purple' : 'text-bear'}`}>
                              {row.optionProfit >= 0 ? '+' : ''}{row.optionProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </td>
                            <td className={`py-2 px-2 text-right font-mono text-xs ${row.optionReturn >= 0 ? 'text-neon-purple' : 'text-bear'}`}>
                              {row.optionReturn >= 0 ? '+' : ''}{row.optionReturn.toFixed(0)}%
                            </td>
                            <td className="py-2 pl-2 text-right">
                              {row.winner === 'option' ? (
                                <span className="px-2 py-0.5 bg-neon-purple/20 text-neon-purple text-xs rounded-full">
                                  Option +${row.advantage.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                              ) : row.winner === 'stock' ? (
                                <span className="px-2 py-0.5 bg-neon-blue/20 text-neon-blue text-xs rounded-full">
                                  Stock +${row.advantage.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-gray-700 text-gray-400 text-xs rounded-full">
                                  Tie
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Key Insight */}
                  <div className="mt-4 p-3 bg-gradient-to-r from-neon-purple/10 to-neon-blue/10 rounded-lg border border-neon-purple/20">
                    <p className="text-sm text-gray-300">
                      <span className="text-neon-purple font-medium">Key Insight:</span>{' '}
                      {calculations?.optionOutperformPct > 0 ? (
                        <>
                          Options outperform stocks when {option?.symbol} rises above{' '}
                          <span className="text-white font-bold">${calculations?.optionOutperformPrice.toFixed(2)}</span>{' '}
                          ({calculations?.optionOutperformPct > 0 ? '+' : ''}{calculations?.optionOutperformPct.toFixed(0)}% from current).
                          Below that, you would have been better off buying the stock directly.
                        </>
                      ) : (
                        <>
                          This deep ITM option already provides immediate leverage. Even small moves can generate outsized returns compared to stock ownership.
                        </>
                      )}
                    </p>
                  </div>

                  {/* Trade-off Summary */}
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="p-2 bg-neon-purple/5 rounded-lg">
                      <p className="text-xs text-neon-purple font-medium mb-1">Options Advantage</p>
                      <ul className="text-xs text-gray-400 space-y-0.5">
                        <li>• {calculations?.leverageRatio.toFixed(0)}x less capital needed</li>
                        <li>• Max loss capped at ${calculations?.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</li>
                        <li>• Higher % returns on big moves</li>
                      </ul>
                    </div>
                    <div className="p-2 bg-neon-blue/5 rounded-lg">
                      <p className="text-xs text-neon-blue font-medium mb-1">Stock Advantage</p>
                      <ul className="text-xs text-gray-400 space-y-0.5">
                        <li>• No expiration date</li>
                        <li>• Profit on any price increase</li>
                        <li>• Collect dividends</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Bottom Stats */}
                <div className="grid grid-cols-3 gap-3">
                  {/* Break-even */}
                  <div className="bg-black/20 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Break-even</p>
                    <p className="text-lg font-bold text-white">
                      ${calculations?.breakEven.toFixed(2)}
                    </p>
                    <p className={`text-xs ${calculations?.distanceToBreakEven > 0 ? 'text-risk-medium' : 'text-bull'}`}>
                      {calculations?.distanceToBreakEven > 0 ? '+' : ''}
                      {calculations?.distanceToBreakEven.toFixed(1)}%
                    </p>
                  </div>

                  {/* Intrinsic Value */}
                  <div className="bg-black/20 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Intrinsic Value</p>
                    <p className="text-lg font-bold text-white">
                      ${calculations?.currentIntrinsic.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500">
                      per share
                    </p>
                  </div>

                  {/* Time Value */}
                  <div className="bg-black/20 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Time Value</p>
                    <p className={`text-lg font-bold ${calculations?.timeValue >= 0 ? 'text-risk-medium' : 'text-bear'}`}>
                      ${Math.abs(calculations?.timeValue).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {calculations?.timeValue >= 0 ? 'at risk' : 'discount'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Probability Section - Enhanced */}
            <div className="bg-gradient-to-br from-black/40 to-black/20 rounded-xl border border-trading-border overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-trading-border/50">
                <div className="flex items-center gap-2">
                  <Percent className="w-5 h-5 text-neon-blue" />
                  <h3 className="text-sm font-semibold text-white">Probability Analysis</h3>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>Based on IV: {(option.iv * 100).toFixed(0)}%</span>
                  <span>•</span>
                  <span>Delta: {option.delta.toFixed(2)}</span>
                </div>
              </div>

              <div className="p-4 space-y-4">
                {/* Main Probability Bars */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Chance of Profit */}
                  <div className="bg-black/30 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-400">Chance of Any Profit</span>
                      <span className={`text-xl font-bold ${
                        calculations?.probProfit >= 60 ? 'text-bull' :
                        calculations?.probProfit >= 40 ? 'text-risk-medium' : 'text-bear'
                      }`}>
                        {calculations?.probProfit.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          calculations?.probProfit >= 60 ? 'bg-gradient-to-r from-bull to-neon-green' :
                          calculations?.probProfit >= 40 ? 'bg-gradient-to-r from-risk-medium to-yellow-500' :
                          'bg-gradient-to-r from-bear to-red-400'
                        }`}
                        style={{ width: `${Math.min(100, calculations?.probProfit)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Stock needs to reach ${calculations?.breakEven.toFixed(2)}
                    </p>
                  </div>

                  {/* Chance of ITM */}
                  <div className="bg-black/30 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-400">Chance of Finishing ITM</span>
                      <span className="text-xl font-bold text-neon-blue">
                        {calculations?.probITM.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-neon-blue to-neon-purple rounded-full"
                        style={{ width: `${calculations?.probITM}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Stock {calculations?.isCall ? 'above' : 'below'} ${option.strike} at expiration
                    </p>
                  </div>
                </div>

                {/* Profit Level Probabilities */}
                <div className="bg-black/20 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-white mb-3">Probability of Profit Levels</h4>
                  <div className="space-y-3">
                    {/* 50% Profit */}
                    <div className="flex items-center gap-3">
                      <div className="w-24 text-xs text-gray-400">+50% Return</div>
                      <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-neon-green/70 rounded-full"
                          style={{ width: `${Math.min(100, calculations?.prob50Profit)}%` }}
                        />
                      </div>
                      <div className="w-16 text-right">
                        <span className="text-sm font-mono text-neon-green">{calculations?.prob50Profit.toFixed(0)}%</span>
                      </div>
                      <div className="w-24 text-xs text-gray-500 text-right">
                        ${calculations?.priceFor50Profit.toFixed(2)}
                      </div>
                    </div>

                    {/* 100% Profit (Double) */}
                    <div className="flex items-center gap-3">
                      <div className="w-24 text-xs text-gray-400">+100% (2x)</div>
                      <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-neon-blue/70 rounded-full"
                          style={{ width: `${Math.min(100, calculations?.prob100Profit)}%` }}
                        />
                      </div>
                      <div className="w-16 text-right">
                        <span className="text-sm font-mono text-neon-blue">{calculations?.prob100Profit.toFixed(0)}%</span>
                      </div>
                      <div className="w-24 text-xs text-gray-500 text-right">
                        ${calculations?.priceFor100Profit.toFixed(2)}
                      </div>
                    </div>

                    {/* 200% Profit (Triple) */}
                    <div className="flex items-center gap-3">
                      <div className="w-24 text-xs text-gray-400">+200% (3x)</div>
                      <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-neon-purple/70 rounded-full"
                          style={{ width: `${Math.min(100, calculations?.prob200Profit)}%` }}
                        />
                      </div>
                      <div className="w-16 text-right">
                        <span className="text-sm font-mono text-neon-purple">{calculations?.prob200Profit.toFixed(0)}%</span>
                      </div>
                      <div className="w-24 text-xs text-gray-500 text-right">
                        ${calculations?.priceFor200Profit.toFixed(2)}
                      </div>
                    </div>

                    {/* Max Loss */}
                    <div className="flex items-center gap-3 pt-2 border-t border-trading-border/30">
                      <div className="w-24 text-xs text-gray-400">Total Loss</div>
                      <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-bear/70 rounded-full"
                          style={{ width: `${Math.min(100, calculations?.probMaxLoss)}%` }}
                        />
                      </div>
                      <div className="w-16 text-right">
                        <span className="text-sm font-mono text-bear">{calculations?.probMaxLoss.toFixed(0)}%</span>
                      </div>
                      <div className="w-24 text-xs text-gray-500 text-right">
                        -${calculations?.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expected Move & Statistics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Expected Move */}
                  <div className="bg-black/30 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Expected Move</p>
                    <p className="text-lg font-bold text-white">
                      ±${calculations?.expectedMove.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500">
                      ±{((calculations?.expectedMove / option.underlyingPrice) * 100).toFixed(0)}%
                    </p>
                  </div>

                  {/* 1 Sigma Range */}
                  <div className="bg-black/30 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">68% Range (1σ)</p>
                    <p className="text-sm font-bold text-neon-blue">
                      ${calculations?.oneSigmaDown.toFixed(0)} - ${calculations?.oneSigmaUp.toFixed(0)}
                    </p>
                    <p className="text-xs text-gray-500">likely range</p>
                  </div>

                  {/* Expected Return */}
                  <div className="bg-black/30 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Expected Return</p>
                    <p className={`text-lg font-bold ${calculations?.expectedReturn >= 0 ? 'text-bull' : 'text-bear'}`}>
                      {calculations?.expectedReturn >= 0 ? '+' : ''}{calculations?.expectedReturn.toFixed(0)}%
                    </p>
                    <p className="text-xs text-gray-500">avg outcome</p>
                  </div>

                  {/* Risk/Reward */}
                  <div className="bg-black/30 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Risk/Reward</p>
                    <p className={`text-lg font-bold ${
                      calculations?.riskRewardRatio >= 2 ? 'text-bull' :
                      calculations?.riskRewardRatio >= 1 ? 'text-neon-green' :
                      calculations?.riskRewardRatio >= 0.5 ? 'text-risk-medium' : 'text-bear'
                    }`}>
                      1:{calculations?.riskRewardRatio.toFixed(1)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {calculations?.riskRewardRatio >= 2 ? 'excellent' :
                       calculations?.riskRewardRatio >= 1 ? 'good' :
                       calculations?.riskRewardRatio >= 0.5 ? 'moderate' : 'poor'}
                    </p>
                  </div>
                </div>

                {/* Probability Visualization */}
                <div className="bg-black/20 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-white mb-3">Outcome Distribution</h4>
                  <div className="relative h-12 bg-gray-800 rounded-lg overflow-hidden">
                    {/* Loss zone */}
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-bear to-bear/50 flex items-center justify-center"
                      style={{ width: `${calculations?.probMaxLoss}%` }}
                    >
                      {calculations?.probMaxLoss > 15 && (
                        <span className="text-xs font-medium text-white/80">Loss</span>
                      )}
                    </div>
                    {/* Small profit zone */}
                    <div
                      className="absolute inset-y-0 bg-gradient-to-r from-risk-medium to-risk-medium/50 flex items-center justify-center"
                      style={{
                        left: `${calculations?.probMaxLoss}%`,
                        width: `${Math.max(0, calculations?.probProfit - calculations?.prob50Profit)}%`
                      }}
                    >
                      {(calculations?.probProfit - calculations?.prob50Profit) > 10 && (
                        <span className="text-xs font-medium text-white/80">Small Win</span>
                      )}
                    </div>
                    {/* Medium profit zone */}
                    <div
                      className="absolute inset-y-0 bg-gradient-to-r from-neon-green/80 to-neon-green/50 flex items-center justify-center"
                      style={{
                        left: `${calculations?.probMaxLoss + Math.max(0, calculations?.probProfit - calculations?.prob50Profit)}%`,
                        width: `${Math.max(0, calculations?.prob50Profit - calculations?.prob100Profit)}%`
                      }}
                    >
                      {(calculations?.prob50Profit - calculations?.prob100Profit) > 8 && (
                        <span className="text-xs font-medium text-white/80">+50%</span>
                      )}
                    </div>
                    {/* Big profit zone */}
                    <div
                      className="absolute inset-y-0 right-0 bg-gradient-to-r from-neon-blue to-neon-purple flex items-center justify-center"
                      style={{ width: `${calculations?.prob100Profit}%` }}
                    >
                      {calculations?.prob100Profit > 8 && (
                        <span className="text-xs font-medium text-white">2x+</span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-gray-500">
                    <span>Total Loss</span>
                    <span>Break-even</span>
                    <span>+50%</span>
                    <span>2x or more</span>
                  </div>
                </div>

                {/* Interpretation */}
                <div className={`p-3 rounded-lg border ${
                  calculations?.probProfit >= 50
                    ? 'bg-bull/10 border-bull/30'
                    : calculations?.probProfit >= 30
                    ? 'bg-risk-medium/10 border-risk-medium/30'
                    : 'bg-bear/10 border-bear/30'
                }`}>
                  <p className="text-sm text-gray-300">
                    <span className="font-medium text-white">Summary: </span>
                    {calculations?.probProfit >= 60 ? (
                      <>This trade has <span className="text-bull font-medium">favorable odds</span>. With a {calculations?.probProfit.toFixed(0)}% chance of profit and potential for {calculations?.riskRewardRatio.toFixed(1)}x return, the risk/reward is attractive.</>
                    ) : calculations?.probProfit >= 40 ? (
                      <>This trade has <span className="text-risk-medium font-medium">moderate odds</span>. The {calculations?.probProfit.toFixed(0)}% chance of profit means you'll win less than half the time, but wins could be significant.</>
                    ) : (
                      <>This trade has <span className="text-bear font-medium">challenging odds</span>. Only a {calculations?.probProfit.toFixed(0)}% chance of profit means you need the stock to move significantly. High risk, but potential for large gains if correct.</>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Option Trading Section - Buy/Sell the Contract */}
            <div className="bg-gradient-to-br from-neon-green/10 via-trading-card to-risk-medium/10 border border-neon-green/30 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-trading-border/50">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-neon-green" />
                  <h3 className="text-sm font-semibold text-white">Trade the Contract</h3>
                </div>
                <span className="text-xs text-gray-500">Buy low, sell high (no exercise)</span>
              </div>

              <div className="p-4 space-y-4">
                {/* Buy Section */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-black/30 rounded-xl p-4 border border-neon-blue/20">
                    <p className="text-xs text-gray-400 mb-1">Buy Price (per contract)</p>
                    <p className="text-2xl font-bold text-neon-blue">
                      ${tradingCalcs?.buyPrice.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Current ask price
                    </p>
                  </div>
                  <div className="bg-black/30 rounded-xl p-4 border border-neon-purple/20">
                    <p className="text-xs text-gray-400 mb-1">Total Investment</p>
                    <p className="text-2xl font-bold text-neon-purple">
                      ${tradingCalcs?.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {numContracts} contract{numContracts > 1 ? 's' : ''} × ${(tradingCalcs?.buyPrice * 100).toFixed(0)}
                    </p>
                  </div>
                </div>

                {/* Sell Price Input */}
                <div className="bg-black/20 rounded-xl p-4 border border-trading-border/50">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm text-gray-400">Sell Price (per share)</label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Quick:</span>
                      {tradingCalcs?.scenarios.slice(2, 7).map((s, i) => (
                        <button
                          key={i}
                          onClick={() => setSellPrice(s.sellPrice)}
                          className={`px-2 py-1 text-xs rounded-lg transition-all ${
                            Math.abs(sellPrice - s.sellPrice) < 0.01
                              ? 'bg-neon-green/20 text-neon-green border border-neon-green/50'
                              : 'bg-black/30 text-gray-400 hover:text-white hover:bg-black/50'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={sellPrice}
                      onChange={e => setSellPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full pl-8 pr-4 py-3 bg-black/30 border border-trading-border rounded-lg
                               text-white font-mono text-xl focus:outline-none focus:border-neon-green"
                    />
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-xs text-gray-500">
                      {tradingCalcs?.percentReturn >= 0 ? 'Gain' : 'Loss'}: {Math.abs(tradingCalcs?.percentReturn).toFixed(1)}%
                    </span>
                    <span className="text-xs text-gray-500">
                      Sell value: ${tradingCalcs?.totalSellValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Profit/Loss Result */}
                <div className={`rounded-xl p-4 border ${
                  tradingCalcs?.profitLoss >= 0
                    ? 'bg-bull/10 border-bull/30'
                    : 'bg-bear/10 border-bear/30'
                }`}>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Total Spent</p>
                      <p className="text-lg font-bold text-gray-300">
                        ${tradingCalcs?.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Profit / Loss</p>
                      <p className={`text-2xl font-bold flex items-center justify-center gap-1 ${
                        tradingCalcs?.profitLoss >= 0 ? 'text-bull' : 'text-bear'
                      }`}>
                        {tradingCalcs?.profitLoss >= 0 ? (
                          <TrendingUp className="w-5 h-5" />
                        ) : (
                          <TrendingDown className="w-5 h-5" />
                        )}
                        {tradingCalcs?.profitLoss >= 0 ? '+' : '-'}${Math.abs(tradingCalcs?.profitLoss).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Return</p>
                      <p className={`text-lg font-bold ${
                        tradingCalcs?.percentReturn >= 0 ? 'text-bull' : 'text-bear'
                      }`}>
                        {tradingCalcs?.percentReturn >= 0 ? '+' : ''}{tradingCalcs?.percentReturn.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>

                {/* Scenario Quick View */}
                <div className="bg-black/20 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-2">Quick Scenarios</p>
                  <div className="grid grid-cols-7 gap-2">
                    {tradingCalcs?.scenarios.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => setSellPrice(s.sellPrice)}
                        className={`p-2 rounded-lg text-center transition-all ${
                          Math.abs(sellPrice - s.sellPrice) < 0.01
                            ? 'bg-neon-green/20 border border-neon-green/50'
                            : 'bg-black/30 hover:bg-black/50'
                        }`}
                      >
                        <p className={`text-xs font-medium ${
                          s.percentReturn >= 0 ? 'text-bull' : 'text-bear'
                        }`}>
                          {s.label}
                        </p>
                        <p className="text-xs text-gray-500">${s.sellPrice.toFixed(2)}</p>
                        <p className={`text-xs font-mono ${
                          s.profitLoss >= 0 ? 'text-bull' : 'text-bear'
                        }`}>
                          {s.profitLoss >= 0 ? '+' : ''}{s.profitLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Info Note */}
                <div className="flex items-start gap-2 text-xs text-gray-500">
                  <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5 text-risk-medium" />
                  <p>
                    This calculates profit/loss from trading the option contract itself (buying and selling before expiration),
                    not from exercising the option. Option prices fluctuate based on stock price, time remaining, and volatility.
                  </p>
                </div>
              </div>
            </div>

            {/* Target Price Result */}
            <div className={`rounded-xl p-4 border ${
              calculations?.profitAtTarget >= 0
                ? 'bg-bull/10 border-bull/30'
                : 'bg-bear/10 border-bear/30'
            }`}>
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-5 h-5 text-white" />
                <h3 className="text-sm font-semibold text-white">
                  At Target Price: ${targetPrice.toFixed(2)}
                </h3>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-400">Option Value</p>
                  <p className="text-xl font-bold text-white">
                    ${calculations?.valueAtTarget.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Profit/Loss</p>
                  <p className={`text-xl font-bold flex items-center gap-1 ${
                    calculations?.profitAtTarget >= 0 ? 'text-bull' : 'text-bear'
                  }`}>
                    {calculations?.profitAtTarget >= 0 ? (
                      <TrendingUp className="w-5 h-5" />
                    ) : (
                      <TrendingDown className="w-5 h-5" />
                    )}
                    ${Math.abs(calculations?.profitAtTarget).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Return</p>
                  <p className={`text-xl font-bold ${
                    calculations?.returnAtTarget >= 0 ? 'text-bull' : 'text-bear'
                  }`}>
                    {calculations?.returnAtTarget >= 0 ? '+' : ''}
                    {calculations?.returnAtTarget.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>

            {/* Scenario Table */}
            <div className="bg-black/30 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Price Scenarios</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs">
                      <th className="text-left py-2">Scenario</th>
                      <th className="text-right py-2">Stock Price</th>
                      <th className="text-right py-2">Option Value</th>
                      <th className="text-right py-2">Profit/Loss</th>
                      <th className="text-right py-2">Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculations?.scenarios.map((s, i) => (
                      <tr key={i} className={`border-t border-trading-border/30 ${
                        s.label === 'Current' ? 'bg-neon-blue/5' : ''
                      }`}>
                        <td className="py-2 text-gray-300">{s.label}</td>
                        <td className="py-2 text-right font-mono text-white">
                          ${s.price.toFixed(2)}
                        </td>
                        <td className="py-2 text-right font-mono text-gray-300">
                          ${s.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`py-2 text-right font-mono ${
                          s.profit >= 0 ? 'text-bull' : 'text-bear'
                        }`}>
                          {s.profit >= 0 ? '+' : ''}${s.profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`py-2 text-right font-mono ${
                          s.returnPct >= 0 ? 'text-bull' : 'text-bear'
                        }`}>
                          {s.returnPct >= 0 ? '+' : ''}{s.returnPct.toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Risk Warning */}
            <div className="flex items-start gap-3 p-3 bg-risk-high/10 border border-risk-high/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-risk-high flex-shrink-0 mt-0.5" />
              <div className="text-xs text-gray-400">
                <p className="text-risk-high font-medium mb-1">Risk Disclosure</p>
                <p>
                  Max Loss: <span className="text-white font-mono">${calculations?.maxLoss.toLocaleString()}</span> (100% of investment)
                  {calculations?.isCall ? (
                    <span> • Max Gain: <span className="text-bull">Unlimited</span></span>
                  ) : (
                    <span> • Max Gain: <span className="text-bull font-mono">${typeof calculations?.maxGain === 'number' ? calculations.maxGain.toLocaleString() : calculations?.maxGain}</span></span>
                  )}
                </p>
                <p className="mt-1 text-gray-500">
                  Probability estimates use Black-Scholes methodology assuming log-normal price distribution. Actual results depend on IV changes, time decay, dividends, and market conditions.
                </p>
              </div>
            </div>

            {/* Educational Section */}
            <div className="border border-trading-border rounded-xl overflow-hidden">
              {/* Toggle Header */}
              <button
                onClick={() => setShowEducation(!showEducation)}
                className="w-full flex items-center justify-between p-4 bg-black/20 hover:bg-black/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-neon-blue/20 rounded-lg">
                    <BookOpen className="w-5 h-5 text-neon-blue" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-semibold text-white">New to Options? Learn the Basics</h3>
                    <p className="text-xs text-gray-500">Click to {showEducation ? 'hide' : 'show'} a beginner-friendly explanation</p>
                  </div>
                </div>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showEducation ? 'rotate-180' : ''}`} />
              </button>

              {/* Educational Content */}
              {showEducation && (
                <div className="p-4 space-y-6 border-t border-trading-border bg-black/10">
                  {/* What is an Option */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <HelpCircle className="w-4 h-4 text-neon-purple" />
                      <h4 className="text-sm font-semibold text-white">What is a {calculations?.isCall ? 'Call' : 'Put'} Option?</h4>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      {calculations?.isCall ? (
                        <>A <span className="text-neon-green font-medium">call option</span> is a contract that gives you the <span className="text-white">right (but not obligation)</span> to buy 100 shares of a stock at a specific price (called the "strike price") before a certain date (the "expiration date").</>
                      ) : (
                        <>A <span className="text-bear font-medium">put option</span> is a contract that gives you the <span className="text-white">right (but not obligation)</span> to sell 100 shares of a stock at a specific price (called the "strike price") before a certain date (the "expiration date"). You profit when the stock goes DOWN.</>
                      )}
                    </p>
                    <div className="mt-3 p-3 bg-black/30 rounded-lg border-l-2 border-neon-blue">
                      <p className="text-sm text-gray-300">
                        <span className="text-neon-blue font-medium">This contract:</span> You can {calculations?.isCall ? 'buy' : 'sell'} {calculations?.sharesControlled.toLocaleString()} shares of {option?.symbol} at ${option?.strike} each, anytime before {option?.expiration}.
                      </p>
                    </div>
                  </div>

                  {/* How You Make Money */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <DollarSign className="w-4 h-4 text-neon-green" />
                      <h4 className="text-sm font-semibold text-white">How Do You Make Money?</h4>
                    </div>
                    <div className="space-y-3">
                      <p className="text-sm text-gray-300 leading-relaxed">
                        {calculations?.isCall ? (
                          <>You profit when the stock price goes <span className="text-bull font-medium">above your break-even price</span> (${calculations?.breakEven.toFixed(2)}). The higher it goes, the more you make!</>
                        ) : (
                          <>You profit when the stock price goes <span className="text-bear font-medium">below your break-even price</span> (${calculations?.breakEven.toFixed(2)}). The lower it goes, the more you make!</>
                        )}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {calculations?.isCall ? (
                          <>
                            <div className="p-3 bg-bull/10 border border-bull/30 rounded-lg">
                              <p className="text-xs text-bull font-medium mb-1">Example: Stock rises to ${(option?.underlyingPrice * 1.3).toFixed(2)}</p>
                              <p className="text-sm text-gray-300">
                                Your option lets you buy at ${option?.strike}, then sell at ${(option?.underlyingPrice * 1.3).toFixed(2)}.
                                Profit = ${(Math.max(0, option?.underlyingPrice * 1.3 - option?.strike) * 100 * numContracts - calculations?.totalCost).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </p>
                            </div>
                            <div className="p-3 bg-bear/10 border border-bear/30 rounded-lg">
                              <p className="text-xs text-bear font-medium mb-1">Example: Stock falls or stays flat</p>
                              <p className="text-sm text-gray-300">
                                If the stock stays below ${option?.strike}, your option expires worthless. You lose your investment of ${calculations?.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}.
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="p-3 bg-bull/10 border border-bull/30 rounded-lg">
                              <p className="text-xs text-bull font-medium mb-1">Example: Stock falls to ${(option?.underlyingPrice * 0.7).toFixed(2)}</p>
                              <p className="text-sm text-gray-300">
                                Your option lets you sell at ${option?.strike}, even though it's only worth ${(option?.underlyingPrice * 0.7).toFixed(2)}.
                                Profit = ${(Math.max(0, option?.strike - option?.underlyingPrice * 0.7) * 100 * numContracts - calculations?.totalCost).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </p>
                            </div>
                            <div className="p-3 bg-bear/10 border border-bear/30 rounded-lg">
                              <p className="text-xs text-bear font-medium mb-1">Example: Stock rises or stays flat</p>
                              <p className="text-sm text-gray-300">
                                If the stock stays above ${option?.strike}, your option expires worthless. You lose your investment of ${calculations?.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}.
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Why Use Options */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Lightbulb className="w-4 h-4 text-risk-medium" />
                      <h4 className="text-sm font-semibold text-white">Why Use Options Instead of Buying Stock?</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="p-3 bg-black/30 rounded-lg">
                        <p className="text-xs text-neon-green font-medium mb-2">Advantages</p>
                        <ul className="text-sm text-gray-300 space-y-1">
                          <li>• <span className="text-white">Leverage:</span> Control {calculations?.sharesControlled} shares for just ${calculations?.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} instead of ${calculations?.stockCostForSameShares.toLocaleString(undefined, { maximumFractionDigits: 0 })}</li>
                          <li>• <span className="text-white">Limited risk:</span> Max you can lose is ${calculations?.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</li>
                          <li>• <span className="text-white">Higher % returns:</span> Small stock moves = big % gains</li>
                        </ul>
                      </div>
                      <div className="p-3 bg-black/30 rounded-lg">
                        <p className="text-xs text-bear font-medium mb-2">Disadvantages</p>
                        <ul className="text-sm text-gray-300 space-y-1">
                          <li>• <span className="text-white">Time decay:</span> Options lose value every day</li>
                          <li>• <span className="text-white">Expiration:</span> If stock doesn't move enough by {option?.expiration}, you lose</li>
                          <li>• <span className="text-white">Can lose 100%:</span> Unlike stocks, options can become worthless</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Key Terms */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <BookOpen className="w-4 h-4 text-neon-blue" />
                      <h4 className="text-sm font-semibold text-white">Key Terms Explained</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div className="p-2 bg-black/20 rounded-lg">
                        <span className="text-neon-blue font-medium">Strike Price (${option?.strike}):</span>
                        <span className="text-gray-400 ml-1">The price you can buy the stock at</span>
                      </div>
                      <div className="p-2 bg-black/20 rounded-lg">
                        <span className="text-neon-blue font-medium">Premium (${calculations?.premium.toFixed(2)}):</span>
                        <span className="text-gray-400 ml-1">The price you pay for the option</span>
                      </div>
                      <div className="p-2 bg-black/20 rounded-lg">
                        <span className="text-neon-blue font-medium">Delta ({option?.delta.toFixed(2)}):</span>
                        <span className="text-gray-400 ml-1">How much option moves per $1 stock move</span>
                      </div>
                      <div className="p-2 bg-black/20 rounded-lg">
                        <span className="text-neon-blue font-medium">Break-even (${calculations?.breakEven.toFixed(2)}):</span>
                        <span className="text-gray-400 ml-1">Stock price needed to not lose money</span>
                      </div>
                      <div className="p-2 bg-black/20 rounded-lg">
                        <span className="text-neon-blue font-medium">ITM (In The Money):</span>
                        <span className="text-gray-400 ml-1">When stock is above strike (good!)</span>
                      </div>
                      <div className="p-2 bg-black/20 rounded-lg">
                        <span className="text-neon-blue font-medium">Time Value (${calculations?.timeValue.toFixed(2)}):</span>
                        <span className="text-gray-400 ml-1">Extra cost for time remaining</span>
                      </div>
                    </div>
                  </div>

                  {/* LEAPS Specific */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="w-4 h-4 text-neon-purple" />
                      <h4 className="text-sm font-semibold text-white">What Makes This a "LEAPS" Option?</h4>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      <span className="text-neon-purple font-medium">LEAPS</span> (Long-term Equity Anticipation Securities) are options with expiration dates <span className="text-white">more than 1 year away</span>. This option expires in <span className="text-white font-medium">{option?.daysToExpiration} days</span> ({(option?.daysToExpiration / 365).toFixed(1)} years).
                    </p>
                    <div className="mt-3 p-3 bg-neon-purple/10 border border-neon-purple/30 rounded-lg">
                      <p className="text-sm text-gray-300">
                        <span className="text-neon-purple font-medium">Why LEAPS?</span> More time = more chance for the stock to move in your favor. Time decay is slower with LEAPS compared to short-term options.
                      </p>
                    </div>
                  </div>

                  {/* This Specific Trade Summary */}
                  <div className="p-4 bg-gradient-to-r from-neon-purple/10 to-neon-blue/10 border border-neon-purple/30 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="w-4 h-4 text-neon-green" />
                      <h4 className="text-sm font-semibold text-white">This Trade in Plain English</h4>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      You're paying <span className="text-neon-green font-bold">${calculations?.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> for the right to {calculations?.isCall ? 'buy' : 'sell'} <span className="text-white font-medium">{calculations?.sharesControlled.toLocaleString()} shares</span> of <span className="text-white font-medium">{option?.symbol}</span> at <span className="text-white font-medium">${option?.strike}</span> per share anytime before <span className="text-white font-medium">{option?.expiration}</span>.
                    </p>
                    <div className="mt-3 space-y-2 text-sm">
                      <p className="text-gray-300">
                        <span className="text-bull">To profit:</span> {option?.symbol} needs to be {calculations?.isCall ? 'above' : 'below'} <span className="text-white font-medium">${calculations?.breakEven.toFixed(2)}</span> (currently ${option?.underlyingPrice.toFixed(2)}, needs to go {calculations?.isCall ? 'up' : 'down'} {Math.abs(calculations?.distanceToBreakEven).toFixed(1)}%)
                      </p>
                      <p className="text-gray-300">
                        <span className="text-bear">If wrong:</span> You lose your ${calculations?.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} investment if the stock stays {calculations?.isCall ? 'below' : 'above'} ${option?.strike} by {option?.expiration}
                      </p>
                      <p className="text-gray-300">
                        <span className="text-neon-blue">Probability:</span> Based on implied volatility ({((option?.iv || 0.3) * 100).toFixed(0)}%) and time to expiry, there's approximately a <span className="text-white font-medium">{calculations?.probProfit.toFixed(0)}%</span> chance this trade will be profitable
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
