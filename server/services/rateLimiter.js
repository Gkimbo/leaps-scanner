/**
 * Rate Limiter for API Calls
 *
 * Implements a token bucket algorithm to respect API rate limits.
 * Polygon.io free tier: 5 calls/minute
 */

class RateLimiter {
  /**
   * @param {number} maxCalls - Maximum calls allowed per window
   * @param {number} windowMs - Time window in milliseconds
   */
  constructor(maxCalls = 5, windowMs = 60000) {
    this.maxCalls = maxCalls;
    this.windowMs = windowMs;
    this.calls = [];
    this.queue = [];
    this.processing = false;
  }

  /**
   * Check if we can make a call right now
   */
  canCall() {
    this._pruneOldCalls();
    return this.calls.length < this.maxCalls;
  }

  /**
   * Record a call
   */
  recordCall() {
    this.calls.push(Date.now());
  }

  /**
   * Get time until next available slot (ms)
   */
  getWaitTime() {
    this._pruneOldCalls();

    if (this.calls.length < this.maxCalls) {
      return 0;
    }

    // Find oldest call and calculate when it expires
    const oldestCall = Math.min(...this.calls);
    const expiresAt = oldestCall + this.windowMs;
    return Math.max(0, expiresAt - Date.now() + 100); // +100ms buffer
  }

  /**
   * Remove calls outside the current window
   */
  _pruneOldCalls() {
    const cutoff = Date.now() - this.windowMs;
    this.calls = this.calls.filter(t => t > cutoff);
  }

  /**
   * Execute a function with rate limiting
   * Returns a promise that resolves when the function can be executed
   */
  async execute(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._processQueue();
    });
  }

  /**
   * Process queued requests
   */
  async _processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const waitTime = this.getWaitTime();

      if (waitTime > 0) {
        console.log(`Rate limit: waiting ${(waitTime / 1000).toFixed(1)}s...`);
        await this._sleep(waitTime);
      }

      const { fn, resolve, reject } = this.queue.shift();

      try {
        this.recordCall();
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }

    this.processing = false;
  }

  /**
   * Sleep helper
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current status
   */
  getStatus() {
    this._pruneOldCalls();
    return {
      callsInWindow: this.calls.length,
      maxCalls: this.maxCalls,
      windowMs: this.windowMs,
      available: this.maxCalls - this.calls.length,
      queueLength: this.queue.length,
      waitTime: this.getWaitTime()
    };
  }
}

/**
 * Batch Rate Limiter
 * Processes multiple requests while respecting rate limits
 */
class BatchRateLimiter extends RateLimiter {
  constructor(maxCalls = 5, windowMs = 60000) {
    super(maxCalls, windowMs);
  }

  /**
   * Execute multiple functions with rate limiting
   * @param {Array<Function>} fns - Array of async functions to execute
   * @param {Function} onProgress - Progress callback (index, total)
   * @returns {Promise<Array>} Results array
   */
  async executeBatch(fns, onProgress = null) {
    const results = [];

    for (let i = 0; i < fns.length; i++) {
      const waitTime = this.getWaitTime();

      if (waitTime > 0) {
        console.log(`Rate limit: waiting ${(waitTime / 1000).toFixed(1)}s before request ${i + 1}/${fns.length}...`);
        await this._sleep(waitTime);
      }

      try {
        this.recordCall();
        const result = await fns[i]();
        results.push({ success: true, result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }

      if (onProgress) {
        onProgress(i + 1, fns.length);
      }
    }

    return results;
  }
}

// Singleton instance for Polygon API (5 calls/minute)
export const polygonRateLimiter = new BatchRateLimiter(5, 60000);

// More aggressive limiter if needed (4 calls/minute with buffer)
export const safeRateLimiter = new BatchRateLimiter(4, 60000);

export default polygonRateLimiter;
