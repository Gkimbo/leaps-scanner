/**
 * Rate Limiter Utility
 *
 * Provides throttling for API calls to respect rate limits.
 * Used for Finnhub (60 calls/min) and Yahoo Finance requests.
 */

/**
 * Simple delay helper
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a throttled version of an async function
 * Ensures minimum delay between consecutive calls
 *
 * @param {Function} fn - Async function to throttle
 * @param {number} callsPerMinute - Maximum calls per minute (default 60)
 * @returns {Function} Throttled function
 */
export function createThrottledFunction(fn, callsPerMinute = 60) {
  const minDelayMs = Math.ceil(60000 / callsPerMinute);
  let lastCallTime = 0;

  return async function throttled(...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    if (timeSinceLastCall < minDelayMs) {
      await delay(minDelayMs - timeSinceLastCall);
    }

    lastCallTime = Date.now();
    return fn(...args);
  };
}

/**
 * Token Bucket Rate Limiter
 *
 * More sophisticated rate limiting that allows burst requests
 * while maintaining average rate over time.
 */
export class RateLimiter {
  /**
   * @param {Object} options
   * @param {number} options.maxTokens - Maximum tokens (burst capacity)
   * @param {number} options.refillRate - Tokens added per minute
   */
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 60;
    this.refillRate = options.refillRate || 60;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = (elapsed / 60) * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Attempt to consume a token, waiting if necessary
   * @returns {Promise<void>}
   */
  async acquire() {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Calculate wait time for next token
    const tokensNeeded = 1 - this.tokens;
    const waitMs = (tokensNeeded / this.refillRate) * 60000;

    await delay(waitMs);
    this.refill();
    this.tokens -= 1;
  }

  /**
   * Get current available tokens
   * @returns {number}
   */
  getAvailableTokens() {
    this.refill();
    return Math.floor(this.tokens);
  }

  /**
   * Check if a token is immediately available
   * @returns {boolean}
   */
  canAcquire() {
    this.refill();
    return this.tokens >= 1;
  }
}

/**
 * Calculate delay between requests for a given rate limit
 * @param {number} callsPerMinute - Calls allowed per minute
 * @returns {number} Delay in milliseconds
 */
export function calculateDelay(callsPerMinute) {
  return Math.ceil(60000 / callsPerMinute);
}
