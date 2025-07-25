import { SharedConversation } from '../db/database';

interface CacheEntry {
  data: SharedConversation;
  timestamp: number;
  expiresAt?: number;
}

interface CacheStats {
  totalKeys: number;
  memoryUsage: string;
  hitCount: number;
  missCount: number;
  hitRate: number;
  uptime: number;
}

class MemoryCache {
  private cache: Map<string, CacheEntry> = new Map();
  private hitCount: number = 0;
  private missCount: number = 0;
  private startTime: number = Date.now();
  private maxSize: number = 1000; // Maximum number of entries
  private defaultTTL: number = 3600; // Default TTL in seconds
  private cleanupInterval: NodeJS.Timeout;

  // LRU tracking
  private accessOrder: string[] = [];

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanupExpired(), 5 * 60 * 1000);
    console.log('[MemoryCache] In-memory cache initialized');
  }

  /**
   * Initialize cache (for compatibility with Redis interface)
   */
  async connect(): Promise<void> {
    console.log('[MemoryCache] Memory cache ready (no connection needed)');
    return Promise.resolve();
  }

  /**
   * Get a shared conversation from cache
   */
  async getConversation(shareId: string): Promise<SharedConversation | null> {
    try {
      const entry = this.cache.get(shareId);
      
      if (!entry) {
        this.missCount++;
        console.log(`[MemoryCache] Cache miss for conversation ${shareId}`);
        return null;
      }

      // Check if entry has expired
      if (entry.expiresAt && Date.now() > entry.expiresAt * 1000) {
        this.cache.delete(shareId);
        this.removeFromAccessOrder(shareId);
        this.missCount++;
        console.log(`[MemoryCache] Expired entry removed for conversation ${shareId}`);
        return null;
      }

      // Update access order for LRU
      this.updateAccessOrder(shareId);
      this.hitCount++;
      console.log(`[MemoryCache] Cache hit for conversation ${shareId}`);
      
      return entry.data;
    } catch (error) {
      console.error('[MemoryCache] Error getting conversation:', error);
      this.missCount++;
      return null;
    }
  }

  /**
   * Store a shared conversation in cache
   */
  async setConversation(shareId: string, conversation: SharedConversation, ttlSeconds?: number): Promise<void> {
    try {
      const ttl = ttlSeconds || this.defaultTTL;
      const expiresAt = Math.floor(Date.now() / 1000) + ttl;

      const entry: CacheEntry = {
        data: conversation,
        timestamp: Date.now(),
        expiresAt
      };

      // If cache is full, remove least recently used item
      if (this.cache.size >= this.maxSize && !this.cache.has(shareId)) {
        this.evictLRU();
      }

      this.cache.set(shareId, entry);
      this.updateAccessOrder(shareId);
      
      console.log(`[MemoryCache] Cached conversation ${shareId} for ${ttl} seconds`);
    } catch (error) {
      console.error('[MemoryCache] Error setting conversation:', error);
    }
  }

  /**
   * Remove a conversation from cache
   */
  async deleteConversation(shareId: string): Promise<void> {
    try {
      const deleted = this.cache.delete(shareId);
      if (deleted) {
        this.removeFromAccessOrder(shareId);
        console.log(`[MemoryCache] Removed conversation ${shareId} from cache`);
      }
    } catch (error) {
      console.error('[MemoryCache] Error deleting conversation:', error);
    }
  }

  /**
   * Check if a conversation exists in cache
   */
  async hasConversation(shareId: string): Promise<boolean> {
    try {
      const entry = this.cache.get(shareId);
      
      if (!entry) return false;
      
      // Check expiration
      if (entry.expiresAt && Date.now() > entry.expiresAt * 1000) {
        this.cache.delete(shareId);
        this.removeFromAccessOrder(shareId);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('[MemoryCache] Error checking conversation existence:', error);
      return false;
    }
  }

  /**
   * Batch delete conversations from cache
   */
  async deleteConversations(shareIds: string[]): Promise<void> {
    try {
      let deletedCount = 0;
      for (const shareId of shareIds) {
        if (this.cache.delete(shareId)) {
          this.removeFromAccessOrder(shareId);
          deletedCount++;
        }
      }
      console.log(`[MemoryCache] Removed ${deletedCount} conversations from cache`);
    } catch (error) {
      console.error('[MemoryCache] Error batch deleting conversations:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      // Calculate approximate memory usage
      let memoryBytes = 0;
      for (const [key, entry] of this.cache) {
        // Rough estimation: key + JSON stringified data
        memoryBytes += key.length * 2; // UTF-16 characters
        memoryBytes += JSON.stringify(entry).length * 2;
      }

      const memoryUsage = this.formatBytes(memoryBytes);
      const totalRequests = this.hitCount + this.missCount;
      const hitRate = totalRequests > 0 ? (this.hitCount / totalRequests) * 100 : 0;

      return {
        totalKeys: this.cache.size,
        memoryUsage,
        hitCount: this.hitCount,
        missCount: this.missCount,
        hitRate: Math.round(hitRate * 100) / 100,
        uptime: Date.now() - this.startTime
      };
    } catch (error) {
      console.error('[MemoryCache] Error getting stats:', error);
      return {
        totalKeys: 0,
        memoryUsage: '0B',
        hitCount: this.hitCount,
        missCount: this.missCount,
        hitRate: 0,
        uptime: Date.now() - this.startTime
      };
    }
  }

  /**
   * Clear all cached conversations
   */
  async clearAll(): Promise<void> {
    try {
      const count = this.cache.size;
      this.cache.clear();
      this.accessOrder = [];
      console.log(`[MemoryCache] Cleared ${count} conversations from cache`);
    } catch (error) {
      console.error('[MemoryCache] Error clearing cache:', error);
    }
  }

  /**
   * Set cache TTL for a conversation
   */
  async setTTL(shareId: string, ttlSeconds: number): Promise<void> {
    try {
      const entry = this.cache.get(shareId);
      if (entry) {
        entry.expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
        console.log(`[MemoryCache] Set TTL for conversation ${shareId} to ${ttlSeconds} seconds`);
      }
    } catch (error) {
      console.error('[MemoryCache] Error setting TTL:', error);
    }
  }

  /**
   * Get remaining TTL for a conversation
   */
  async getTTL(shareId: string): Promise<number> {
    try {
      const entry = this.cache.get(shareId);
      if (!entry || !entry.expiresAt) {
        return -1; // No expiration set
      }
      
      const remaining = entry.expiresAt - Math.floor(Date.now() / 1000);
      return Math.max(remaining, -2); // -2 means expired
    } catch (error) {
      console.error('[MemoryCache] Error getting TTL:', error);
      return -1;
    }
  }

  /**
   * Close cache (cleanup)
   */
  async disconnect(): Promise<void> {
    try {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
      this.cache.clear();
      this.accessOrder = [];
      console.log('[MemoryCache] Memory cache disconnected and cleared');
    } catch (error) {
      console.error('[MemoryCache] Error disconnecting:', error);
    }
  }

  /**
   * Check if cache is available
   */
  isAvailable(): boolean {
    return true; // Memory cache is always available
  }

  /**
   * Health check for memory cache
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; latency?: number; error?: string }> {
    try {
      const start = Date.now();
      // Simple operation to test cache
      await this.hasConversation('health-check-test');
      const latency = Date.now() - start;
      
      return { status: 'healthy', latency };
    } catch (error) {
      return { status: 'unhealthy', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Update access order for LRU eviction
   */
  private updateAccessOrder(shareId: string): void {
    this.removeFromAccessOrder(shareId);
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
      console.log(`[MemoryCache] Evicted LRU conversation ${lruId}`);
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    const now = Math.floor(Date.now() / 1000);
    let cleanedCount = 0;

    for (const [shareId, entry] of this.cache) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.cache.delete(shareId);
        this.removeFromAccessOrder(shareId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[MemoryCache] Cleaned up ${cleanedCount} expired conversations`);
    }
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + sizes[i];
  }
}

// Export singleton instance
export const memoryCache = new MemoryCache();
export default MemoryCache;
