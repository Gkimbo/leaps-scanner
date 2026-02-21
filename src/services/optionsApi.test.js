/**
 * Options API Service Tests
 *
 * Tests for the options API service including:
 * - Filter functions
 * - Risk calculation
 * - Mock data generation
 * - API provider selection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchOptionsChain,
  filterHighRiskLeaps,
  calculateRiskLevel,
  getApiProvider
} from './optionsApi';
import {
  mockHighDeltaOption,
  mockLowDeltaOption,
  mockExpensiveOption,
  mockShortExpirationOption,
  mockAllOptions,
  defaultFilters
} from '../test/mocks/optionsData';

describe('optionsApi Service', () => {
  describe('filterHighRiskLeaps', () => {
    it('should filter options based on default criteria', () => {
      const result = filterHighRiskLeaps(mockAllOptions, defaultFilters);

      // Should include options that meet all criteria
      expect(result).toContainEqual(expect.objectContaining({ id: mockHighDeltaOption.id }));

      // Should exclude low delta option
      expect(result).not.toContainEqual(expect.objectContaining({ id: mockLowDeltaOption.id }));

      // Should exclude expensive option
      expect(result).not.toContainEqual(expect.objectContaining({ id: mockExpensiveOption.id }));

      // Should exclude short expiration option
      expect(result).not.toContainEqual(expect.objectContaining({ id: mockShortExpirationOption.id }));
    });

    it('should filter by minimum delta', () => {
      const filters = { ...defaultFilters, minDelta: 0.9 };
      const result = filterHighRiskLeaps(mockAllOptions, filters);

      // All results should have delta >= 0.9
      result.forEach(option => {
        expect(Math.abs(option.delta)).toBeGreaterThanOrEqual(0.9);
      });
    });

    it('should filter by maximum price', () => {
      const filters = { ...defaultFilters, maxPrice: 3.0 };
      const result = filterHighRiskLeaps(mockAllOptions, filters);

      // All results should have premium <= 3.0
      result.forEach(option => {
        expect(option.premium).toBeLessThanOrEqual(3.0);
      });
    });

    it('should filter by minimum days to expiration', () => {
      const filters = { ...defaultFilters, minDaysToExpiration: 300 };
      const result = filterHighRiskLeaps(mockAllOptions, filters);

      // All results should have daysToExpiration >= 300
      result.forEach(option => {
        expect(option.daysToExpiration).toBeGreaterThanOrEqual(300);
      });
    });

    it('should filter by minimum open interest', () => {
      const filters = { ...defaultFilters, minOpenInterest: 20000 };
      const result = filterHighRiskLeaps(mockAllOptions, filters);

      // All results should have openInterest >= 20000
      result.forEach(option => {
        expect(option.openInterest).toBeGreaterThanOrEqual(20000);
      });
    });

    it('should return empty array when no options match', () => {
      const impossibleFilters = {
        minDelta: 0.99,
        maxPrice: 0.01,
        minDaysToExpiration: 1000
      };
      const result = filterHighRiskLeaps(mockAllOptions, impossibleFilters);

      expect(result).toHaveLength(0);
    });

    it('should handle empty options array', () => {
      const result = filterHighRiskLeaps([], defaultFilters);

      expect(result).toHaveLength(0);
    });

    it('should use default values when filters not provided', () => {
      const result = filterHighRiskLeaps(mockAllOptions);

      // Should still work with defaults
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle put options with negative delta', () => {
      const putOptions = [{
        ...mockHighDeltaOption,
        id: 'TEST-PUT',
        optionType: 'put',
        delta: -0.85
      }];

      const result = filterHighRiskLeaps(putOptions, defaultFilters);

      // Should include put with absolute delta >= 0.8
      expect(result).toHaveLength(1);
    });
  });

  describe('calculateRiskLevel', () => {
    it('should return "low" for high delta and low IV', () => {
      const result = calculateRiskLevel(0.95, 0.25);
      expect(result).toBe('low');
    });

    it('should return "medium" for moderate delta and IV', () => {
      const result = calculateRiskLevel(0.87, 0.40);
      expect(result).toBe('medium');
    });

    it('should return "high" for lower delta or high IV', () => {
      const result = calculateRiskLevel(0.82, 0.55);
      expect(result).toBe('high');
    });

    it('should handle negative delta (puts)', () => {
      const result = calculateRiskLevel(-0.95, 0.25);
      expect(result).toBe('low');
    });

    it('should return "high" when delta is just at threshold but IV is high', () => {
      const result = calculateRiskLevel(0.80, 0.60);
      expect(result).toBe('high');
    });

    it('should return "low" for very high delta regardless of moderate IV', () => {
      const result = calculateRiskLevel(0.98, 0.30);
      expect(result).toBe('low');
    });
  });

  describe('getApiProvider', () => {
    it('should return the configured API provider', () => {
      const provider = getApiProvider();

      // Should return a valid provider string
      expect(typeof provider).toBe('string');
      expect(['mock', 'yahoo', 'polygon', 'tradier']).toContain(provider);
    });
  });

  describe('fetchOptionsChain', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return options data for a valid ticker', async () => {
      // Run the fetch with mock provider (set in test env)
      const fetchPromise = fetchOptionsChain('AAPL', 'call');

      // Fast-forward timers to skip the simulated delay
      await vi.runAllTimersAsync();

      const result = await fetchPromise;

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      // Check that options have required properties
      if (result.length > 0) {
        const option = result[0];
        expect(option).toHaveProperty('id');
        expect(option).toHaveProperty('symbol');
        expect(option).toHaveProperty('optionType');
        expect(option).toHaveProperty('strike');
        expect(option).toHaveProperty('expiration');
        expect(option).toHaveProperty('premium');
        expect(option).toHaveProperty('delta');
        expect(option).toHaveProperty('iv');
      }
    });

    it('should return options for put type', async () => {
      const fetchPromise = fetchOptionsChain('AAPL', 'put');
      await vi.runAllTimersAsync();

      const result = await fetchPromise;

      expect(Array.isArray(result)).toBe(true);

      // All options should be puts
      result.forEach(option => {
        expect(option.optionType).toBe('put');
      });
    });

    it('should handle different ticker symbols', async () => {
      const tickers = ['MSFT', 'GOOGL', 'TSLA'];

      for (const ticker of tickers) {
        const fetchPromise = fetchOptionsChain(ticker, 'call');
        await vi.runAllTimersAsync();

        const result = await fetchPromise;

        expect(Array.isArray(result)).toBe(true);
        // All results should have the correct symbol
        result.forEach(option => {
          expect(option.symbol.toUpperCase()).toBe(ticker);
        });
      }
    });

    it('should return options with valid delta range', async () => {
      const fetchPromise = fetchOptionsChain('SPY', 'call');
      await vi.runAllTimersAsync();

      const result = await fetchPromise;

      result.forEach(option => {
        // Delta should be between -1 and 1
        expect(option.delta).toBeGreaterThanOrEqual(-1);
        expect(option.delta).toBeLessThanOrEqual(1);
      });
    });

    it('should return options with positive premiums', async () => {
      const fetchPromise = fetchOptionsChain('QQQ', 'call');
      await vi.runAllTimersAsync();

      const result = await fetchPromise;

      result.forEach(option => {
        expect(option.premium).toBeGreaterThan(0);
      });
    });

    it('should return options with valid expiration dates', async () => {
      const fetchPromise = fetchOptionsChain('NVDA', 'call');
      await vi.runAllTimersAsync();

      const result = await fetchPromise;
      const today = new Date();

      result.forEach(option => {
        const expDate = new Date(option.expiration);
        // Expiration should be in the future
        expect(expDate.getTime()).toBeGreaterThan(today.getTime());
      });
    });
  });

  describe('Mock Data Generation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should generate LEAPS expirations (1+ year out)', async () => {
      const fetchPromise = fetchOptionsChain('AAPL', 'call');
      await vi.runAllTimersAsync();

      const result = await fetchPromise;
      const today = new Date();
      const oneYearFromNow = new Date(today);
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

      // At least some options should be LEAPS (>1 year)
      const leapsOptions = result.filter(opt => opt.daysToExpiration >= 365);
      expect(leapsOptions.length).toBeGreaterThan(0);
    });

    it('should include unusual volume and high IV flags', async () => {
      const fetchPromise = fetchOptionsChain('TSLA', 'call');
      await vi.runAllTimersAsync();

      const result = await fetchPromise;

      result.forEach(option => {
        expect(typeof option.unusualVolume).toBe('boolean');
        expect(typeof option.highIV).toBe('boolean');
      });
    });

    it('should include underlying price', async () => {
      const fetchPromise = fetchOptionsChain('META', 'call');
      await vi.runAllTimersAsync();

      const result = await fetchPromise;

      result.forEach(option => {
        expect(option.underlyingPrice).toBeGreaterThan(0);
      });
    });
  });
});
