/**
 * Scan Cache Service
 *
 * Persistent cache for scan results using localStorage.
 * Features TTL-based expiration and automatic persistence.
 */

const STORAGE_KEY = 'leaps_scanner_cache';
const SINGLE_TICKER_KEY = 'leaps_scanner_single_ticker';

/**
 * ScanCache Class
 *
 * Caches scan results to avoid re-fetching when only filters change.
 * Data persists in localStorage for long-term storage.
 */
export class ScanCache {
  /**
   * @param {Object} options
   * @param {number} options.ttlMs - Time to live in milliseconds (default 24 hours)
   * @param {number} options.maxSize - Maximum cached entries (default 20)
   */
  constructor(options = {}) {
    this.ttlMs = options.ttlMs || 24 * 60 * 60 * 1000; // 24 hours default
    this.maxSize = options.maxSize || 20;
    this.cache = new Map();
    this.loadFromStorage();
  }

  /**
   * Load cache from localStorage
   */
  loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert array back to Map
        if (Array.isArray(parsed)) {
          for (const [key, entry] of parsed) {
            // Only load non-expired entries
            if (Date.now() - entry.timestamp <= this.ttlMs) {
              this.cache.set(key, entry);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load cache from storage:', e);
      this.cache = new Map();
    }
  }

  /**
   * Save cache to localStorage
   */
  saveToStorage() {
    try {
      // Convert Map to array for JSON serialization
      const entries = Array.from(this.cache.entries());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      console.warn('Failed to save cache to storage:', e);
    }
  }

  /**
   * Generate cache key from scan parameters
   * @param {string} optionType - 'call' or 'put'
   * @param {Object} filters - Filter criteria (not used for cache key anymore)
   * @returns {string} Cache key
   */
  generateKey(optionType, options = {}) {
    // Only use optionType and includeTrending for cache key
    // Filters are applied client-side, so we cache raw results
    const { includeTrending = false } = options;
    return `${optionType}-trending:${includeTrending}`;
  }

  /**
   * Get cached results if valid (not expired)
   * @param {string} key - Cache key
   * @returns {Object|null} Cached data or null if not found/expired
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.saveToStorage();
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data;
  }

  /**
   * Get cache entry with metadata (including timestamp)
   * @param {string} key - Cache key
   * @returns {Object|null} Full cache entry or null
   */
  getWithMeta(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.saveToStorage();
      return null;
    }

    return entry;
  }

  /**
   * Store scan results in cache
   * @param {string} key - Cache key
   * @param {Object} data - Data to cache
   */
  set(key, data) {
    // Enforce size limit (LRU eviction)
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });

    this.saveToStorage();
  }

  /**
   * Check if cache has valid entry
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Clear all cached data
   */
  clear() {
    this.cache.clear();
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Clear expired entries
   */
  prune() {
    const now = Date.now();
    let pruned = false;
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
        pruned = true;
      }
    }
    if (pruned) {
      this.saveToStorage();
    }
  }

  /**
   * Get cache size
   * @returns {number}
   */
  size() {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;
    let oldestTimestamp = now;
    let newestTimestamp = 0;

    for (const entry of this.cache.values()) {
      if (now - entry.timestamp > this.ttlMs) {
        expiredEntries++;
      } else {
        validEntries++;
        if (entry.timestamp < oldestTimestamp) oldestTimestamp = entry.timestamp;
        if (entry.timestamp > newestTimestamp) newestTimestamp = entry.timestamp;
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
      oldestTimestamp: validEntries > 0 ? oldestTimestamp : null,
      newestTimestamp: validEntries > 0 ? newestTimestamp : null
    };
  }

  /**
   * Get age of cached data in human-readable format
   * @param {string} key - Cache key
   * @returns {string|null} Human-readable age or null if not cached
   */
  getAge(key) {
    const entry = this.getWithMeta(key);
    if (!entry) return null;

    const ageMs = Date.now() - entry.timestamp;
    const seconds = Math.floor(ageMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'Just now';
    }
  }
}

/**
 * Single Ticker Cache
 * Persists single ticker search results separately
 */
export class SingleTickerCache {
  constructor(ttlMs = 24 * 60 * 60 * 1000) { // 24 hours default
    this.ttlMs = ttlMs;
    this.cache = new Map();
    this.loadFromStorage();
  }

  loadFromStorage() {
    try {
      const stored = localStorage.getItem(SINGLE_TICKER_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          for (const [key, entry] of parsed) {
            if (Date.now() - entry.timestamp <= this.ttlMs) {
              this.cache.set(key, entry);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load single ticker cache:', e);
    }
  }

  saveToStorage() {
    try {
      const entries = Array.from(this.cache.entries());
      localStorage.setItem(SINGLE_TICKER_KEY, JSON.stringify(entries));
    } catch (e) {
      console.warn('Failed to save single ticker cache:', e);
    }
  }

  /**
   * Generate key for single ticker
   * @param {string} ticker
   * @param {string} optionType
   * @returns {string}
   */
  generateKey(ticker, optionType) {
    return `${ticker.toUpperCase()}-${optionType}`;
  }

  get(ticker, optionType) {
    const key = this.generateKey(ticker, optionType);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.saveToStorage();
      return null;
    }

    return entry.data;
  }

  getWithMeta(ticker, optionType) {
    const key = this.generateKey(ticker, optionType);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.saveToStorage();
      return null;
    }

    return entry;
  }

  set(ticker, optionType, data) {
    const key = this.generateKey(ticker, optionType);

    // Limit to 50 tickers
    if (this.cache.size >= 50 && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });

    this.saveToStorage();
  }

  getAge(ticker, optionType) {
    const entry = this.getWithMeta(ticker, optionType);
    if (!entry) return null;

    const ageMs = Date.now() - entry.timestamp;
    const seconds = Math.floor(ageMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'Just now';
    }
  }

  clear() {
    this.cache.clear();
    localStorage.removeItem(SINGLE_TICKER_KEY);
  }
}

// Singleton instances for app-wide use
export const scanCache = new ScanCache();
export const singleTickerCache = new SingleTickerCache();

// Export default instance
export default scanCache;
