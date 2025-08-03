import React, { useState, useEffect } from 'react';
import { useSharedConversationCache } from '../../contexts/SharedConversationCacheContext';
import type { CacheStats } from '../../services/SharedConversationCache';
import type { CacheMetrics } from '../../services/GlobalCacheManager';

interface CacheDebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const CacheDebugPanel: React.FC<CacheDebugPanelProps> = ({ isOpen, onClose }) => {
  const [refreshInterval, setRefreshInterval] = useState<number | null>(null);

  // Use the global cache context
  const {
    cacheStats,
    cacheMetrics,
    refreshStats,
    clearCache,
    invalidateConversation,
    configureCaching,
    isGlobalCacheReady,
    getCacheHealth,
    exportCacheData
  } = useSharedConversationCache();

  const [serverCacheStats, setServerCacheStats] = useState<any>(null);
  const [serverCacheHealth, setServerCacheHealth] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      refreshStats();
      fetchServerCacheStats();
      // Auto-refresh stats every 2 seconds when panel is open
      const interval = setInterval(() => {
        refreshStats();
        fetchServerCacheStats();
      }, 2000);
      setRefreshInterval(interval);
    } else {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [isOpen, refreshStats]);

  const fetchServerCacheStats = async () => {
    try {
      // Import the service dynamically to avoid circular dependencies
      const { sharedConversationService } = await import('../../services/SharedConversationService');

      const [stats, health] = await Promise.all([
        sharedConversationService.getCacheStats(),
        sharedConversationService.getCacheHealth()
      ]);

      setServerCacheStats(stats);
      setServerCacheHealth(health);
    } catch (error) {
      console.error('Error fetching server cache stats:', error);
    }
  };

  const handleClearCache = () => {
    clearCache();
    refreshStats();
  };

  const handleClearServerCache = async () => {
    try {
      const { sharedConversationService } = await import('../../services/SharedConversationService');
      const success = await sharedConversationService.clearServerCache();

      if (success) {
        alert('Server cache cleared successfully');
        fetchServerCacheStats();
      } else {
        alert('Failed to clear server cache');
      }
    } catch (error) {
      console.error('Error clearing server cache:', error);
      alert('Error clearing server cache');
    }
  };

  const handleInvalidateConversation = (shareId: string) => {
    invalidateConversation(shareId);
    refreshStats();
  };

  const handleExportCache = () => {
    const data = exportCacheData();
    if (data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cache-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const cacheHealth = getCacheHealth();

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-[#3A2E22]">Server-Side Cache Debug Panel</h2>
            <div className="flex items-center gap-4 mt-1">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isGlobalCacheReady ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-600">
                  Client: {isGlobalCacheReady ? 'Ready' : 'Initializing...'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  serverCacheHealth?.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'
                }`}></div>
                <span className="text-sm text-gray-600">
                  Redis: {serverCacheHealth?.status === 'healthy' ? 'Connected' : 'Disconnected'}
                </span>
                {serverCacheHealth?.latency && (
                  <span className="text-xs text-gray-500">({serverCacheHealth.latency}ms)</span>
                )}
              </div>
              <div className={`px-2 py-1 text-xs rounded-full ${
                cacheHealth.status === 'healthy' ? 'bg-green-100 text-green-800' :
                cacheHealth.status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {cacheHealth.status.toUpperCase()}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 focus:outline-none"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(80vh-120px)]">
          {/* Global Cache Health */}
          {cacheHealth.issues.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-medium text-[#3A2E22] mb-3">Cache Health Issues</h3>
              <div className="space-y-2">
                {cacheHealth.issues.map((issue, index) => (
                  <div key={index} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <div className="text-yellow-800 text-sm">{issue}</div>
                  </div>
                ))}
              </div>
              {cacheHealth.recommendations.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Recommendations:</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {cacheHealth.recommendations.map((rec, index) => (
                      <li key={index} className="flex items-start">
                        <span className="text-blue-500 mr-2">•</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Server Cache Statistics */}
          {serverCacheStats && (
            <div className="mb-6">
              <h3 className="text-lg font-medium text-[#3A2E22] mb-3">Redis Server Cache Statistics</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <div className="text-sm text-blue-600">Total Keys</div>
                  <div className="text-2xl font-bold text-blue-800">{serverCacheStats.totalKeys}</div>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg">
                  <div className="text-sm text-blue-600">Memory Usage</div>
                  <div className="text-2xl font-bold text-blue-800">{serverCacheStats.memoryUsage}</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg">
                  <div className="text-sm text-green-600">Hit Rate</div>
                  <div className="text-2xl font-bold text-green-700">{serverCacheStats.hitRate.toFixed(1)}%</div>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg">
                  <div className="text-sm text-purple-600">Uptime</div>
                  <div className="text-2xl font-bold text-purple-700">
                    {Math.round(serverCacheStats.uptime / (1000 * 60))}m
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="bg-green-50 p-3 rounded-lg">
                  <div className="text-sm text-green-600">Cache Hits</div>
                  <div className="text-xl font-bold text-green-700">{serverCacheStats.hitCount}</div>
                </div>
                <div className="bg-red-50 p-3 rounded-lg">
                  <div className="text-sm text-red-600">Cache Misses</div>
                  <div className="text-xl font-bold text-red-700">{serverCacheStats.missCount}</div>
                </div>
              </div>
            </div>
          )}

          {/* Client Cache Statistics */}
          {cacheStats && cacheMetrics && (
            <div className="mb-6">
              <h3 className="text-lg font-medium text-[#3A2E22] mb-3">Client Cache Statistics</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-sm text-gray-600">Total Conversations</div>
                  <div className="text-2xl font-bold text-[#5D4A38]">{cacheMetrics.totalConversations}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-sm text-gray-600">Storage Used</div>
                  <div className="text-2xl font-bold text-[#5D4A38]">{formatBytes(cacheMetrics.storageUsed)}</div>
                  <div className="text-xs text-gray-500">{cacheMetrics.storagePercentage.toFixed(1)}% of available</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-sm text-gray-600">Hit Rate</div>
                  <div className="text-2xl font-bold text-green-600">{cacheMetrics.hitRate}%</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-sm text-gray-600">Cache Age</div>
                  <div className="text-2xl font-bold text-[#5D4A38]">
                    {Math.round(cacheMetrics.cacheAge / (1000 * 60))}m
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="bg-green-50 p-3 rounded-lg">
                  <div className="text-sm text-green-600">Cache Hits</div>
                  <div className="text-xl font-bold text-green-700">{cacheStats.hitCount}</div>
                </div>
                <div className="bg-red-50 p-3 rounded-lg">
                  <div className="text-sm text-red-600">Cache Misses</div>
                  <div className="text-xl font-bold text-red-700">{cacheStats.missCount}</div>
                </div>
              </div>
            </div>
          )}

          {/* Cache Management */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-medium text-[#3A2E22]">Cache Management</h3>
              <div className="flex gap-2">
                <button
                  onClick={handleExportCache}
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                  Export Cache
                </button>
                <button
                  onClick={handleClearServerCache}
                  className="px-3 py-1 text-sm bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors"
                >
                  Clear Server Cache
                </button>
                <button
                  onClick={handleClearCache}
                  className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                >
                  Clear Client Cache
                </button>
              </div>
            </div>

            {cacheStats && cacheStats.totalEntries === 0 ? (
              <div className="text-gray-500 text-center py-4">
                No conversations cached globally
                <div className="text-xs mt-1">Cache is shared across all browser tabs and sessions</div>
              </div>
            ) : (
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-700 mb-2">
                  <strong>Global Cache Status:</strong>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Cached Conversations:</span>
                    <span className="ml-2 font-medium">{cacheStats?.totalEntries || 0}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Cross-Tab Sync:</span>
                    <span className="ml-2 font-medium text-green-600">✓ Enabled</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Persistent Storage:</span>
                    <span className="ml-2 font-medium text-green-600">✓ Enabled</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Auto Cleanup:</span>
                    <span className="ml-2 font-medium text-green-600">✓ Active</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Cache Configuration */}
          <div>
            <h3 className="text-lg font-medium text-[#3A2E22] mb-3">Cache Configuration</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Cache Size
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    defaultValue="100"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    onChange={(e) => {
                      const maxSize = parseInt(e.target.value);
                      if (maxSize > 0) {
                        configureCaching({ maxSize });
                        refreshStats();
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Default TTL (minutes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    defaultValue="60"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    onChange={(e) => {
                      const ttlMinutes = parseInt(e.target.value);
                      if (ttlMinutes > 0) {
                        const defaultTTL = ttlMinutes * 60 * 1000; // Convert to milliseconds
                        configureCaching({ defaultTTL });
                        refreshStats();
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#5D4A38] text-white rounded-lg hover:bg-[#4A3A2A] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default CacheDebugPanel;
