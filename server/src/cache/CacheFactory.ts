import { SharedConversation } from '../db/database';

// Common interface for all cache implementations
export interface CacheInterface {
  connect(): Promise<void>;
  getConversation(shareId: string): Promise<SharedConversation | null>;
  setConversation(shareId: string, conversation: SharedConversation, ttlSeconds?: number): Promise<void>;
  deleteConversation(shareId: string): Promise<void>;
  hasConversation(shareId: string): Promise<boolean>;
  deleteConversations(shareIds: string[]): Promise<void>;
  getStats(): Promise<any>;
  clearAll(): Promise<void>;
  setTTL(shareId: string, ttlSeconds: number): Promise<void>;
  getTTL(shareId: string): Promise<number>;
  disconnect(): Promise<void>;
  isAvailable(): boolean;
  healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; latency?: number; error?: string }>;
}

class CacheFactory {
  private static instance: CacheInterface | null = null;

  /**
   * Get cache instance based on environment configuration
   */
  static async createCache(): Promise<CacheInterface> {
    if (CacheFactory.instance) {
      return CacheFactory.instance;
    }

    const cacheType = CacheFactory.determineCacheType();
    
    try {
      if (cacheType === 'redis') {
        console.log('[CacheFactory] Initializing Redis cache...');
        const { redisCache } = await import('./RedisCache.js');
        await redisCache.connect();
        
        // Test Redis connection
        const health = await redisCache.healthCheck();
        if (health.status === 'healthy') {
          console.log('[CacheFactory] Redis cache initialized successfully');
          CacheFactory.instance = redisCache;
          return redisCache;
        } else {
          console.warn('[CacheFactory] Redis health check failed, falling back to memory cache');
          throw new Error('Redis health check failed');
        }
      } else {
        console.log('[CacheFactory] Initializing in-memory cache...');
        const { memoryCache } = await import('./MemoryCache.js');
        await memoryCache.connect();
        console.log('[CacheFactory] Memory cache initialized successfully');
        CacheFactory.instance = memoryCache;
        return memoryCache;
      }
    } catch (error) {
      console.warn('[CacheFactory] Failed to initialize preferred cache, falling back to memory cache:', error);
      
      // Fallback to memory cache
      const { memoryCache } = await import('./MemoryCache.js');
      await memoryCache.connect();
      console.log('[CacheFactory] Fallback memory cache initialized');
      CacheFactory.instance = memoryCache;
      return memoryCache;
    }
  }

  /**
   * Determine which cache type to use based on environment
   */
  private static determineCacheType(): 'redis' | 'memory' {
    const nodeEnv = process.env.NODE_ENV;
    const redisUrl = process.env.REDIS_URL;
    const cacheType = process.env.CACHE_TYPE;

    // Explicit cache type override
    if (cacheType === 'redis' || cacheType === 'memory') {
      console.log(`[CacheFactory] Using explicit cache type: ${cacheType}`);
      return cacheType;
    }

    // Production environment - prefer Redis if available
    if (nodeEnv === 'production') {
      if (redisUrl) {
        console.log('[CacheFactory] Production environment with Redis URL - using Redis');
        return 'redis';
      } else {
        console.log('[CacheFactory] Production environment without Redis URL - using memory cache');
        return 'memory';
      }
    }

    // Development/test environment - prefer memory cache for simplicity
    if (nodeEnv === 'development' || nodeEnv === 'test') {
      if (redisUrl && redisUrl !== 'redis://localhost:6379') {
        // Custom Redis URL provided - use Redis
        console.log('[CacheFactory] Development with custom Redis URL - using Redis');
        return 'redis';
      } else {
        console.log('[CacheFactory] Development environment - using memory cache (no Redis required)');
        return 'memory';
      }
    }

    // Default fallback
    console.log('[CacheFactory] Unknown environment - defaulting to memory cache');
    return 'memory';
  }

  /**
   * Get current cache instance (must be created first)
   */
  static getInstance(): CacheInterface | null {
    return CacheFactory.instance;
  }

  /**
   * Reset cache instance (for testing)
   */
  static reset(): void {
    CacheFactory.instance = null;
  }

  /**
   * Get cache type information
   */
  static getCacheInfo(): {
    type: 'redis' | 'memory' | 'unknown';
    available: boolean;
    environment: string;
    redisUrl?: string;
  } {
    const nodeEnv = process.env.NODE_ENV || 'unknown';
    const redisUrl = process.env.REDIS_URL;
    const instance = CacheFactory.getInstance();

    let type: 'redis' | 'memory' | 'unknown' = 'unknown';
    
    if (instance) {
      // Check if it's Redis by looking for Redis-specific methods
      if ('client' in instance) {
        type = 'redis';
      } else {
        type = 'memory';
      }
    }

    return {
      type,
      available: instance?.isAvailable() || false,
      environment: nodeEnv,
      redisUrl: redisUrl ? redisUrl.replace(/\/\/.*@/, '//***@') : undefined // Hide credentials
    };
  }
}

export default CacheFactory;
