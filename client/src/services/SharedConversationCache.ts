interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  persona_id?: string;
}

interface SharedConversationData {
  id: string;
  title: string;
  messages: ConversationMessage[];
  persona_id?: string;
  created_at: string;
  view_count: number;
  stats?: {
    viewCount: number;
    createdAt: string;
  };
}

interface CacheEntry {
  data: SharedConversationData;
  timestamp: number;
  expiresAt?: number;
}

interface CacheStats {
  totalEntries: number;
  totalSize: number; // in bytes (approximate)
  hitCount: number;
  missCount: number;
  hitRate: number;
}

class SharedConversationCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number = 100; // Maximum number of cached conversations
  private defaultTTL: number = 30 * 60 * 1000; // 30 minutes in milliseconds
  private hitCount: number = 0;
  private missCount: number = 0;

  // LRU tracking
  private accessOrder: string[] = [];

  // Global cache persistence
  private readonly STORAGE_KEY = 'yitam_shared_conversation_cache';
  private readonly STATS_KEY = 'yitam_cache_stats';
  private readonly ACCESS_ORDER_KEY = 'yitam_cache_access_order';

  // Cross-tab synchronization
  private isInitialized: boolean = false;

  constructor(maxSize?: number, defaultTTL?: number) {
    if (maxSize) this.maxSize = maxSize;
    if (defaultTTL) this.defaultTTL = defaultTTL;

    // Initialize from persistent storage
    this.initializeFromStorage();

    // Listen for storage changes from other tabs
    this.setupCrossTabSync();

    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanupExpired(), 5 * 60 * 1000);

    // Save to storage every 30 seconds
    setInterval(() => this.saveToStorage(), 30 * 1000);
  }

  /**
   * Initialize cache from persistent storage
   */
  private initializeFromStorage(): void {
    try {
      // Load cache data
      const storedCache = localStorage.getItem(this.STORAGE_KEY);
      if (storedCache) {
        const cacheData = JSON.parse(storedCache);
        const now = Date.now();

        // Restore cache entries, filtering out expired ones
        for (const [shareId, entry] of Object.entries(cacheData)) {
          const cacheEntry = entry as CacheEntry;
          if (!cacheEntry.expiresAt || now < cacheEntry.expiresAt) {
            this.cache.set(shareId, cacheEntry);
          }
        }

        console.log(`[Cache] Restored ${this.cache.size} conversations from storage`);
      }

      // Load access order
      const storedOrder = localStorage.getItem(this.ACCESS_ORDER_KEY);
      if (storedOrder) {
        this.accessOrder = JSON.parse(storedOrder);
        // Filter out entries that no longer exist in cache
        this.accessOrder = this.accessOrder.filter(id => this.cache.has(id));
      }

      // Load stats
      const storedStats = localStorage.getItem(this.STATS_KEY);
      if (storedStats) {
        const stats = JSON.parse(storedStats);
        this.hitCount = stats.hitCount || 0;
        this.missCount = stats.missCount || 0;
      }

      this.isInitialized = true;
    } catch (error) {
      console.warn('[Cache] Failed to initialize from storage:', error);
      this.isInitialized = true;
    }
  }

  /**
   * Save cache to persistent storage
   */
  private saveToStorage(): void {
    try {
      // Save cache data
      const cacheData: Record<string, CacheEntry> = {};
      for (const [shareId, entry] of this.cache) {
        cacheData[shareId] = entry;
      }
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cacheData));

      // Save access order
      localStorage.setItem(this.ACCESS_ORDER_KEY, JSON.stringify(this.accessOrder));

      // Save stats
      const stats = {
        hitCount: this.hitCount,
        missCount: this.missCount,
        lastSaved: Date.now()
      };
      localStorage.setItem(this.STATS_KEY, JSON.stringify(stats));

    } catch (error) {
      console.warn('[Cache] Failed to save to storage:', error);
    }
  }

  /**
   * Setup cross-tab synchronization
   */
  private setupCrossTabSync(): void {
    // Listen for storage events from other tabs
    window.addEventListener('storage', (event) => {
      if (event.key === this.STORAGE_KEY && event.newValue) {
        try {
          // Another tab updated the cache, sync our cache
          const cacheData = JSON.parse(event.newValue);
          const now = Date.now();

          // Clear current cache and reload from storage
          this.cache.clear();

          for (const [shareId, entry] of Object.entries(cacheData)) {
            const cacheEntry = entry as CacheEntry;
            if (!cacheEntry.expiresAt || now < cacheEntry.expiresAt) {
              this.cache.set(shareId, cacheEntry);
            }
          }

          console.log(`[Cache] Synced ${this.cache.size} conversations from other tab`);
        } catch (error) {
          console.warn('[Cache] Failed to sync from other tab:', error);
        }
      }

      if (event.key === this.ACCESS_ORDER_KEY && event.newValue) {
        try {
          this.accessOrder = JSON.parse(event.newValue);
          this.accessOrder = this.accessOrder.filter(id => this.cache.has(id));
        } catch (error) {
          console.warn('[Cache] Failed to sync access order:', error);
        }
      }

      if (event.key === this.STATS_KEY && event.newValue) {
        try {
          const stats = JSON.parse(event.newValue);
          // Don't overwrite our own stats, just log the sync
          console.log('[Cache] Stats synced from other tab');
        } catch (error) {
          console.warn('[Cache] Failed to sync stats:', error);
        }
      }
    });
  }

  /**
   * Get a conversation from cache
   */
  get(shareId: string): SharedConversationData | null {
    const entry = this.cache.get(shareId);
    
    if (!entry) {
      this.missCount++;
      return null;
    }

    // Check if entry has expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(shareId);
      this.removeFromAccessOrder(shareId);
      this.missCount++;
      return null;
    }

    // Update access order for LRU
    this.updateAccessOrder(shareId);
    this.hitCount++;
    
    console.log(`[Cache] Hit for conversation ${shareId}`);
    return entry.data;
  }

  /**
   * Store a conversation in cache
   */
  set(shareId: string, data: SharedConversationData, ttl?: number): void {
    const expiresAt = ttl ? Date.now() + ttl : Date.now() + this.defaultTTL;

    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      expiresAt
    };

    // If cache is full, remove least recently used item
    if (this.cache.size >= this.maxSize && !this.cache.has(shareId)) {
      this.evictLRU();
    }

    this.cache.set(shareId, entry);
    this.updateAccessOrder(shareId);

    // Save to storage immediately for new entries
    this.saveToStorage();

    console.log(`[Cache] Stored conversation ${shareId}, expires in ${Math.round((expiresAt - Date.now()) / 1000)}s`);
  }

  /**
   * Check if a conversation exists in cache and is not expired
   */
  has(shareId: string): boolean {
    const entry = this.cache.get(shareId);
    
    if (!entry) return false;
    
    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(shareId);
      this.removeFromAccessOrder(shareId);
      return false;
    }
    
    return true;
  }

  /**
   * Remove a conversation from cache
   */
  delete(shareId: string): boolean {
    const deleted = this.cache.delete(shareId);
    if (deleted) {
      this.removeFromAccessOrder(shareId);
      this.saveToStorage();
      console.log(`[Cache] Removed conversation ${shareId}`);
    }
    return deleted;
  }

  /**
   * Clear all cached conversations
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.hitCount = 0;
    this.missCount = 0;

    // Clear from storage as well
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(this.ACCESS_ORDER_KEY);
      localStorage.removeItem(this.STATS_KEY);
    } catch (error) {
      console.warn('[Cache] Failed to clear storage:', error);
    }

    console.log('[Cache] Cleared all cached conversations');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.hitCount + this.missCount;
    const hitRate = totalRequests > 0 ? (this.hitCount / totalRequests) * 100 : 0;
    
    // Calculate approximate cache size
    let totalSize = 0;
    for (const [key, entry] of this.cache) {
      totalSize += JSON.stringify(entry).length * 2; // Rough estimate (UTF-16)
    }

    return {
      totalEntries: this.cache.size,
      totalSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: Math.round(hitRate * 100) / 100
    };
  }

  /**
   * Get all cached conversation IDs
   */
  getCachedIds(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Preload conversations into cache
   */
  preload(conversations: Array<{ id: string; data: SharedConversationData; ttl?: number }>): void {
    conversations.forEach(({ id, data, ttl }) => {
      this.set(id, data, ttl);
    });
    console.log(`[Cache] Preloaded ${conversations.length} conversations`);
  }

  /**
   * Update access order for LRU eviction
   */
  private updateAccessOrder(shareId: string): void {
    // Remove from current position
    this.removeFromAccessOrder(shareId);
    // Add to end (most recently used)
    this.accessOrder.push(shareId);
  }

  /**
   * Remove from access order
   */
  private removeFromAccessOrder(shareId: string): void {
    const index = this.accessOrder.indexOf(shareId);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Evict least recently used item
   */
  private evictLRU(): void {
    if (this.accessOrder.length > 0) {
      const lruId = this.accessOrder[0];
      this.cache.delete(lruId);
      this.accessOrder.shift();
      console.log(`[Cache] Evicted LRU conversation ${lruId}`);
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [shareId, entry] of this.cache) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.cache.delete(shareId);
        this.removeFromAccessOrder(shareId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.saveToStorage();
      console.log(`[Cache] Cleaned up ${cleanedCount} expired conversations`);
    }
  }

  /**
   * Set cache configuration
   */
  configure(options: { maxSize?: number; defaultTTL?: number }): void {
    if (options.maxSize !== undefined) {
      this.maxSize = options.maxSize;

      // If new max size is smaller, evict excess items
      while (this.cache.size > this.maxSize) {
        this.evictLRU();
      }
    }

    if (options.defaultTTL !== undefined) {
      this.defaultTTL = options.defaultTTL;
    }

    // Save configuration changes
    this.saveToStorage();

    console.log(`[Cache] Configured: maxSize=${this.maxSize}, defaultTTL=${this.defaultTTL}ms`);
  }

  /**
   * Get storage usage information
   */
  getStorageInfo(): { used: number; available: number; percentage: number } {
    try {
      // Estimate localStorage usage
      let used = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          used += localStorage[key].length + key.length;
        }
      }

      // Most browsers have ~5-10MB localStorage limit
      const available = 10 * 1024 * 1024; // 10MB estimate
      const percentage = (used / available) * 100;

      return { used, available, percentage };
    } catch (error) {
      return { used: 0, available: 0, percentage: 0 };
    }
  }

  /**
   * Force save current state to storage
   */
  forceSave(): void {
    this.saveToStorage();
  }

  /**
   * Check if cache is initialized from storage
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

// Create singleton instance
export const sharedConversationCache = new SharedConversationCache();

// Export types
export type { SharedConversationData, ConversationMessage, CacheStats };
export default SharedConversationCache;
