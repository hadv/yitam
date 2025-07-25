import { useState, useEffect, useCallback } from 'react';
import { sharedConversationService } from '../services/SharedConversationService';
import type { SharedConversationData, CacheStats } from '../services/SharedConversationCache';

interface UseSharedConversationCacheReturn {
  // Cache operations
  getConversation: (shareId: string, forceRefresh?: boolean) => Promise<SharedConversationData | null>;
  getCachedConversation: (shareId: string) => SharedConversationData | null;
  isConversationCached: (shareId: string) => boolean;
  invalidateConversation: (shareId: string) => void;
  clearCache: () => void;
  
  // Cache statistics
  cacheStats: CacheStats | null;
  refreshStats: () => void;
  
  // Preloading
  prefetchConversations: (shareIds: string[]) => Promise<void>;
  warmUpCache: (popularShareIds: string[]) => Promise<void>;
  
  // Configuration
  configureCaching: (options: { maxSize?: number; defaultTTL?: number }) => void;
  
  // State
  isLoading: boolean;
  error: string | null;
}

export const useSharedConversationCache = (): UseSharedConversationCacheReturn => {
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refresh cache statistics
  const refreshStats = useCallback(() => {
    try {
      const stats = sharedConversationService.getCacheStats();
      setCacheStats(stats);
    } catch (err) {
      console.error('Error refreshing cache stats:', err);
    }
  }, []);

  // Initialize stats on mount
  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  // Get conversation with caching
  const getConversation = useCallback(async (shareId: string, forceRefresh: boolean = false): Promise<SharedConversationData | null> => {
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
  }, [refreshStats]);

  // Get conversation from cache only
  const getCachedConversation = useCallback((shareId: string): SharedConversationData | null => {
    try {
      return sharedConversationService.getCachedConversation(shareId);
    } catch (err) {
      console.error('Error getting cached conversation:', err);
      return null;
    }
  }, []);

  // Check if conversation is cached
  const isConversationCached = useCallback((shareId: string): boolean => {
    try {
      return sharedConversationService.isConversationCached(shareId);
    } catch (err) {
      console.error('Error checking cache status:', err);
      return false;
    }
  }, []);

  // Invalidate specific conversation
  const invalidateConversation = useCallback((shareId: string): void => {
    try {
      sharedConversationService.invalidateConversation(shareId);
      refreshStats();
    } catch (err) {
      console.error('Error invalidating conversation:', err);
    }
  }, [refreshStats]);

  // Clear all cache
  const clearCache = useCallback((): void => {
    try {
      sharedConversationService.clearCache();
      refreshStats();
    } catch (err) {
      console.error('Error clearing cache:', err);
    }
  }, [refreshStats]);

  // Prefetch multiple conversations
  const prefetchConversations = useCallback(async (shareIds: string[]): Promise<void> => {
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
  }, [refreshStats]);

  // Warm up cache with popular conversations
  const warmUpCache = useCallback(async (popularShareIds: string[]): Promise<void> => {
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
  }, [refreshStats]);

  // Configure caching
  const configureCaching = useCallback((options: { maxSize?: number; defaultTTL?: number }): void => {
    try {
      sharedConversationService.configureCaching(options);
      refreshStats();
    } catch (err) {
      console.error('Error configuring cache:', err);
    }
  }, [refreshStats]);

  return {
    // Cache operations
    getConversation,
    getCachedConversation,
    isConversationCached,
    invalidateConversation,
    clearCache,
    
    // Cache statistics
    cacheStats,
    refreshStats,
    
    // Preloading
    prefetchConversations,
    warmUpCache,
    
    // Configuration
    configureCaching,
    
    // State
    isLoading,
    error
  };
};

// Hook for automatic cache warming on app startup
export const useCacheWarmup = (popularShareIds: string[] = []) => {
  const { warmUpCache } = useSharedConversationCache();
  const [isWarmedUp, setIsWarmedUp] = useState(false);

  useEffect(() => {
    if (popularShareIds.length > 0 && !isWarmedUp) {
      warmUpCache(popularShareIds)
        .then(() => {
          setIsWarmedUp(true);
          console.log('Cache warmed up successfully');
        })
        .catch((err) => {
          console.error('Failed to warm up cache:', err);
        });
    }
  }, [popularShareIds, isWarmedUp, warmUpCache]);

  return { isWarmedUp };
};

// Hook for periodic cache cleanup
export const useCacheCleanup = (intervalMinutes: number = 30) => {
  const { refreshStats } = useSharedConversationCache();

  useEffect(() => {
    const interval = setInterval(() => {
      // The cache automatically cleans up expired entries
      // We just refresh stats to reflect any changes
      refreshStats();
    }, intervalMinutes * 60 * 1000);

    return () => clearInterval(interval);
  }, [intervalMinutes, refreshStats]);
};

export default useSharedConversationCache;
