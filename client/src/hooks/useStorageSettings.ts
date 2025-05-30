import { useState, useEffect } from 'react';
import db from '../db/ChatHistoryDB';

export interface StorageSettings {
  retentionPolicyDays: number;
  autoCleanupEnabled: boolean;
  messageCompressionEnabled: boolean;
  messagePageSize: number;
}

export interface StorageUsage {
  usage: number;
  quota: number;
  percentage: number;
}

export interface CleanupResult {
  success: boolean;
  deletedCount?: number;
  compressedCount?: number;
  savingsPercentage?: number;
  error?: any;
  type?: string;
  counts?: {
    topics?: number;
    messages?: number;
    wordIndices?: number;
    orphanedMessages?: number;
  };
  storageEstimate?: StorageUsage;
  recommendedAction?: string;
  cleanupResult?: any;
  analysisResult?: any;
  messagesBeforeCleanup?: number;
  messagesAfterCleanup?: number;
  emptyTopicsDeleted?: number;
}

export const useStorageSettings = (userId: string) => {
  // Storage management state
  const [retentionPolicyDays, setRetentionPolicyDays] = useState<number>(() => {
    const saved = localStorage.getItem('retentionPolicyDays');
    return saved ? parseInt(saved) : 90; // Default 90 days retention
  });
  
  const [autoCleanupEnabled, setAutoCleanupEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('autoCleanupEnabled');
    return saved ? saved === 'true' : false; // Default disabled
  });
  
  const [messageCompressionEnabled, setMessageCompressionEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('messageCompressionEnabled');
    return saved ? saved === 'true' : true; // Default enabled
  });
  
  const [messagePageSize, setMessagePageSize] = useState<number>(() => {
    const saved = localStorage.getItem('messagePageSize');
    return saved ? parseInt(saved) : 30; // Default 30 messages per page
  });

  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [isRunningCleanup, setIsRunningCleanup] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch storage usage on mount
  useEffect(() => {
    const fetchStorageUsage = async () => {
      try {
        const estimate = await db.getStorageEstimate();
        setStorageUsage(estimate);
      } catch (error) {
        console.error('Error fetching storage usage:', error);
      }
    };

    fetchStorageUsage();
    
    // Set up a timer to refresh storage usage every 5 minutes
    const intervalId = setInterval(fetchStorageUsage, 5 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  // Save settings when they change
  useEffect(() => {
    localStorage.setItem('retentionPolicyDays', retentionPolicyDays.toString());
    localStorage.setItem('autoCleanupEnabled', autoCleanupEnabled.toString());
    localStorage.setItem('messageCompressionEnabled', messageCompressionEnabled.toString());
    localStorage.setItem('messagePageSize', messagePageSize.toString());
  }, [retentionPolicyDays, autoCleanupEnabled, messageCompressionEnabled, messagePageSize]);

  // Handle cleanup of oldest conversations
  const cleanupOldestConversations = async (keepCount = 50) => {
    if (!userId || isRunningCleanup) return;
    
    try {
      setIsRunningCleanup(true);
      setCleanupResult(null);
      setErrorMessage(null);
      
      if (typeof window.cleanupOldestConversations !== 'function') {
        throw new Error('Cleanup function not available');
      }
      
      const result = await window.cleanupOldestConversations(keepCount);
      
      if (result.success) {
        setCleanupResult(result);
        // Refresh storage usage
        const estimate = await db.getStorageEstimate();
        setStorageUsage(estimate);
        return result;
      } else {
        throw new Error(result.error ? String(result.error) : 'Unknown error during cleanup');
      }
    } catch (error) {
      console.error('Error cleaning up conversations:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error during cleanup');
      return { success: false, error };
    } finally {
      setIsRunningCleanup(false);
    }
  };

  // Handle message compression
  const compressMessages = async (topicId?: number) => {
    if (!userId || isRunningCleanup) return;
    
    try {
      setIsRunningCleanup(true);
      setCleanupResult(null);
      setErrorMessage(null);
      
      if (typeof window.compressMessages !== 'function') {
        throw new Error('Compression function not available');
      }
      
      const result = await window.compressMessages(topicId);
      
      if (result.success) {
        setCleanupResult(result);
        // Refresh storage usage
        const estimate = await db.getStorageEstimate();
        setStorageUsage(estimate);
        return result;
      } else {
        throw new Error(result.error ? String(result.error) : 'Unknown error during compression');
      }
    } catch (error) {
      console.error('Error compressing messages:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error during compression');
      return { success: false, error };
    } finally {
      setIsRunningCleanup(false);
    }
  };

  // Handle storage analysis
  const analyzeStorage = async () => {
    if (!userId || isRunningCleanup) return;
    
    try {
      setIsRunningCleanup(true);
      setCleanupResult(null);
      setErrorMessage(null);
      
      if (typeof window.analyzeStorage !== 'function') {
        throw new Error('Analysis function not available');
      }
      
      const result = await window.analyzeStorage();
      
      if (result.success) {
        setCleanupResult({
          ...result,
          type: 'analysis'
        });
        return result;
      } else {
        throw new Error(result.error ? String(result.error) : 'Unknown error during analysis');
      }
    } catch (error) {
      console.error('Error analyzing storage:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error during analysis');
      return { success: false, error };
    } finally {
      setIsRunningCleanup(false);
    }
  };

  // Handle cleanup of orphaned data
  const cleanupOrphanedData = async () => {
    if (!userId || isRunningCleanup) return;
    
    try {
      setIsRunningCleanup(true);
      setCleanupResult(null);
      setErrorMessage(null);
      
      if (typeof window.cleanupOrphanedData !== 'function') {
        throw new Error('Cleanup function not available');
      }
      
      const result = await window.cleanupOrphanedData();
      
      if (result.success) {
        // Run analysis again to show updated stats
        if (typeof window.analyzeStorage === 'function') {
          const analysisResult = await window.analyzeStorage();
          if (analysisResult.success) {
            setCleanupResult({
              success: true,
              type: 'orphaned-cleanup',
              cleanupResult: result,
              analysisResult
            });
          } else {
            setCleanupResult({
              success: true,
              type: 'orphaned-cleanup',
              cleanupResult: result
            });
          }
        } else {
          setCleanupResult({
            success: true,
            type: 'orphaned-cleanup',
            cleanupResult: result
          });
        }
        
        // Refresh storage usage
        const estimate = await db.getStorageEstimate();
        setStorageUsage(estimate);
        return result;
      } else {
        throw new Error(result.error ? String(result.error) : 'Unknown error during cleanup');
      }
    } catch (error) {
      console.error('Error cleaning up orphaned data:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error during cleanup');
      return { success: false, error };
    } finally {
      setIsRunningCleanup(false);
    }
  };

  return {
    settings: {
      retentionPolicyDays,
      setRetentionPolicyDays,
      autoCleanupEnabled,
      setAutoCleanupEnabled,
      messageCompressionEnabled,
      setMessageCompressionEnabled,
      messagePageSize,
      setMessagePageSize
    },
    storageUsage,
    cleanupState: {
      isRunningCleanup,
      cleanupResult,
      errorMessage,
      setErrorMessage,
      setCleanupResult
    },
    actions: {
      cleanupOldestConversations,
      compressMessages,
      analyzeStorage,
      cleanupOrphanedData
    }
  };
};

export default useStorageSettings; 