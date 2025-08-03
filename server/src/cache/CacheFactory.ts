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
   * Get cache instance - always uses memory cache
   */
  static async createCache(): Promise<CacheInterface> {
    if (CacheFactory.instance) {
      return CacheFactory.instance;
    }

    console.log('[CacheFactory] Initializing in-memory cache...');
    const { memoryCache } = await import('./MemoryCache.js');
    await memoryCache.connect();
    console.log('[CacheFactory] Memory cache initialized successfully');
    CacheFactory.instance = memoryCache;
    return memoryCache;
  }

  /**
   * Always returns memory cache type (Redis disabled)
   */
  private static determineCacheType(): 'memory' {
    console.log('[CacheFactory] Using memory cache (Redis disabled)');
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
    type: 'memory';
    available: boolean;
    environment: string;
  } {
    const nodeEnv = process.env.NODE_ENV || 'unknown';
    const instance = CacheFactory.getInstance();

    return {
      type: 'memory',
      available: instance?.isAvailable() || false,
      environment: nodeEnv
    };
  }
}

export default CacheFactory;
