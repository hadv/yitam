/**
 * In-memory cache service for Yitam Context Engine
 * Replaces Redis with a simple, efficient in-memory solution
 */

export interface CacheItem<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheStats {
  totalItems: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  memoryUsage: number;
  oldestItem: number;
  newestItem: number;
}

export interface MemoryCacheConfig {
  maxSize: number;
  ttlMinutes: number;
  cleanupIntervalMinutes: number;
  enableStats: boolean;
}

export class MemoryCache {
  private cache: Map<string, CacheItem<any>> = new Map();
  private config: MemoryCacheConfig;
  private stats = {
    hitCount: 0,
    missCount: 0
  };
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: MemoryCacheConfig) {
    this.config = {
      ...config,
      cleanupIntervalMinutes: config.cleanupIntervalMinutes || 5, // Default cleanup every 5 minutes
      enableStats: config.enableStats !== undefined ? config.enableStats : true
    };

    // Start automatic cleanup
    this.startCleanupTimer();
  }

  /**
   * Set a value in the cache
   */
  set<T>(key: string, value: T, ttlMinutes?: number): void {
    const now = Date.now();
    const ttl = ttlMinutes || this.config.ttlMinutes;
    const expiresAt = now + (ttl * 60 * 1000);

    // If cache is full, remove oldest items
    if (this.cache.size >= this.config.maxSize) {
      this.evictOldestItems();
    }

    const item: CacheItem<T> = {
      value,
      expiresAt,
      createdAt: now,
      accessCount: 0,
      lastAccessed: now
    };

    this.cache.set(key, item);
  }

  /**
   * Get a value from the cache
   */
  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) {
      if (this.config.enableStats) {
        this.stats.missCount++;
      }
      return null;
    }

    // Check if expired
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      if (this.config.enableStats) {
        this.stats.missCount++;
      }
      return null;
    }

    // Update access stats
    item.accessCount++;
    item.lastAccessed = Date.now();

    if (this.config.enableStats) {
      this.stats.hitCount++;
    }

    return item.value as T;
  }

  /**
   * Check if a key exists in the cache
   */
  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;

    // Check if expired
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a key from the cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all items from the cache
   */
  clear(): void {
    this.cache.clear();
    this.stats.hitCount = 0;
    this.stats.missCount = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const now = Date.now();
    let oldestItem = now;
    let newestItem = 0;
    let memoryUsage = 0;

    for (const [key, item] of this.cache.entries()) {
      if (item.createdAt < oldestItem) oldestItem = item.createdAt;
      if (item.createdAt > newestItem) newestItem = item.createdAt;
      
      // Rough memory estimation
      memoryUsage += key.length * 2; // String key
      memoryUsage += JSON.stringify(item.value).length * 2; // Value
      memoryUsage += 64; // Overhead for CacheItem structure
    }

    const totalRequests = this.stats.hitCount + this.stats.missCount;
    const hitRate = totalRequests > 0 ? this.stats.hitCount / totalRequests : 0;

    return {
      totalItems: this.cache.size,
      hitCount: this.stats.hitCount,
      missCount: this.stats.missCount,
      hitRate,
      memoryUsage,
      oldestItem: oldestItem === now ? 0 : oldestItem,
      newestItem
    };
  }

  /**
   * Get all keys in the cache
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Set TTL for an existing key
   */
  expire(key: string, ttlMinutes: number): boolean {
    const item = this.cache.get(key);
    if (!item) return false;

    item.expiresAt = Date.now() + (ttlMinutes * 60 * 1000);
    return true;
  }

  /**
   * Get TTL for a key in minutes
   */
  getTTL(key: string): number {
    const item = this.cache.get(key);
    if (!item) return -1;

    const remainingMs = item.expiresAt - Date.now();
    return remainingMs > 0 ? Math.ceil(remainingMs / (60 * 1000)) : 0;
  }

  /**
   * Get items that match a pattern
   */
  getByPattern(pattern: RegExp): Array<{key: string, value: any}> {
    const results: Array<{key: string, value: any}> = [];
    const now = Date.now();

    for (const [key, item] of this.cache.entries()) {
      // Skip expired items
      if (now > item.expiresAt) {
        this.cache.delete(key);
        continue;
      }

      if (pattern.test(key)) {
        results.push({ key, value: item.value });
      }
    }

    return results;
  }

  /**
   * Increment a numeric value
   */
  increment(key: string, delta: number = 1): number {
    const current = this.get<number>(key) || 0;
    const newValue = current + delta;
    this.set(key, newValue);
    return newValue;
  }

  /**
   * Set if not exists
   */
  setNX<T>(key: string, value: T, ttlMinutes?: number): boolean {
    if (this.has(key)) {
      return false;
    }
    this.set(key, value, ttlMinutes);
    return true;
  }

  // Private methods

  private evictOldestItems(): void {
    // Remove 10% of items or at least 1 item
    const itemsToRemove = Math.max(1, Math.floor(this.config.maxSize * 0.1));
    
    // Sort by last accessed time (LRU eviction)
    const sortedEntries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    for (let i = 0; i < itemsToRemove && i < sortedEntries.length; i++) {
      this.cache.delete(sortedEntries[i][0]);
    }
  }

  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    const intervalMs = this.config.cleanupIntervalMinutes * 60 * 1000;
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }

  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.cache.delete(key));

    if (expiredKeys.length > 0) {
      console.log(`MemoryCache: Cleaned up ${expiredKeys.length} expired items`);
    }
  }

  /**
   * Stop the cleanup timer (call when shutting down)
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.clear();
  }
}

/**
 * Global memory cache instance
 */
let globalCache: MemoryCache | null = null;

export function getGlobalMemoryCache(config?: MemoryCacheConfig): MemoryCache {
  if (!globalCache) {
    globalCache = new MemoryCache(config || {
      maxSize: 1000,
      ttlMinutes: 30,
      cleanupIntervalMinutes: 5,
      enableStats: true
    });
  }
  return globalCache;
}

export function destroyGlobalMemoryCache(): void {
  if (globalCache) {
    globalCache.destroy();
    globalCache = null;
  }
}

/**
 * Context-specific cache for the Context Engine
 */
export class ContextMemoryCache extends MemoryCache {
  constructor(config: MemoryCacheConfig) {
    super(config);
  }

  /**
   * Cache context window data
   */
  cacheContext(chatId: string, query: string, contextData: any, ttlMinutes?: number): void {
    const cacheKey = this.generateContextKey(chatId, query);
    this.set(cacheKey, {
      contextData,
      timestamp: Date.now(),
      chatId,
      query
    }, ttlMinutes);
  }

  /**
   * Get cached context
   */
  getCachedContext(chatId: string, query: string): any | null {
    const cacheKey = this.generateContextKey(chatId, query);
    const cached = this.get<{contextData: any, timestamp: number, chatId: string, query: string}>(cacheKey);

    if (cached) {
      // Update hit count for analytics
      this.increment(`stats:context_hits:${chatId}`);
      return cached.contextData;
    }

    this.increment(`stats:context_misses:${chatId}`);
    return null;
  }

  /**
   * Cache conversation summary
   */
  cacheSummary(chatId: string, segmentId: number, summary: string, ttlMinutes?: number): void {
    const cacheKey = `summary:${chatId}:${segmentId}`;
    this.set(cacheKey, summary, ttlMinutes);
  }

  /**
   * Get cached summary
   */
  getCachedSummary(chatId: string, segmentId: number): string | null {
    const cacheKey = `summary:${chatId}:${segmentId}`;
    return this.get(cacheKey);
  }

  /**
   * Cache vector search results
   */
  cacheVectorSearch(query: string, results: any[], ttlMinutes?: number): void {
    const cacheKey = `vector:${this.hashQuery(query)}`;
    this.set(cacheKey, results, ttlMinutes);
  }

  /**
   * Get cached vector search results
   */
  getCachedVectorSearch(query: string): any[] | null {
    const cacheKey = `vector:${this.hashQuery(query)}`;
    return this.get(cacheKey);
  }

  /**
   * Get cache statistics for a specific chat
   */
  getChatCacheStats(chatId: string): {hits: number, misses: number, hitRate: number} {
    const hits = (this.get<number>(`stats:context_hits:${chatId}`) || 0) as number;
    const misses = (this.get<number>(`stats:context_misses:${chatId}`) || 0) as number;
    const total = hits + misses;
    const hitRate = total > 0 ? hits / total : 0;

    return { hits, misses, hitRate };
  }

  private generateContextKey(chatId: string, query: string): string {
    const queryHash = this.hashQuery(query);
    return `context:${chatId}:${queryHash}`;
  }

  private hashQuery(query: string): string {
    // Simple hash function for query
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}
