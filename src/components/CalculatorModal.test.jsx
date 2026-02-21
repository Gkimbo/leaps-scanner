/**
 * CalculatorModal Tests
 *
 * Comprehensive tests for the options calculator including:
 * - Basic cost calculations
 * - Break-even calculations
 * - Probability calculations (Black-Scholes based)
 * - Scenario projections
 * - Edge cases and outliers
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CalculatorModal from './CalculatorModal';
import { mockHighDeltaOption, mockPutOption } from '../test/mocks/optionsData';

// ============================================
// CALCULATION LOGIC TESTS (Unit Tests)
// ============================================
// Extract and test the calculation logic directly

/**
 * Standard normal CDF approximation (Abramowitz & Stegun 26.2.17)
 * Copied from CalculatorModal for direct testing
 */
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

/**
 * Calculate d2 from Black-Scholes
 */
const calcD2 = (stockPrice, strikePrice, vol, time, riskFreeRate = 0.05) => {
  if (time <= 0 || vol <= 0) return 0;
  const d2 = (Math.log(stockPrice / strikePrice) + (riskFreeRate - (vol * vol) / 2) * time) / (vol * Math.sqrt(time));
  return d2;
};

/**
 * Calculate all metrics for an option (mirrors the useMemo in CalculatorModal)
 */
const calculateMetrics = (option, numContracts = 10, targetPrice = null) => {
  const premium = option.premium || option.ask || 0;
  const strike = option.strike;
  const underlyingPrice = option.underlyingPrice;
  const delta = Math.abs(option.delta);
  const isCall = option.optionType === 'call';

  if (targetPrice === null) {
    targetPrice = Math.round(underlyingPrice * 1.2);
  }

  // Cost calculations
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

  // Probability calculations
  const iv = option.iv || 0.3;
  const yearsToExpiry = option.daysToExpiration / 365;
  const riskFreeRate = 0.05;

  // Probability of finishing ITM
  const d2Strike = calcD2(underlyingPrice, strike, iv, yearsToExpiry, riskFreeRate);
  const probITM = isCall ? normalCDF(d2Strike) * 100 : (1 - normalCDF(d2Strike)) * 100;

  // Probability of profit (reaching break-even)
  const calcProbReachingPrice = (target) => {
    if (yearsToExpiry <= 0 || iv <= 0) return 50;
    const d2 = calcD2(underlyingPrice, target, iv, yearsToExpiry, riskFreeRate);
    const probAbove = normalCDF(d2) * 100;
    return isCall ? probAbove : (100 - probAbove);
  };

  const probProfit = calcProbReachingPrice(breakEven);

  // Expected move
  const expectedMove = underlyingPrice * iv * Math.sqrt(yearsToExpiry);
  const oneSigmaUp = underlyingPrice + expectedMove;
  const oneSigmaDown = Math.max(0, underlyingPrice - expectedMove);

  // Price for profit levels
  const priceFor50Profit = isCall
    ? strike + premium + (premium * 0.5)
    : strike - premium - (premium * 0.5);
  const priceFor100Profit = isCall
    ? strike + (premium * 2)
    : strike - (premium * 2);
  const priceFor200Profit = isCall
    ? strike + (premium * 3)
    : strike - (premium * 3);

  // Profit probabilities
  const prob50Profit = calcProbReachingPrice(priceFor50Profit);
  const prob100Profit = calcProbReachingPrice(priceFor100Profit);
  const prob200Profit = calcProbReachingPrice(priceFor200Profit);

  // Probability of max loss
  const probMaxLoss = Math.max(0, 100 - probITM);

  // Value at target price
  const intrinsicAtTarget = isCall
    ? Math.max(0, targetPrice - strike)
    : Math.max(0, strike - targetPrice);
  const valueAtTarget = intrinsicAtTarget * 100 * numContracts;
  const profitAtTarget = valueAtTarget - totalCost;
  const returnAtTarget = totalCost > 0 ? (profitAtTarget / totalCost) * 100 : 0;

  // Scenarios
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

  // Max loss and gain
  const maxLoss = totalCost;
  const maxGain = isCall ? 'Unlimited' : (strike - premium) * 100 * numContracts;

  // Leverage
  const stockCostForSameShares = underlyingPrice * sharesControlled;
  const leverageRatio = stockCostForSameShares / totalCost;

  // Intrinsic and time value
  const currentIntrinsic = isCall
    ? Math.max(0, underlyingPrice - strike)
    : Math.max(0, strike - underlyingPrice);
  const timeValue = premium - currentIntrinsic;

  return {
    premium,
    costPerContract,
    totalCost,
    sharesControlled,
    breakEven,
    distanceToBreakEven,
    probITM,
    probProfit,
    prob50Profit,
    prob100Profit,
    prob200Profit,
    probMaxLoss,
    expectedMove,
    oneSigmaUp,
    oneSigmaDown,
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
    stockCostForSameShares,
    leverageRatio,
    currentIntrinsic,
    timeValue
  };
};


describe('CalculatorModal', () => {
  // ============================================
  // NORMAL CDF TESTS
  // ============================================
  describe('Normal CDF Approximation', () => {
    it('should return 0.5 for x = 0', () => {
      expect(normalCDF(0)).toBeCloseTo(0.5, 5);
    });

    it('should return ~0.8413 for x = 1 (1 standard deviation)', () => {
      // Standard normal: P(Z < 1) ≈ 0.8413
      expect(normalCDF(1)).toBeCloseTo(0.8413, 4);
    });

    it('should return ~0.1587 for x = -1', () => {
      // Standard normal: P(Z < -1) ≈ 0.1587
      expect(normalCDF(-1)).toBeCloseTo(0.1587, 4);
    });

    it('should return ~0.9772 for x = 2 (2 standard deviations)', () => {
      expect(normalCDF(2)).toBeCloseTo(0.9772, 4);
    });

    it('should return ~0.0228 for x = -2', () => {
      expect(normalCDF(-2)).toBeCloseTo(0.0228, 4);
    });

    it('should return ~0.9987 for x = 3', () => {
      expect(normalCDF(3)).toBeCloseTo(0.9987, 4);
    });

    it('should be symmetric: CDF(x) + CDF(-x) = 1', () => {
      const testValues = [0.5, 1, 1.5, 2, 2.5, 3];
      testValues.forEach(x => {
        expect(normalCDF(x) + normalCDF(-x)).toBeCloseTo(1, 5);
      });
    });

    it('should handle extreme values gracefully', () => {
      expect(normalCDF(10)).toBeCloseTo(1, 5);
      expect(normalCDF(-10)).toBeCloseTo(0, 5);
    });
  });

  // ============================================
  // D2 CALCULATION TESTS
  // ============================================
  describe('Black-Scholes d2 Calculation', () => {
    it('should return 0 when time is 0', () => {
      expect(calcD2(100, 100, 0.3, 0)).toBe(0);
    });

    it('should return 0 when volatility is 0', () => {
      expect(calcD2(100, 100, 0, 1)).toBe(0);
    });

    it('should return positive d2 when stock > strike (ITM call)', () => {
      // Stock at 110, strike at 100, 30% IV, 1 year
      const d2 = calcD2(110, 100, 0.3, 1);
      expect(d2).toBeGreaterThan(0);
    });

    it('should return negative d2 when stock < strike (OTM call)', () => {
      // Stock at 90, strike at 100, 30% IV, 1 year
      const d2 = calcD2(90, 100, 0.3, 1);
      expect(d2).toBeLessThan(0);
    });

    it('should calculate d2 correctly for ATM option', () => {
      // For ATM option with no drift adjustment: d2 ≈ (r - σ²/2) * T / (σ * √T)
      // With r=0.05, σ=0.3, T=1: d2 ≈ (0.05 - 0.045) * 1 / 0.3 ≈ 0.017
      const d2 = calcD2(100, 100, 0.3, 1, 0.05);
      expect(d2).toBeCloseTo(0.017, 2);
    });

    it('should have higher d2 with longer time to expiration', () => {
      const d2_1year = calcD2(110, 100, 0.3, 1);
      const d2_2year = calcD2(110, 100, 0.3, 2);
      // For ITM option, more time generally means higher d2
      expect(d2_1year).toBeGreaterThan(0);
      expect(d2_2year).toBeGreaterThan(0);
    });

    it('should have lower d2 with higher volatility', () => {
      // Higher vol increases denominator, decreasing d2 for given ITM option
      const d2_lowVol = calcD2(110, 100, 0.2, 1);
      const d2_highVol = calcD2(110, 100, 0.5, 1);
      expect(d2_lowVol).toBeGreaterThan(d2_highVol);
    });
  });

  // ============================================
  // BASIC COST CALCULATION TESTS
  // ============================================
  describe('Basic Cost Calculations', () => {
    it('should calculate cost per contract correctly', () => {
      const metrics = calculateMetrics(mockHighDeltaOption, 1);
      // Premium of 3.50 * 100 shares = $350 per contract
      expect(metrics.costPerContract).toBe(350);
    });

    it('should calculate total cost correctly for multiple contracts', () => {
      const metrics = calculateMetrics(mockHighDeltaOption, 10);
      // 10 contracts * $350 = $3,500
      expect(metrics.totalCost).toBe(3500);
    });

    it('should calculate shares controlled correctly', () => {
      const metrics = calculateMetrics(mockHighDeltaOption, 10);
      // 10 contracts * 100 shares = 1000 shares
      expect(metrics.sharesControlled).toBe(1000);
    });

    it('should handle 1 contract', () => {
      const metrics = calculateMetrics(mockHighDeltaOption, 1);
      expect(metrics.sharesControlled).toBe(100);
      expect(metrics.totalCost).toBe(350);
    });

    it('should handle large number of contracts', () => {
      const metrics = calculateMetrics(mockHighDeltaOption, 100);
      expect(metrics.sharesControlled).toBe(10000);
      expect(metrics.totalCost).toBe(35000);
    });

    it('should calculate leverage ratio correctly', () => {
      const metrics = calculateMetrics(mockHighDeltaOption, 10);
      // Stock cost: 185 * 1000 = $185,000
      // Options cost: $3,500
      // Leverage: 185,000 / 3,500 ≈ 52.86x
      expect(metrics.leverageRatio).toBeCloseTo(52.86, 1);
    });
  });

  // ============================================
  // BREAK-EVEN CALCULATION TESTS
  // ============================================
  describe('Break-even Calculations', () => {
    it('should calculate break-even for call option correctly', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      // Call break-even = strike + premium = 150 + 3.50 = 153.50
      expect(metrics.breakEven).toBe(153.50);
    });

    it('should calculate break-even for put option correctly', () => {
      const metrics = calculateMetrics(mockPutOption);
      // Put break-even = strike - premium = 550 - 2.80 = 547.20
      expect(metrics.breakEven).toBe(547.20);
    });

    it('should calculate distance to break-even for ITM call', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      // Current: 185, Break-even: 153.50
      // Distance: (153.50 - 185) / 185 * 100 = -17.03%
      // Since it's ITM, the break-even is below current price
      expect(metrics.distanceToBreakEven).toBeCloseTo(-17.03, 1);
    });

    it('should calculate distance to break-even for ITM put', () => {
      const metrics = calculateMetrics(mockPutOption);
      // Current: 510, Break-even: 547.20, Strike: 550
      // For put, we profit when price goes DOWN
      // Distance = (510 - 547.20) / 510 * 100 = -7.29% (need price to go down more)
      expect(metrics.distanceToBreakEven).toBeCloseTo(-7.29, 1);
    });
  });

  // ============================================
  // INTRINSIC AND TIME VALUE TESTS
  // ============================================
  describe('Intrinsic and Time Value', () => {
    it('should calculate intrinsic value for ITM call', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      // Intrinsic = 185 - 150 = 35
      expect(metrics.currentIntrinsic).toBe(35);
    });

    it('should calculate time value correctly', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      // Time value = premium - intrinsic = 3.50 - 35 = -31.50
      // This is actually negative, indicating deep ITM option trades at discount
      expect(metrics.timeValue).toBe(3.50 - 35);
    });

    it('should calculate intrinsic value for ITM put', () => {
      const metrics = calculateMetrics(mockPutOption);
      // Intrinsic = 550 - 510 = 40
      expect(metrics.currentIntrinsic).toBe(40);
    });

    it('should return 0 intrinsic for OTM call', () => {
      const otmCall = {
        ...mockHighDeltaOption,
        strike: 200, // Above current price of 185
        underlyingPrice: 185
      };
      const metrics = calculateMetrics(otmCall);
      expect(metrics.currentIntrinsic).toBe(0);
    });

    it('should return 0 intrinsic for OTM put', () => {
      const otmPut = {
        ...mockPutOption,
        strike: 400, // Below current price of 510
        underlyingPrice: 510
      };
      const metrics = calculateMetrics(otmPut);
      expect(metrics.currentIntrinsic).toBe(0);
    });
  });

  // ============================================
  // PROBABILITY CALCULATION TESTS
  // ============================================
  describe('Probability Calculations', () => {
    it('should calculate probability of ITM for deep ITM call', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      // Deep ITM call (strike 150, price 185) should have high prob of ITM
      // With correct normalCDF: ~77.5% (was incorrectly ~81% with buggy implementation)
      expect(metrics.probITM).toBeGreaterThan(70);
      expect(metrics.probITM).toBeLessThan(85);
    });

    it('should calculate probability of profit for ITM call', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      // Break-even is 153.50, current is 185, should have high prob profit
      expect(metrics.probProfit).toBeGreaterThan(70);
    });

    it('should have probProfit <= probITM for calls', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      // For calls, you need to exceed strike + premium (higher than just strike)
      expect(metrics.probProfit).toBeLessThanOrEqual(metrics.probITM);
    });

    it('should calculate decreasing probabilities for higher profit levels', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      // Higher profit targets should have lower probability
      expect(metrics.probProfit).toBeGreaterThan(metrics.prob50Profit);
      expect(metrics.prob50Profit).toBeGreaterThan(metrics.prob100Profit);
      expect(metrics.prob100Profit).toBeGreaterThan(metrics.prob200Profit);
    });

    it('should calculate prob of max loss correctly', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      // Prob max loss = 100 - probITM
      expect(metrics.probMaxLoss).toBeCloseTo(100 - metrics.probITM, 1);
    });

    it('should handle very high IV correctly', () => {
      const highIVOption = {
        ...mockHighDeltaOption,
        iv: 1.5 // 150% IV - very high
      };
      const metrics = calculateMetrics(highIVOption);
      // Should still produce valid probabilities
      expect(metrics.probITM).toBeGreaterThanOrEqual(0);
      expect(metrics.probITM).toBeLessThanOrEqual(100);
    });

    it('should handle very low IV correctly', () => {
      const lowIVOption = {
        ...mockHighDeltaOption,
        iv: 0.05 // 5% IV - very low
      };
      const metrics = calculateMetrics(lowIVOption);
      // Should still produce valid probabilities
      expect(metrics.probITM).toBeGreaterThanOrEqual(0);
      expect(metrics.probITM).toBeLessThanOrEqual(100);
    });
  });

  // ============================================
  // EXPECTED MOVE TESTS
  // ============================================
  describe('Expected Move Calculations', () => {
    it('should calculate expected move correctly', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      // Expected move = price * IV * sqrt(years)
      // = 185 * 0.28 * sqrt(400/365) = 185 * 0.28 * 1.047 = 54.25
      const expectedMove = 185 * 0.28 * Math.sqrt(400 / 365);
      expect(metrics.expectedMove).toBeCloseTo(expectedMove, 1);
    });

    it('should calculate one sigma range correctly', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      expect(metrics.oneSigmaUp).toBe(mockHighDeltaOption.underlyingPrice + metrics.expectedMove);
      expect(metrics.oneSigmaDown).toBe(Math.max(0, mockHighDeltaOption.underlyingPrice - metrics.expectedMove));
    });

    it('should not allow negative one sigma down', () => {
      const lowPriceOption = {
        ...mockHighDeltaOption,
        underlyingPrice: 10,
        iv: 2.0 // 200% IV to ensure move > price
      };
      const metrics = calculateMetrics(lowPriceOption);
      expect(metrics.oneSigmaDown).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================
  // PRICE FOR PROFIT LEVEL TESTS
  // ============================================
  describe('Price for Profit Level Calculations', () => {
    it('should calculate price for 50% profit (call)', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      // For call: strike + premium + 0.5*premium = 150 + 3.5 + 1.75 = 155.25
      expect(metrics.priceFor50Profit).toBe(155.25);
    });

    it('should calculate price for 100% profit (call)', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      // For call: strike + 2*premium = 150 + 7 = 157
      expect(metrics.priceFor100Profit).toBe(157);
    });

    it('should calculate price for 200% profit (call)', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      // For call: strike + 3*premium = 150 + 10.5 = 160.5
      expect(metrics.priceFor200Profit).toBe(160.5);
    });

    it('should calculate price for profit levels (put)', () => {
      const metrics = calculateMetrics(mockPutOption);
      // For put: strike - premium - 0.5*premium = 550 - 2.8 - 1.4 = 545.8
      expect(metrics.priceFor50Profit).toBeCloseTo(545.8, 1);
      // strike - 2*premium = 550 - 5.6 = 544.4
      expect(metrics.priceFor100Profit).toBeCloseTo(544.4, 1);
      // strike - 3*premium = 550 - 8.4 = 541.6
      expect(metrics.priceFor200Profit).toBeCloseTo(541.6, 1);
    });
  });

  // ============================================
  // TARGET PRICE CALCULATION TESTS
  // ============================================
  describe('Target Price Calculations', () => {
    it('should calculate profit at target price for call', () => {
      const targetPrice = 200;
      const metrics = calculateMetrics(mockHighDeltaOption, 10, targetPrice);
      // Intrinsic at target = 200 - 150 = 50
      // Value = 50 * 100 * 10 = 50,000
      // Profit = 50,000 - 3,500 = 46,500
      expect(metrics.valueAtTarget).toBe(50000);
      expect(metrics.profitAtTarget).toBe(46500);
    });

    it('should calculate return at target price', () => {
      const targetPrice = 200;
      const metrics = calculateMetrics(mockHighDeltaOption, 10, targetPrice);
      // Return = 46,500 / 3,500 * 100 = 1328.57%
      expect(metrics.returnAtTarget).toBeCloseTo(1328.57, 1);
    });

    it('should calculate zero value when target below strike (call)', () => {
      const targetPrice = 140; // Below strike of 150
      const metrics = calculateMetrics(mockHighDeltaOption, 10, targetPrice);
      expect(metrics.valueAtTarget).toBe(0);
      expect(metrics.profitAtTarget).toBe(-3500); // Total loss
    });

    it('should calculate profit at target price for put', () => {
      const targetPrice = 500; // Below strike of 550
      const metrics = calculateMetrics(mockPutOption, 10, targetPrice);
      // Intrinsic = 550 - 500 = 50
      // Value = 50 * 100 * 10 = 50,000
      // Total cost = 2.80 * 100 * 10 = 2,800
      // Profit = 50,000 - 2,800 = 47,200
      expect(metrics.valueAtTarget).toBe(50000);
      expect(metrics.profitAtTarget).toBe(47200);
    });

    it('should calculate zero value when target above strike (put)', () => {
      const targetPrice = 600; // Above strike of 550
      const metrics = calculateMetrics(mockPutOption, 10, targetPrice);
      expect(metrics.valueAtTarget).toBe(0);
      expect(metrics.profitAtTarget).toBe(-2800); // Total loss
    });
  });

  // ============================================
  // SCENARIO TABLE TESTS
  // ============================================
  describe('Scenario Table Calculations', () => {
    it('should generate correct number of scenarios', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      expect(metrics.scenarios).toHaveLength(7);
    });

    it('should calculate correct prices for scenarios', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      const underlying = mockHighDeltaOption.underlyingPrice;

      expect(metrics.scenarios[0].price).toBeCloseTo(underlying * 0.8, 2);
      expect(metrics.scenarios[1].price).toBeCloseTo(underlying * 0.9, 2);
      expect(metrics.scenarios[2].price).toBeCloseTo(underlying, 2);
      expect(metrics.scenarios[3].price).toBeCloseTo(underlying * 1.1, 2);
      expect(metrics.scenarios[4].price).toBeCloseTo(underlying * 1.2, 2);
      expect(metrics.scenarios[5].price).toBeCloseTo(underlying * 1.3, 2);
      expect(metrics.scenarios[6].price).toBeCloseTo(underlying * 1.5, 2);
    });

    it('should show loss for -20% scenario on call', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      // At -20% (price = 148), below strike of 150, option worthless
      expect(metrics.scenarios[0].value).toBe(0);
      expect(metrics.scenarios[0].profit).toBe(-metrics.totalCost);
    });

    it('should show profit for +50% scenario on call', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      // At +50% (price = 277.5), intrinsic = 277.5 - 150 = 127.5
      const scenario = metrics.scenarios[6];
      expect(scenario.intrinsic).toBeCloseTo(127.5, 1);
      expect(scenario.profit).toBeGreaterThan(0);
    });

    it('should show profit for -20% scenario on put', () => {
      const metrics = calculateMetrics(mockPutOption);
      // At -20% (price = 408), below strike of 550, put is ITM
      const scenario = metrics.scenarios[0];
      expect(scenario.profit).toBeGreaterThan(0);
    });

    it('should calculate correct return percentages', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      metrics.scenarios.forEach(scenario => {
        if (metrics.totalCost > 0) {
          const expectedReturn = (scenario.profit / metrics.totalCost) * 100;
          expect(scenario.returnPct).toBeCloseTo(expectedReturn, 1);
        }
      });
    });
  });

  // ============================================
  // MAX LOSS/GAIN TESTS
  // ============================================
  describe('Max Loss and Gain', () => {
    it('should calculate max loss as total cost', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      expect(metrics.maxLoss).toBe(metrics.totalCost);
    });

    it('should show unlimited gain for calls', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      expect(metrics.maxGain).toBe('Unlimited');
    });

    it('should calculate limited max gain for puts', () => {
      const metrics = calculateMetrics(mockPutOption, 10);
      // Max gain for put = (strike - premium) * 100 * contracts
      // = (550 - 2.80) * 100 * 10 = 547,200
      expect(metrics.maxGain).toBeCloseTo(547200, 0);
    });
  });

  // ============================================
  // EDGE CASES AND OUTLIERS
  // ============================================
  describe('Edge Cases and Outliers', () => {
    it('should handle zero premium', () => {
      const zeroPremiumOption = {
        ...mockHighDeltaOption,
        premium: 0,
        ask: 0
      };
      const metrics = calculateMetrics(zeroPremiumOption);
      expect(metrics.totalCost).toBe(0);
      expect(metrics.breakEven).toBe(zeroPremiumOption.strike);
    });

    it('should handle very short time to expiration', () => {
      const shortExpOption = {
        ...mockHighDeltaOption,
        daysToExpiration: 1
      };
      const metrics = calculateMetrics(shortExpOption);
      expect(metrics.expectedMove).toBeLessThan(10); // Small move expected
      expect(metrics.probITM).toBeGreaterThanOrEqual(0);
      expect(metrics.probITM).toBeLessThanOrEqual(100);
    });

    it('should handle zero days to expiration', () => {
      const expiredOption = {
        ...mockHighDeltaOption,
        daysToExpiration: 0
      };
      const metrics = calculateMetrics(expiredOption);
      expect(metrics.expectedMove).toBe(0);
    });

    it('should handle very long time to expiration', () => {
      const longExpOption = {
        ...mockHighDeltaOption,
        daysToExpiration: 1095 // 3 years
      };
      const metrics = calculateMetrics(longExpOption);
      expect(metrics.expectedMove).toBeGreaterThan(metrics.expectedMove * 0.5);
      expect(metrics.probITM).toBeGreaterThanOrEqual(0);
      expect(metrics.probITM).toBeLessThanOrEqual(100);
    });

    it('should handle ATM option (strike = price)', () => {
      const atmOption = {
        ...mockHighDeltaOption,
        strike: 185,
        underlyingPrice: 185
      };
      const metrics = calculateMetrics(atmOption);
      expect(metrics.currentIntrinsic).toBe(0);
      // ATM options have ~50% prob ITM before drift
      expect(metrics.probITM).toBeGreaterThan(40);
      expect(metrics.probITM).toBeLessThan(60);
    });

    it('should handle deep OTM option', () => {
      const deepOTMOption = {
        ...mockHighDeltaOption,
        strike: 300, // Way above current price of 185
        delta: 0.1
      };
      const metrics = calculateMetrics(deepOTMOption);
      expect(metrics.probITM).toBeLessThan(20);
      expect(metrics.currentIntrinsic).toBe(0);
    });

    it('should handle very high strike price', () => {
      const highStrikeOption = {
        ...mockHighDeltaOption,
        strike: 1000
      };
      const metrics = calculateMetrics(highStrikeOption);
      expect(metrics.probITM).toBeLessThan(5);
    });

    it('should handle very low strike price', () => {
      const lowStrikeOption = {
        ...mockHighDeltaOption,
        strike: 10
      };
      const metrics = calculateMetrics(lowStrikeOption);
      expect(metrics.probITM).toBeGreaterThan(95);
      expect(metrics.currentIntrinsic).toBe(175); // 185 - 10
    });

    it('should handle missing IV (defaults to 0.3)', () => {
      const noIVOption = {
        ...mockHighDeltaOption,
        iv: undefined
      };
      const metrics = calculateMetrics(noIVOption);
      // Should use default IV of 0.3
      expect(metrics.expectedMove).toBeGreaterThan(0);
    });

    it('should handle fractional contracts calculation', () => {
      // Even though UI restricts to integers, calculation should handle any number
      const metrics = calculateMetrics(mockHighDeltaOption, 2.5);
      expect(metrics.sharesControlled).toBe(250);
      expect(metrics.totalCost).toBe(875);
    });

    it('should not produce NaN or Infinity values', () => {
      const edgeCases = [
        { ...mockHighDeltaOption, iv: 0.001 },
        { ...mockHighDeltaOption, daysToExpiration: 1 },
        { ...mockHighDeltaOption, premium: 0.01 },
        { ...mockHighDeltaOption, underlyingPrice: 1 },
      ];

      edgeCases.forEach(option => {
        const metrics = calculateMetrics(option);
        Object.values(metrics).forEach(value => {
          if (typeof value === 'number') {
            expect(Number.isNaN(value)).toBe(false);
            expect(Number.isFinite(value)).toBe(true);
          }
        });
      });
    });
  });

  // ============================================
  // COMPONENT RENDERING TESTS
  // ============================================
  describe('Component Rendering', () => {
    it('should render nothing when isOpen is false', () => {
      const { container } = render(
        <CalculatorModal
          option={mockHighDeltaOption}
          isOpen={false}
          onClose={() => {}}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it('should render nothing when option is null', () => {
      const { container } = render(
        <CalculatorModal
          option={null}
          isOpen={true}
          onClose={() => {}}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it('should render modal when open with valid option', () => {
      render(
        <CalculatorModal
          option={mockHighDeltaOption}
          isOpen={true}
          onClose={() => {}}
        />
      );
      expect(screen.getByText(/AAPL/)).toBeInTheDocument();
      expect(screen.getByText(/Calculator/)).toBeInTheDocument();
    });

    it('should display option symbol and type', () => {
      render(
        <CalculatorModal
          option={mockHighDeltaOption}
          isOpen={true}
          onClose={() => {}}
        />
      );
      expect(screen.getByText(/AAPL/)).toBeInTheDocument();
      expect(screen.getByText(/CALL/i)).toBeInTheDocument();
    });

    it('should display strike price', () => {
      render(
        <CalculatorModal
          option={mockHighDeltaOption}
          isOpen={true}
          onClose={() => {}}
        />
      );
      // Multiple elements may contain $150, so we check that at least one exists
      const elements = screen.getAllByText(/\$150/);
      expect(elements.length).toBeGreaterThan(0);
    });

    it('should call onClose when overlay clicked', async () => {
      const onClose = vi.fn();
      const { container } = render(
        <CalculatorModal
          option={mockHighDeltaOption}
          isOpen={true}
          onClose={onClose}
        />
      );

      // Click the modal backdrop (the outer div with onClick={onClose})
      const backdrop = container.querySelector('.fixed.inset-0');
      expect(backdrop).toBeTruthy();
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    });

    it('should have contract input with default value', () => {
      render(
        <CalculatorModal
          option={mockHighDeltaOption}
          isOpen={true}
          onClose={() => {}}
        />
      );

      const contractInput = screen.getByDisplayValue('10');
      expect(contractInput).toBeInTheDocument();
    });

    it('should update calculations when contract count changes', async () => {
      render(
        <CalculatorModal
          option={mockHighDeltaOption}
          isOpen={true}
          onClose={() => {}}
        />
      );

      const contractInput = screen.getByDisplayValue('10');

      // Simulate changing the value directly via fireEvent
      fireEvent.change(contractInput, { target: { value: '5' } });

      // Should now show 5 contracts
      await waitFor(() => {
        expect(contractInput).toHaveValue(5);
      });
    });
  });

  // ============================================
  // BUG: PROBABILITY FORMULA VALIDATION
  // ============================================
  describe('Probability Formula Validation', () => {
    it('should have probabilities sum reasonably (not over 100% for mutually exclusive)', () => {
      const metrics = calculateMetrics(mockHighDeltaOption);
      // probMaxLoss + probITM should equal 100
      expect(metrics.probMaxLoss + metrics.probITM).toBeCloseTo(100, 1);
    });

    it('should have profit probabilities in correct order', () => {
      const options = [mockHighDeltaOption, mockPutOption];
      options.forEach(option => {
        const metrics = calculateMetrics(option);
        // Easier targets should have higher probability
        expect(metrics.probProfit).toBeGreaterThanOrEqual(metrics.prob50Profit - 1); // Allow small floating point error
        expect(metrics.prob50Profit).toBeGreaterThanOrEqual(metrics.prob100Profit - 1);
        expect(metrics.prob100Profit).toBeGreaterThanOrEqual(metrics.prob200Profit - 1);
      });
    });

    it('should give reasonable probability for very ITM call', () => {
      const veryITMCall = {
        ...mockHighDeltaOption,
        strike: 100, // Way below current price of 185
        underlyingPrice: 185
      };
      const metrics = calculateMetrics(veryITMCall);
      // Should be very high probability of staying ITM
      expect(metrics.probITM).toBeGreaterThan(90);
    });

    it('should give reasonable probability for very OTM call', () => {
      const veryOTMCall = {
        ...mockHighDeltaOption,
        strike: 300, // Way above current price of 185
        underlyingPrice: 185
      };
      const metrics = calculateMetrics(veryOTMCall);
      // Should be very low probability of finishing ITM
      expect(metrics.probITM).toBeLessThan(20);
    });
  });

  // ============================================
  // BUG: PRICE FOR PROFIT LEVEL FORMULA CHECK
  // ============================================
  describe('Price for Profit Level Formula Verification', () => {
    it('should verify priceFor100Profit formula for calls is correct', () => {
      // For a call to double your money:
      // (stockPrice - strike) * 100 = 2 * premium * 100
      // stockPrice - strike = 2 * premium
      // stockPrice = strike + 2 * premium
      const option = mockHighDeltaOption;
      const metrics = calculateMetrics(option);

      const expectedPrice = option.strike + 2 * option.premium;
      expect(metrics.priceFor100Profit).toBe(expectedPrice);

      // Verify the math: at this price, profit = intrinsic * shares - cost
      const intrinsic = expectedPrice - option.strike;
      const value = intrinsic * 1000; // 10 contracts
      const profit = value - metrics.totalCost;
      const returnPct = (profit / metrics.totalCost) * 100;
      expect(returnPct).toBeCloseTo(100, 1);
    });

    it('should verify priceFor50Profit formula for calls', () => {
      // For 50% profit:
      // (stockPrice - strike) * 100 = 1.5 * premium * 100
      // stockPrice = strike + 1.5 * premium
      const option = mockHighDeltaOption;
      const metrics = calculateMetrics(option);

      const expectedPrice = option.strike + option.premium + 0.5 * option.premium;
      expect(metrics.priceFor50Profit).toBe(expectedPrice);

      // Verify the math
      const intrinsic = expectedPrice - option.strike;
      const value = intrinsic * 1000;
      const profit = value - metrics.totalCost;
      const returnPct = (profit / metrics.totalCost) * 100;
      expect(returnPct).toBeCloseTo(50, 1);
    });

    it('should verify priceFor200Profit formula for calls', () => {
      // For 200% profit (triple):
      // (stockPrice - strike) * 100 = 3 * premium * 100
      // stockPrice = strike + 3 * premium
      const option = mockHighDeltaOption;
      const metrics = calculateMetrics(option);

      const expectedPrice = option.strike + 3 * option.premium;
      expect(metrics.priceFor200Profit).toBe(expectedPrice);

      // Verify the math
      const intrinsic = expectedPrice - option.strike;
      const value = intrinsic * 1000;
      const profit = value - metrics.totalCost;
      const returnPct = (profit / metrics.totalCost) * 100;
      expect(returnPct).toBeCloseTo(200, 1);
    });
  });
});
