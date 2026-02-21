/**
 * Server-side Options Cache
 *
 * In-memory cache with TTL for options data.
 * Reduces API calls and improves response times.
 */

class OptionsCache {
  constructor(ttlMs = 30 * 60 * 1000) { // 30 minutes default
    this.cache = new Map();
    this.ttlMs = ttlMs;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0
    };
  }

  /**
   * Generate cache key
   */
  _key(ticker, optionType) {
    return `${ticker.toUpperCase()}-${optionType}`;
  }

  /**
   * Get cached options data
   * @returns {Object|null} Cached data or null if not found/expired
   */
  get(ticker, optionType) {
    const key = this._key(ticker, optionType);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return {
      options: entry.options,
      provider: entry.provider,
      cached: true,
      cacheAge: this._formatAge(Date.now() - entry.timestamp)
    };
  }

  /**
   * Store options data in cache
   */
  set(ticker, optionType, options, provider) {
    const key = this._key(ticker, optionType);
    this.cache.set(key, {
      options,
      provider,
      timestamp: Date.now()
    });
    this.stats.sets++;

    // Prune old entries if cache gets too large
    if (this.cache.size > 500) {
      this._prune();
    }
  }

  /**
   * Check if cache has valid entry
   */
  has(ticker, optionType) {
    return this.get(ticker, optionType) !== null;
  }

  /**
   * Clear all cached data
   */
  clear() {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, sets: 0 };
  }

  /**
   * Remove expired entries
   */
  _prune() {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
        pruned++;
      }
    }

    // If still too large, remove oldest entries
    if (this.cache.size > 400) {
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);

      const toRemove = entries.slice(0, this.cache.size - 400);
      for (const [key] of toRemove) {
        this.cache.delete(key);
        pruned++;
      }
    }

    if (pruned > 0) {
      console.log(`Cache pruned: removed ${pruned} entries`);
    }
  }

  /**
   * Format age in human-readable format
   */
  _formatAge(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);

    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s ago`;
    }
    return `${seconds}s ago`;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(1)
      : 0;

    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      hitRate: `${hitRate}%`,
      ttlMinutes: this.ttlMs / 60000
    };
  }
}

// Singleton instance
export const optionsCache = new OptionsCache();
export default optionsCache;
