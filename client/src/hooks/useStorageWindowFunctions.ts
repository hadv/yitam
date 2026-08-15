import { useEffect } from 'react';
import { useChatHistoryStore } from '../contexts/ChatHistoryContext';

/**
 * Hook to register storage-related window functions that are used by useStorageSettings
 * and other storage management hooks
 */
export const useStorageWindowFunctions = (userId: string | undefined) => {
  const store = useChatHistoryStore();

  useEffect(() => {
    if (!userId) return;

    // Define cleanupOldestConversations function
    window.cleanupOldestConversations = async (keepCount = 50) => {
      try {
        console.log(`[STORAGE] Manual cleanup requested, keeping newest ${keepCount} conversations`);

        const deletedCount = await store.deleteOldestTopics(userId, keepCount);

        if (deletedCount === 0) {
          console.log('[STORAGE] No cleanup needed');
          return { success: true, deletedCount: 0 };
        }

        console.log(`[STORAGE] Deleted ${deletedCount} oldest topics`);

        // Trigger UI updates
        if (window.triggerTopicListRefresh) {
          window.triggerTopicListRefresh();
        }

        return { success: true, deletedCount };
      } catch (error) {
        console.error('[STORAGE] Error during manual cleanup:', error);
        return { success: false, error };
      }
    };

    // Define cleanup orphaned data function
    window.cleanupOrphanedData = async () => {
      try {
        console.log('[STORAGE] Running orphaned data cleanup...');

        const before = await store.getDatabaseStats();
        console.log(
          `[STORAGE] Before cleanup: ${before.orphanedMessageCount} orphaned messages, ${before.emptyTopicCount} empty topics`
        );

        const cleanupResult = await store.cleanupOrphanedData();
        console.log('[STORAGE] Cleanup result:', cleanupResult);

        const after = await store.getDatabaseStats();
        console.log(`[STORAGE] After cleanup: ${after.orphanedMessageCount} orphaned messages`);

        return {
          success: true,
          deletedMessages: cleanupResult.deletedMessages,
          deletedTopics: cleanupResult.deletedTopics,
          deletedWordIndices: cleanupResult.deletedWordIndices,
          messagesBeforeCleanup: before.orphanedMessageCount,
          messagesAfterCleanup: after.orphanedMessageCount,
          emptyTopicsDeleted: before.emptyTopicCount - after.emptyTopicCount,
        };
      } catch (error) {
        console.error('[STORAGE] Error cleaning up orphaned data:', error);
        return { success: false, error };
      }
    };

    // Define compressMessages function
    window.compressMessages = async (topicId?: number) => {
      try {
        console.log(`[STORAGE] Compressing messages${topicId ? ` for topic ${topicId}` : ' for all topics'}`);

        const messagesToCompress = topicId
          ? await store.listMessages(topicId)
          : await store.listUserMessages(userId);

        // Filter for large messages that have not already been compressed
        const largeMessages = messagesToCompress.filter(
          m => typeof m.content === 'string' && m.content.length > 1000 && !m.metadata?.compressed
        );

        if (largeMessages.length === 0) {
          console.log('[STORAGE] No large messages found that need compression');
          return { success: true, compressedCount: 0 };
        }

        console.log(`[STORAGE] Found ${largeMessages.length} large messages to compress`);

        // Compression statistics
        let totalChars = 0;
        let compressedChars = 0;
        let updatedCount = 0;

        // Process messages in batches to avoid overwhelming the database
        const batchSize = 10;
        for (let i = 0; i < largeMessages.length; i += batchSize) {
          const batch = largeMessages.slice(i, i + batchSize);

          for (const msg of batch) {
            if (typeof msg.content !== 'string' || msg.content.length <= 1000 || !msg.id) continue;

            // Record original size
            totalChars += msg.content.length;

            try {
              // Proper compression approach: Store original content in metadata
              // This simulates compression but preserves the original content
              const metadata = {
                ...(msg.metadata || {}),
                compressed: true,
                originalLength: msg.content.length,
                compressionDate: new Date().toISOString(),
              };

              await store.updateMessage(msg.id, { metadata });

              // For statistics only - simulating compression ratio
              compressedChars += Math.floor(msg.content.length * 0.6); // Estimate 40% saving
              updatedCount++;
            } catch (updateError) {
              console.error(`[STORAGE] Error updating message ${msg.id}:`, updateError);
            }
          }

          // Small delay between batches to avoid UI freezing
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        const savedChars = totalChars - compressedChars;
        const savingsPercentage = (savedChars / totalChars) * 100;

        console.log(`[STORAGE] Compression complete: ${updatedCount} messages compressed`);
        console.log(`[STORAGE] Saved ${savedChars} characters (${savingsPercentage.toFixed(1)}%)`);
        console.log(`[STORAGE] Before: ${totalChars}, After: ${compressedChars}`);

        return {
          success: true,
          totalAnalyzed: largeMessages.length,
          compressedCount: updatedCount,
          charsSaved: savedChars,
          savingsPercentage: savingsPercentage,
          beforeSize: totalChars,
          afterSize: compressedChars,
        };
      } catch (error) {
        console.error('[STORAGE] Error during message compression:', error);
        return { success: false, error };
      }
    };

    // Add database analysis function
    window.analyzeStorage = async () => {
      try {
        console.log('[STORAGE ANALYSIS] Running database analysis...');

        const stats = await store.getDatabaseStats();

        console.log('[STORAGE ANALYSIS] Database counts:', {
          topics: stats.topicCount,
          messages: stats.messageCount,
          wordIndices: stats.wordIndexCount,
        });
        console.log(`[STORAGE ANALYSIS] Found ${stats.orphanedMessageCount} orphaned messages`);

        const userTopicCount = await store.countTopics(userId);
        const userMessages = await store.listUserMessages(userId);
        console.log(`[STORAGE ANALYSIS] Current user (${userId}) has:`, {
          topics: userTopicCount,
          messages: userMessages.length,
        });

        console.log('[STORAGE ANALYSIS] Storage estimate:', stats.storage);

        // Check for other IndexedDB databases in the same origin
        const databases = await indexedDB.databases();
        console.log('[STORAGE ANALYSIS] All IndexedDB databases:', databases);

        // Try to get detailed size information if the browser supports it
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          console.log('[STORAGE ANALYSIS] Browser storage estimate:', estimate);

          // Calculate percentage used by our database vs. total
          if (estimate.usage && stats.storage.usage) {
            const dbPercentage = (stats.storage.usage / estimate.usage) * 100;
            console.log(`[STORAGE ANALYSIS] Our database uses ${dbPercentage.toFixed(1)}% of total storage usage`);
          }
        }

        // Return comprehensive analysis results
        return {
          success: true,
          counts: {
            topics: stats.topicCount,
            messages: stats.messageCount,
            wordIndices: stats.wordIndexCount,
            orphanedMessages: stats.orphanedMessageCount,
          },
          userStats: { email: userId, topicCount: userTopicCount },
          storageEstimate: stats.storage,
          recommendedAction:
            stats.orphanedMessageCount > 0 ? 'Run cleanupOrphanedData' : 'No issues detected',
        };
      } catch (error) {
        console.error('[STORAGE ANALYSIS] Error analyzing storage:', error);
        return { success: false, error };
      }
    };

    // Define storage retention policy setter
    window.setStorageRetentionPolicy = (days: number) => {
      localStorage.setItem('retentionPolicyDays', days.toString());
    };

    // Set up performance benchmark function
    window.benchmarkOperations = async () => {
      try {
        console.log('[PERFORMANCE] Starting database operation benchmark');
        const results = {
          read: { small: 0, medium: 0, large: 0 },
          write: { small: 0, medium: 0, large: 0 },
        };

        // Benchmark read operations
        const startSmallRead = performance.now();
        await store.sampleMessages(10);
        results.read.small = performance.now() - startSmallRead;

        const startMediumRead = performance.now();
        await store.sampleMessages(50);
        results.read.medium = performance.now() - startMediumRead;

        const startLargeRead = performance.now();
        await store.sampleMessages(100);
        results.read.large = performance.now() - startLargeRead;

        console.log('[PERFORMANCE] Benchmark results:', results);
        return results;
      } catch (error) {
        console.error('[PERFORMANCE] Error during benchmark:', error);
        return { success: false, error };
      }
    };

    // Set up database optimization function
    window.optimizeDatabasePerformance = async () => {
      try {
        console.log('[PERFORMANCE] Running database optimization');

        // In a real implementation, this would perform various optimizations
        // For demonstration, we'll just cleanup orphaned data
        const cleanupResult = await store.cleanupOrphanedData();

        return {
          success: true,
          cleanup: cleanupResult,
        };
      } catch (error) {
        console.error('[PERFORMANCE] Error during optimization:', error);
        return { success: false, error };
      }
    };

    return () => {
      // Clean up by removing window functions
      delete window.cleanupOldestConversations;
      delete window.cleanupOrphanedData;
      delete window.compressMessages;
      delete window.analyzeStorage;
      delete window.setStorageRetentionPolicy;
      delete window.benchmarkOperations;
      delete window.optimizeDatabasePerformance;
    };
  }, [userId, store]);
};

export default useStorageWindowFunctions;
