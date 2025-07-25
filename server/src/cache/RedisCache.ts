import { createClient, RedisClientType } from 'redis';
import { SharedConversation } from '../db/database';

interface CacheStats {
  totalKeys: number;
  memoryUsage: string;
  hitCount: number;
  missCount: number;
  hitRate: number;
  uptime: number;
}

interface CacheConfig {
  ttl: number; // Time to live in seconds
  maxMemory: string; // e.g., "100mb"
  evictionPolicy: string; // e.g., "allkeys-lru"
}

class RedisCache {
  private client: RedisClientType;
  private isConnected: boolean = false;
  private hitCount: number = 0;
  private missCount: number = 0;
  private startTime: number = Date.now();

  // Cache key prefixes
  private readonly CONVERSATION_PREFIX = 'conversation:';
  private readonly STATS_PREFIX = 'stats:';
  private readonly CONFIG_PREFIX = 'config:';

  constructor() {
    // Initialize Redis client with fallback configuration
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        connectTimeout: 5000,
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      console.log('[Redis] Connecting to Redis server...');
    });

    this.client.on('ready', () => {
      console.log('[Redis] Connected and ready');
      this.isConnected = true;
    });

    this.client.on('error', (err) => {
      console.error('[Redis] Connection error:', err);
      this.isConnected = false;
    });

    this.client.on('end', () => {
      console.log('[Redis] Connection closed');
      this.isConnected = false;
    });
  }

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.client.connect();
        await this.configureCache();
        console.log('[Redis] Cache initialized successfully');
      }
    } catch (error) {
      console.error('[Redis] Failed to connect:', error);
      // Continue without Redis - graceful degradation
    }
  }

  /**
   * Configure Redis for optimal caching
   */
  private async configureCache(): Promise<void> {
    try {
      // Set memory policy for automatic eviction
      await this.client.configSet('maxmemory-policy', 'allkeys-lru');
      
      // Set reasonable memory limit if not set
      const maxMemory = await this.client.configGet('maxmemory');
      if (!maxMemory.maxmemory || maxMemory.maxmemory === '0') {
        await this.client.configSet('maxmemory', '100mb');
      }

      console.log('[Redis] Cache configuration applied');
    } catch (error) {
      console.warn('[Redis] Failed to configure cache:', error);
    }
  }

  /**
   * Get a shared conversation from cache
   */
  async getConversation(shareId: string): Promise<SharedConversation | null> {
    if (!this.isConnected) {
      this.missCount++;
      return null;
    }

    try {
      const key = this.CONVERSATION_PREFIX + shareId;
      const cached = await this.client.get(key);
      
      if (cached) {
        this.hitCount++;
        console.log(`[Redis] Cache hit for conversation ${shareId}`);
        return JSON.parse(cached) as SharedConversation;
      } else {
        this.missCount++;
        console.log(`[Redis] Cache miss for conversation ${shareId}`);
        return null;
      }
    } catch (error) {
      console.error('[Redis] Error getting conversation:', error);
      this.missCount++;
      return null;
    }
  }

  /**
   * Store a shared conversation in cache
   */
  async setConversation(shareId: string, conversation: SharedConversation, ttlSeconds?: number): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      const key = this.CONVERSATION_PREFIX + shareId;
      const value = JSON.stringify(conversation);
      const ttl = ttlSeconds || 3600; // Default 1 hour

      await this.client.setEx(key, ttl, value);
      console.log(`[Redis] Cached conversation ${shareId} for ${ttl} seconds`);
    } catch (error) {
      console.error('[Redis] Error setting conversation:', error);
    }
  }

  /**
   * Remove a conversation from cache
   */
  async deleteConversation(shareId: string): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      const key = this.CONVERSATION_PREFIX + shareId;
      await this.client.del(key);
      console.log(`[Redis] Removed conversation ${shareId} from cache`);
    } catch (error) {
      console.error('[Redis] Error deleting conversation:', error);
    }
  }

  /**
   * Check if a conversation exists in cache
   */
  async hasConversation(shareId: string): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const key = this.CONVERSATION_PREFIX + shareId;
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('[Redis] Error checking conversation existence:', error);
      return false;
    }
  }

  /**
   * Batch delete conversations from cache
   */
  async deleteConversations(shareIds: string[]): Promise<void> {
    if (!this.isConnected || shareIds.length === 0) {
      return;
    }

    try {
      const keys = shareIds.map(id => this.CONVERSATION_PREFIX + id);
      await this.client.del(keys);
      console.log(`[Redis] Removed ${shareIds.length} conversations from cache`);
    } catch (error) {
      console.error('[Redis] Error batch deleting conversations:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const defaultStats: CacheStats = {
      totalKeys: 0,
      memoryUsage: '0B',
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: this.hitCount + this.missCount > 0 ? (this.hitCount / (this.hitCount + this.missCount)) * 100 : 0,
      uptime: Date.now() - this.startTime
    };

    if (!this.isConnected) {
      return defaultStats;
    }

    try {
      // Get Redis info
      const info = await this.client.info('memory');
      const keyspace = await this.client.info('keyspace');
      
      // Parse memory usage
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1].trim() : '0B';

      // Count conversation keys
      const conversationKeys = await this.client.keys(this.CONVERSATION_PREFIX + '*');
      const totalKeys = conversationKeys.length;

      return {
        totalKeys,
        memoryUsage,
        hitCount: this.hitCount,
        missCount: this.missCount,
        hitRate: this.hitCount + this.missCount > 0 ? (this.hitCount / (this.hitCount + this.missCount)) * 100 : 0,
        uptime: Date.now() - this.startTime
      };
    } catch (error) {
      console.error('[Redis] Error getting stats:', error);
      return defaultStats;
    }
  }

  /**
   * Clear all cached conversations
   */
  async clearAll(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      const keys = await this.client.keys(this.CONVERSATION_PREFIX + '*');
      if (keys.length > 0) {
        await this.client.del(keys);
        console.log(`[Redis] Cleared ${keys.length} conversations from cache`);
      }
    } catch (error) {
      console.error('[Redis] Error clearing cache:', error);
    }
  }

  /**
   * Set cache TTL for a conversation
   */
  async setTTL(shareId: string, ttlSeconds: number): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      const key = this.CONVERSATION_PREFIX + shareId;
      await this.client.expire(key, ttlSeconds);
      console.log(`[Redis] Set TTL for conversation ${shareId} to ${ttlSeconds} seconds`);
    } catch (error) {
      console.error('[Redis] Error setting TTL:', error);
    }
  }

  /**
   * Get remaining TTL for a conversation
   */
  async getTTL(shareId: string): Promise<number> {
    if (!this.isConnected) {
      return -1;
    }

    try {
      const key = this.CONVERSATION_PREFIX + shareId;
      return await this.client.ttl(key);
    } catch (error) {
      console.error('[Redis] Error getting TTL:', error);
      return -1;
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.client.quit();
        console.log('[Redis] Disconnected successfully');
      }
    } catch (error) {
      console.error('[Redis] Error disconnecting:', error);
    }
  }

  /**
   * Check if Redis is connected and available
   */
  isAvailable(): boolean {
    return this.isConnected;
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; latency?: number; error?: string }> {
    if (!this.isConnected) {
      return { status: 'unhealthy', error: 'Not connected' };
    }

    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;
      
      return { status: 'healthy', latency };
    } catch (error) {
      return { status: 'unhealthy', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

// Export singleton instance
export const redisCache = new RedisCache();
export default RedisCache;
