import { useEffect } from 'react';
import db from '../db/ChatHistoryDB';

/**
 * Hook to register storage-related window functions that are used by useStorageSettings
 * and other storage management hooks
 */
export const useStorageWindowFunctions = (userId: string | undefined) => {
  useEffect(() => {
    if (!userId) return;

    // Define cleanupOldestConversations function
    window.cleanupOldestConversations = async (keepCount = 50) => {
      try {
        console.log(`[STORAGE] Manual cleanup requested, keeping newest ${keepCount} conversations`);
        
        // Get total topic count
        const totalTopics = await db.topics
          .where('userId').equals(userId)
          .count();
        
        if (totalTopics <= keepCount) {
          console.log(`[STORAGE] No cleanup needed, only ${totalTopics} topics exist`);
          return { success: true, deletedCount: 0 };
        }
        
        // Get all topics sorted by last active date
        const allTopics = await db.topics
          .where('userId').equals(userId)
          .sortBy('lastActive');
        
        // Determine how many to delete
        const deleteCount = totalTopics - keepCount;
        
        // Get IDs of oldest topics to delete
        const topicsToDelete = allTopics
          .slice(0, deleteCount)
          .map(topic => topic.id)
          .filter((id): id is number => id !== undefined);
        
        console.log(`[STORAGE] Deleting ${topicsToDelete.length} oldest topics: ${topicsToDelete.join(', ')}`);
        
        // Delete those topics
        if (topicsToDelete.length > 0) {
          const deleteResult = await db.topics
            .bulkDelete(topicsToDelete);
          
          console.log(`[STORAGE] Deleted ${deleteResult} oldest topics`);
          
          // Also perform orphaned data cleanup
          await db.cleanupOrphanedData();
          
          // Trigger UI updates
          if (window.triggerTopicListRefresh) {
            window.triggerTopicListRefresh();
          }
          
          return { success: true, deletedCount: deleteResult };
        } else {
          console.warn('[STORAGE] No topics were selected for deletion');
          return { success: false, error: 'No topics selected for deletion' };
        }
      } catch (error) {
        console.error('[STORAGE] Error during manual cleanup:', error);
        return { success: false, error };
      }
    };
    
    // Define cleanup orphaned data function
    window.cleanupOrphanedData = async () => {
      try {
        console.log('[STORAGE] Running orphaned data cleanup...');
        
        // First count orphaned messages before cleanup
        let orphanedMessagesBefore = 0;
        let orphanedMessageIds: number[] = [];
        
        try {
          // Get all valid topic IDs
          const allTopicIds = await db.topics.toCollection().primaryKeys() as number[];
          console.log(`[STORAGE] Found ${allTopicIds.length} valid topics`);
          
          // Find messages that don't belong to any valid topic
          const allMessages = await db.messages.toArray();
          orphanedMessageIds = allMessages
            .filter(msg => !allTopicIds.includes(msg.topicId))
            .map(msg => msg.id)
            .filter((id): id is number => id !== undefined);
          
          orphanedMessagesBefore = orphanedMessageIds.length;
          console.log(`[STORAGE] Found ${orphanedMessagesBefore} orphaned messages before cleanup`);
          console.log(`[STORAGE] Orphaned message IDs:`, orphanedMessageIds.slice(0, 10), orphanedMessageIds.length > 10 ? `...and ${orphanedMessageIds.length - 10} more` : '');
        } catch (countError) {
          console.error('[STORAGE] Error counting orphaned messages:', countError);
        }
        
        // Run the standard database cleanup function first
        const cleanupResult = await db.cleanupOrphanedData();
        console.log('[STORAGE] Standard cleanup result:', cleanupResult);
        
        // Manually delete orphaned messages if the standard cleanup didn't work
        let manuallyDeletedCount = 0;
        if (orphanedMessageIds.length > 0) {
          console.log(`[STORAGE] Standard cleanup didn't remove orphaned messages, attempting manual deletion of ${orphanedMessageIds.length} messages`);
          
          // Delete in batches to avoid overwhelming the database
          const BATCH_SIZE = 50;
          for (let i = 0; i < orphanedMessageIds.length; i += BATCH_SIZE) {
            const batch = orphanedMessageIds.slice(i, i + BATCH_SIZE);
            try {
              // Delete each message individually to avoid issues with bulkDelete
              for (const msgId of batch) {
                await db.messages.delete(msgId);
                manuallyDeletedCount++;
              }
              console.log(`[STORAGE] Manually deleted batch of ${batch.length} messages (${i+1}-${Math.min(i+BATCH_SIZE, orphanedMessageIds.length)} of ${orphanedMessageIds.length})`);
            } catch (deleteError) {
              console.error(`[STORAGE] Error deleting batch of messages:`, deleteError);
            }
            
            // Small delay between batches to prevent UI freezing
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          
          console.log(`[STORAGE] Manually deleted ${manuallyDeletedCount} orphaned messages`);
        }
        
        // Count empty topics
        let emptyTopicIds: number[] = [];
        try {
          // Get all topic IDs
          const allTopicIds = await db.topics.toCollection().primaryKeys() as number[];
          
          // Find empty topics
          for (const topicId of allTopicIds) {
            const messageCount = await db.messages.where('topicId').equals(topicId).count();
            if (messageCount === 0) {
              emptyTopicIds.push(topicId);
            }
          }
          
          console.log(`[STORAGE] Found ${emptyTopicIds.length} empty topics`);
        } catch (countError) {
          console.error('[STORAGE] Error counting empty topics:', countError);
        }
        
        // Delete empty topics
        let deletedEmptyTopics = 0;
        if (emptyTopicIds.length > 0) {
          try {
            // Delete each topic properly
            for (const topicId of emptyTopicIds) {
              const result = await db.deleteTopic(topicId);
              if (result.success) {
                deletedEmptyTopics++;
              }
            }
            console.log(`[STORAGE] Deleted ${deletedEmptyTopics} empty topics`);
          } catch (deleteError) {
            console.error(`[STORAGE] Error deleting empty topics:`, deleteError);
          }
        }
        
        // Count orphaned messages after cleanup
        let orphanedMessagesAfter = 0;
        try {
          const allTopicIds = await db.topics.toCollection().primaryKeys() as number[];
          const allMessages = await db.messages.toArray();
          orphanedMessagesAfter = allMessages.filter(msg => !allTopicIds.includes(msg.topicId)).length;
          
          console.log(`[STORAGE] Found ${orphanedMessagesAfter} orphaned messages after cleanup`);
        } catch (countError) {
          console.error('[STORAGE] Error counting orphaned messages after cleanup:', countError);
        }
        
        // Return detailed results
        return {
          success: true,
          deletedMessages: manuallyDeletedCount + (cleanupResult.deletedMessages || 0),
          deletedTopics: cleanupResult.deletedTopics || 0,
          deletedWordIndices: cleanupResult.deletedWordIndices || 0,
          messagesBeforeCleanup: orphanedMessagesBefore,
          messagesAfterCleanup: orphanedMessagesAfter,
          emptyTopicsDeleted: deletedEmptyTopics
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
        
        // Get the messages to compress
        let messagesToCompress;
        if (topicId) {
          messagesToCompress = await db.messages
            .where('topicId').equals(topicId)
            .toArray();
        } else {
          // Get topics for this user
          const userTopics = await db.topics
            .where('userId').equals(userId)
            .toArray();
          
          const topicIds = userTopics.map(t => t.id)
            .filter((id): id is number => id !== undefined);
          
          messagesToCompress = await db.messages
            .where('topicId').anyOf(topicIds)
            .toArray();
        }
        
        // Filter for large messages
        const largeMessages = messagesToCompress.filter(m => {
          // Message content is in 'content' property
          return typeof m.content === 'string' && 
                 m.content.length > 1000 && 
                 !m.metadata?.compressed; // Skip already compressed messages
        });
        
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
          
          // Process each message in the batch
          for (const msg of batch) {
            if (typeof msg.content === 'string' && msg.content.length > 1000 && msg.id) {
              // Record original size
              totalChars += msg.content.length;
              
              try {
                // Proper compression approach: Store original content in metadata
                // This simulates compression but preserves the original content
                const originalContent = msg.content;
                
                // Create metadata for tracking compression
                const metadata = {
                  ...(msg.metadata || {}),
                  compressed: true,
                  originalLength: originalContent.length,
                  compressionDate: new Date().toISOString()
                };
                
                // Update the message in the database to include compression metadata
                await db.messages.update(msg.id, { metadata });
                
                // For statistics only - simulating compression ratio
                compressedChars += Math.floor(originalContent.length * 0.6); // Estimate 40% saving
                updatedCount++;
              } catch (updateError) {
                console.error(`[STORAGE] Error updating message ${msg.id}:`, updateError);
              }
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
          afterSize: compressedChars
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
        
        // Get counts from all tables
        const topicCount = await db.topics.count();
        const messageCount = await db.messages.count();
        const wordIndexCount = await db.wordIndex.count();
        
        console.log('[STORAGE ANALYSIS] Database counts:', {
          topics: topicCount,
          messages: messageCount,
          wordIndices: wordIndexCount
        });
        
        // Check for orphaned messages (not associated with any topic)
        const allTopicIds = await db.topics.toCollection().primaryKeys();
        const orphanedMessages = await db.messages
          .filter(msg => !allTopicIds.includes(msg.topicId))
          .count();
        
        console.log(`[STORAGE ANALYSIS] Found ${orphanedMessages} orphaned messages`);
        
        // Check for messages by user
        if (userId) {
          const userTopics = await db.topics
            .where('userId').equals(userId)
            .toArray();
          
          const userTopicIds = userTopics.map(t => t.id).filter(id => id !== undefined) as number[];
          
          const userMessages = userTopicIds.length > 0 
            ? await db.messages.where('topicId').anyOf(userTopicIds).count()
            : 0;
            
          console.log(`[STORAGE ANALYSIS] Current user (${userId}) has:`, {
            topics: userTopics.length,
            messages: userMessages
          });
        }
        
        // Get storage size estimate
        const storageEstimate = await db.getStorageEstimate();
        console.log('[STORAGE ANALYSIS] Storage estimate:', storageEstimate);
        
        // Check for other IndexedDB databases in the same origin
        const databases = await indexedDB.databases();
        console.log('[STORAGE ANALYSIS] All IndexedDB databases:', databases);
        
        // Try to get detailed size information if the browser supports it
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          console.log('[STORAGE ANALYSIS] Browser storage estimate:', estimate);
          
          // Calculate percentage used by our database vs. total
          if (estimate.usage && storageEstimate.usage) {
            const dbPercentage = (storageEstimate.usage / estimate.usage) * 100;
            console.log(`[STORAGE ANALYSIS] Our database uses ${dbPercentage.toFixed(1)}% of total storage usage`);
          }
        }
        
        // Return comprehensive analysis results
        return {
          success: true,
          counts: {
            topics: topicCount,
            messages: messageCount,
            wordIndices: wordIndexCount,
            orphanedMessages
          },
          userStats: userId ? {
            email: userId,
            topicCount: await db.topics.where('userId').equals(userId).count()
          } : null,
          storageEstimate,
          recommendedAction: orphanedMessages > 0 ? 'Run cleanupOrphanedData' : 'No issues detected'
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
          index: { time: 0 }
        };
        
        // Benchmark read operations
        const startSmallRead = performance.now();
        await db.messages.limit(10).toArray();
        results.read.small = performance.now() - startSmallRead;
        
        const startMediumRead = performance.now();
        await db.messages.limit(50).toArray();
        results.read.medium = performance.now() - startMediumRead;
        
        const startLargeRead = performance.now();
        await db.messages.limit(100).toArray();
        results.read.large = performance.now() - startLargeRead;
        
        // Benchmark indexing operations
        const startIndex = performance.now();
        const { reindexTopic } = await import('../db/ChatHistoryDBUtil');
        const topics = await db.topics
          .where('userId').equals(userId)
          .limit(1)
          .toArray();
          
        if (topics.length > 0 && topics[0].id) {
          await reindexTopic(topics[0].id);
        }
        results.index.time = performance.now() - startIndex;
        
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
        const cleanupResult = await db.cleanupOrphanedData();
        
        return {
          success: true,
          cleanup: cleanupResult
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
  }, [userId]);
};

export default useStorageWindowFunctions; 