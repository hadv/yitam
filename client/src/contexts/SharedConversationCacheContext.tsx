import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { sharedConversationService } from '../services/SharedConversationService';
import { globalCacheManager } from '../services/GlobalCacheManager';
import type { SharedConversationData, CacheStats } from '../services/SharedConversationCache';
import type { CacheMetrics } from '../services/GlobalCacheManager';

interface SharedConversationCacheContextValue {
  // Cache operations
  getConversation: (shareId: string, forceRefresh?: boolean) => Promise<SharedConversationData | null>;
  getCachedConversation: (shareId: string) => SharedConversationData | null;
  isConversationCached: (shareId: string) => boolean;
  invalidateConversation: (shareId: string) => void;
  clearCache: () => void;

  // Cache statistics
  cacheStats: CacheStats | null;
  cacheMetrics: CacheMetrics | null;
  refreshStats: () => void;

  // Preloading
  prefetchConversations: (shareIds: string[]) => Promise<void>;
  warmUpCache: (popularShareIds: string[]) => Promise<void>;

  // Configuration
  configureCaching: (options: { maxSize?: number; defaultTTL?: number }) => void;

  // Global cache management
  isGlobalCacheReady: boolean;
  getCacheHealth: () => { status: string; issues: string[]; recommendations: string[] };
  exportCacheData: () => any;

  // State
  isLoading: boolean;
  error: string | null;
}

const SharedConversationCacheContext = createContext<SharedConversationCacheContextValue | null>(null);

interface SharedConversationCacheProviderProps {
  children: ReactNode;
  // Optional configuration
  maxCacheSize?: number;
  defaultTTL?: number;
  popularConversations?: string[]; // For cache warming
  enableAutoCleanup?: boolean;
  cleanupIntervalMinutes?: number;
}

export const SharedConversationCacheProvider: React.FC<SharedConversationCacheProviderProps> = ({
  children,
  maxCacheSize = 200,
  defaultTTL = 2 * 60 * 60 * 1000, // 2 hours
  popularConversations = [],
  enableAutoCleanup = true,
  cleanupIntervalMinutes = 15
}) => {
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [cacheMetrics, setCacheMetrics] = useState<CacheMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGlobalCacheReady, setIsGlobalCacheReady] = useState(false);

  // Initialize global cache configuration
  useEffect(() => {
    const initializeGlobalCache = async () => {
      try {
        // Configure global cache manager
        globalCacheManager.configure({
          maxSize: maxCacheSize,
          defaultTTL,
          enablePersistence: true,
          enableCrossTabSync: true,
          autoCleanupInterval: cleanupIntervalMinutes * 60 * 1000
        });

        // Wait for cache to be ready
        const checkReady = () => {
          if (globalCacheManager.isReady()) {
            setIsGlobalCacheReady(true);

            // Warm up cache with popular conversations
            if (popularConversations.length > 0) {
              globalCacheManager.preloadPopularConversations(popularConversations)
                .then(() => {
                  console.log('[GlobalCache] Warmed up with popular conversations');
                })
                .catch((err) => {
                  console.warn('[GlobalCache] Failed to warm up cache:', err);
                });
            }
          } else {
            // Check again in 100ms
            setTimeout(checkReady, 100);
          }
        };

        checkReady();
      } catch (err) {
        console.error('[GlobalCache] Failed to initialize:', err);
        setError('Failed to initialize global cache');
      }
    };

    initializeGlobalCache();
  }, [maxCacheSize, defaultTTL, popularConversations, cleanupIntervalMinutes]);

  // Auto cleanup interval
  useEffect(() => {
    if (enableAutoCleanup) {
      const interval = setInterval(() => {
        refreshStats();
      }, cleanupIntervalMinutes * 60 * 1000);

      return () => clearInterval(interval);
    }
  }, [enableAutoCleanup, cleanupIntervalMinutes]);

  // Refresh cache statistics
  const refreshStats = () => {
    try {
      const stats = sharedConversationService.getCacheStats();
      const metrics = globalCacheManager.getMetrics();
      setCacheStats(stats);
      setCacheMetrics(metrics);
    } catch (err) {
      console.error('Error refreshing cache stats:', err);
    }
  };

  // Initialize stats on mount
  useEffect(() => {
    refreshStats();
  }, []);

  // Get conversation with caching
  const getConversation = async (shareId: string, forceRefresh: boolean = false): Promise<SharedConversationData | null> => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await sharedConversationService.getSharedConversation(shareId, forceRefresh);
      
      if (!result.success) {
        setError(result.error || 'Failed to load conversation');
        return null;
      }

      refreshStats(); // Update stats after cache operation
      return result.conversation || null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load conversation';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Get conversation from cache only
  const getCachedConversation = (shareId: string): SharedConversationData | null => {
    try {
      return sharedConversationService.getCachedConversation(shareId);
    } catch (err) {
      console.error('Error getting cached conversation:', err);
      return null;
    }
  };

  // Check if conversation is cached
  const isConversationCached = (shareId: string): boolean => {
    try {
      return sharedConversationService.isConversationCached(shareId);
    } catch (err) {
      console.error('Error checking cache status:', err);
      return false;
    }
  };

  // Invalidate specific conversation
  const invalidateConversation = (shareId: string): void => {
    try {
      sharedConversationService.invalidateConversation(shareId);
      refreshStats();
    } catch (err) {
      console.error('Error invalidating conversation:', err);
    }
  };

  // Clear all cache
  const clearCache = (): void => {
    try {
      sharedConversationService.clearCache();
      refreshStats();
    } catch (err) {
      console.error('Error clearing cache:', err);
    }
  };

  // Prefetch multiple conversations
  const prefetchConversations = async (shareIds: string[]): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      
      await sharedConversationService.prefetchConversations(shareIds);
      refreshStats();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to prefetch conversations';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Warm up cache with popular conversations
  const warmUpCache = async (popularShareIds: string[]): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      
      await sharedConversationService.warmUpCache(popularShareIds);
      refreshStats();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to warm up cache';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Configure caching
  const configureCaching = (options: { maxSize?: number; defaultTTL?: number }): void => {
    try {
      globalCacheManager.configure(options);
      sharedConversationService.configureCaching(options);
      refreshStats();
    } catch (err) {
      console.error('Error configuring cache:', err);
    }
  };

  // Get cache health status
  const getCacheHealth = () => {
    try {
      return globalCacheManager.getHealthStatus();
    } catch (err) {
      console.error('Error getting cache health:', err);
      return { status: 'unknown', issues: ['Failed to get health status'], recommendations: [] };
    }
  };

  // Export cache data
  const exportCacheData = () => {
    try {
      return globalCacheManager.exportCacheData();
    } catch (err) {
      console.error('Error exporting cache data:', err);
      return null;
    }
  };

  const contextValue: SharedConversationCacheContextValue = {
    // Cache operations
    getConversation,
    getCachedConversation,
    isConversationCached,
    invalidateConversation,
    clearCache,

    // Cache statistics
    cacheStats,
    cacheMetrics,
    refreshStats,

    // Preloading
    prefetchConversations,
    warmUpCache,

    // Configuration
    configureCaching,

    // Global cache management
    isGlobalCacheReady,
    getCacheHealth,
    exportCacheData,

    // State
    isLoading,
    error
  };

  return (
    <SharedConversationCacheContext.Provider value={contextValue}>
      {children}
    </SharedConversationCacheContext.Provider>
  );
};

// Hook to use the shared conversation cache context
export const useSharedConversationCache = (): SharedConversationCacheContextValue => {
  const context = useContext(SharedConversationCacheContext);
  if (!context) {
    throw new Error('useSharedConversationCache must be used within a SharedConversationCacheProvider');
  }
  return context;
};

export default SharedConversationCacheContext;
