import { sharedConversationCache, SharedConversationData } from './SharedConversationCache';

interface GlobalCacheConfig {
  maxSize: number;
  defaultTTL: number;
  enablePersistence: boolean;
  enableCrossTabSync: boolean;
  autoCleanupInterval: number;
}

interface CacheMetrics {
  totalConversations: number;
  storageUsed: number;
  storageAvailable: number;
  storagePercentage: number;
  hitRate: number;
  lastCleanup: number;
  cacheAge: number; // How long the cache has been running
}

class GlobalCacheManager {
  private static instance: GlobalCacheManager;
  private startTime: number;
  private lastCleanup: number;
  private config: GlobalCacheConfig;

  private constructor() {
    this.startTime = Date.now();
    this.lastCleanup = Date.now();
    
    // Default configuration
    this.config = {
      maxSize: 200,
      defaultTTL: 2 * 60 * 60 * 1000, // 2 hours
      enablePersistence: true,
      enableCrossTabSync: true,
      autoCleanupInterval: 15 * 60 * 1000 // 15 minutes
    };

    this.initialize();
  }

  public static getInstance(): GlobalCacheManager {
    if (!GlobalCacheManager.instance) {
      GlobalCacheManager.instance = new GlobalCacheManager();
    }
    return GlobalCacheManager.instance;
  }

  private initialize(): void {
    // Configure the underlying cache
    sharedConversationCache.configure({
      maxSize: this.config.maxSize,
      defaultTTL: this.config.defaultTTL
    });

    // Setup global event listeners
    this.setupGlobalEventListeners();

    // Setup periodic maintenance
    this.setupPeriodicMaintenance();

    console.log('[GlobalCache] Initialized with config:', this.config);
  }

  private setupGlobalEventListeners(): void {
    // Listen for page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // Page became visible, potentially sync cache
        this.onPageVisible();
      } else {
        // Page hidden, save current state
        this.onPageHidden();
      }
    });

    // Listen for beforeunload to save state
    window.addEventListener('beforeunload', () => {
      sharedConversationCache.forceSave();
    });

    // Listen for online/offline events
    window.addEventListener('online', () => {
      console.log('[GlobalCache] Connection restored, cache ready');
    });

    window.addEventListener('offline', () => {
      console.log('[GlobalCache] Offline mode, relying on cache');
    });
  }

  private setupPeriodicMaintenance(): void {
    // Periodic cleanup and optimization
    setInterval(() => {
      this.performMaintenance();
    }, this.config.autoCleanupInterval);
  }

  private onPageVisible(): void {
    // When page becomes visible, we might want to refresh some cache entries
    console.log('[GlobalCache] Page visible, cache ready');
  }

  private onPageHidden(): void {
    // Save current state when page is hidden
    sharedConversationCache.forceSave();
    console.log('[GlobalCache] Page hidden, cache saved');
  }

  private performMaintenance(): void {
    const before = sharedConversationCache.getStats();
    
    // The cache automatically cleans up expired entries
    // We just need to update our tracking
    this.lastCleanup = Date.now();
    
    const after = sharedConversationCache.getStats();
    
    if (before.totalEntries !== after.totalEntries) {
      console.log(`[GlobalCache] Maintenance: ${before.totalEntries - after.totalEntries} entries cleaned`);
    }
  }

  /**
   * Get comprehensive cache metrics
   */
  getMetrics(): CacheMetrics {
    const stats = sharedConversationCache.getStats();
    const storageInfo = sharedConversationCache.getStorageInfo();
    
    return {
      totalConversations: stats.totalEntries,
      storageUsed: storageInfo.used,
      storageAvailable: storageInfo.available,
      storagePercentage: storageInfo.percentage,
      hitRate: stats.hitRate,
      lastCleanup: this.lastCleanup,
      cacheAge: Date.now() - this.startTime
    };
  }

  /**
   * Configure global cache settings
   */
  configure(newConfig: Partial<GlobalCacheConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Apply configuration to underlying cache
    sharedConversationCache.configure({
      maxSize: this.config.maxSize,
      defaultTTL: this.config.defaultTTL
    });

    console.log('[GlobalCache] Configuration updated:', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): GlobalCacheConfig {
    return { ...this.config };
  }

  /**
   * Preload popular conversations globally
   */
  async preloadPopularConversations(shareIds: string[]): Promise<void> {
    console.log(`[GlobalCache] Preloading ${shareIds.length} popular conversations`);
    
    // This would typically come from analytics or server recommendations
    const promises = shareIds.map(async (shareId) => {
      try {
        // Check if already cached
        if (!sharedConversationCache.has(shareId)) {
          // Fetch and cache
          const response = await fetch(`/api/conversations/shared/${shareId}`);
          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              sharedConversationCache.set(shareId, data.conversation, this.config.defaultTTL);
            }
          }
        }
      } catch (error) {
        console.warn(`[GlobalCache] Failed to preload ${shareId}:`, error);
      }
    });

    await Promise.allSettled(promises);
    console.log('[GlobalCache] Preloading completed');
  }

  /**
   * Get cache health status
   */
  getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
  } {
    const metrics = this.getMetrics();
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    // Check storage usage
    if (metrics.storagePercentage > 90) {
      issues.push('Storage usage is very high (>90%)');
      recommendations.push('Consider reducing cache size or TTL');
    } else if (metrics.storagePercentage > 70) {
      issues.push('Storage usage is high (>70%)');
      recommendations.push('Monitor storage usage');
    }
    
    // Check hit rate
    if (metrics.hitRate < 50) {
      issues.push('Cache hit rate is low (<50%)');
      recommendations.push('Consider increasing cache size or TTL');
    }
    
    // Check cache age
    const ageHours = metrics.cacheAge / (1000 * 60 * 60);
    if (ageHours > 24) {
      recommendations.push('Cache has been running for over 24 hours, consider restart');
    }
    
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (issues.length > 0) {
      status = metrics.storagePercentage > 90 ? 'critical' : 'warning';
    }
    
    return { status, issues, recommendations };
  }

  /**
   * Export cache data for backup/analysis
   */
  exportCacheData(): {
    conversations: Array<{ shareId: string; data: SharedConversationData; timestamp: number }>;
    metadata: {
      exportTime: number;
      totalEntries: number;
      cacheAge: number;
      config: GlobalCacheConfig;
    };
  } {
    const cachedIds = sharedConversationCache.getCachedIds();
    const conversations = cachedIds.map(shareId => ({
      shareId,
      data: sharedConversationCache.get(shareId)!,
      timestamp: Date.now()
    }));

    return {
      conversations,
      metadata: {
        exportTime: Date.now(),
        totalEntries: conversations.length,
        cacheAge: Date.now() - this.startTime,
        config: this.config
      }
    };
  }

  /**
   * Clear all cache data globally
   */
  clearAll(): void {
    sharedConversationCache.clear();
    console.log('[GlobalCache] All cache data cleared globally');
  }

  /**
   * Get cache readiness status
   */
  isReady(): boolean {
    return sharedConversationCache.isReady();
  }
}

// Export singleton instance
export const globalCacheManager = GlobalCacheManager.getInstance();

// Export types
export type { GlobalCacheConfig, CacheMetrics };
export default GlobalCacheManager;
