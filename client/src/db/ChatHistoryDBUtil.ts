import db, { Topic, Message, WordIndex } from './ChatHistoryDB';

// Stop words for search index filtering
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'have', 'has', 'had', 'do', 'does', 'did', 'to', 'at', 'in', 'on', 'by', 'with',
  'about', 'from', 'for', 'of', 'that', 'this', 'these', 'those', 'it', 'its',
  'not', 'no', 'can', 'will', 'should', 'would', 'could', 'as', 'so', 'then'
]);

/**
 * Index message content for search functionality
 */
export async function indexMessageContent(content: string, topicId: number, messageId: number): Promise<void> {
  if (!content || content.trim() === '') {
    return;
  }

  // Tokenize and filter the content
  const words = content.toLowerCase()
    .split(/\W+/)
    .filter(word => 
      word.length >= 3 &&
      word.length <= 30 &&
      !STOP_WORDS.has(word) &&
      !/^\d+$/.test(word)
    );

  // Store in word index
  return db.transaction('rw', db.wordIndex, async () => {
    const uniqueWords = [...new Set(words)];
    await Promise.all(uniqueWords.map(word =>
      db.wordIndex.put({
        word,
        topicId,
        messageId
      })
    ));
  });
}

/**
 * Database initialization check and handling
 */
export async function ensureDatabaseReady(): Promise<boolean> {
  try {
    const isConnected = await db.checkConnection();
    
    if (!isConnected) {
      console.warn('Database connection failed, attempting recovery');
      return await db.attemptRecovery();
    }
    
    // Check storage limits
    const isStorageCritical = await db.isStorageCritical();
    if (isStorageCritical) {
      console.warn('Storage is approaching capacity limits');
      // Implement graceful degradation or notify user
    }
    
    return true;
  } catch (error) {
    console.error('Database setup failed:', error);
    return false;
  }
}

/**
 * Clean up old data when storage is critical
 */
export async function cleanupOldData(userId: string, keepLastN: number = 20): Promise<void> {
  try {
    // Get storage status
    const isStorageCritical = await db.isStorageCritical();
    
    if (isStorageCritical) {
      // Find topics to remove (keep most recent N topics)
      const allTopics = await db.topics
        .where('userId')
        .equals(userId)
        .sortBy('lastActive');
      
      const topicsToRemove = allTopics.slice(0, Math.max(0, allTopics.length - keepLastN));
      
      if (topicsToRemove.length > 0) {
        await db.transaction('rw', [db.topics, db.messages, db.wordIndex], async () => {
          // Get IDs of topics to remove
          const topicIds = topicsToRemove.map(topic => topic.id).filter(id => id !== undefined) as number[];
          
          // Remove associated messages and word indices
          for (const topicId of topicIds) {
            // Get message IDs for this topic
            const messageIds = await db.messages
              .where('topicId')
              .equals(topicId)
              .toArray()
              .then(messages => messages.map(msg => msg.id).filter(id => id !== undefined) as number[]);
            
            // Delete word indices for these messages
            await Promise.all(messageIds.map(async (messageId) => {
              await db.wordIndex
                .where('messageId')
                .equals(messageId)
                .delete();
            }));
            
            // Delete messages
            await db.messages
              .where('topicId')
              .equals(topicId)
              .delete();
          }
          
          // Delete topics
          await Promise.all(topicIds.map(async (topicId) => {
            await db.topics.delete(topicId);
          }));
        });
        
        console.log(`Cleaned up ${topicsToRemove.length} old conversations due to storage constraints`);
      }
    }
  } catch (error) {
    console.error('Error cleaning up old data:', error);
  }
}

/**
 * Get database stats
 */
export async function getDatabaseStats(): Promise<{
  topicCount: number;
  messageCount: number;
  storageUsage: { usage: number; quota: number; percentage: number };
}> {
  const topicCount = await db.topics.count();
  const messageCount = await db.messages.count();
  const storageUsage = await db.getStorageEstimate();
  
  return {
    topicCount,
    messageCount,
    storageUsage
  };
}

/**
 * Export database data for a user
 */
export async function exportUserData(userId: string): Promise<{ topics: Topic[]; messages: Message[]; }> {
  // Get all topics for the user
  const topics = await db.topics
    .where('userId')
    .equals(userId)
    .toArray();
  
  // Get all messages for these topics
  const topicIds = topics.map(t => t.id).filter(id => id !== undefined) as number[];
  const messages = await db.messages
    .where('topicId')
    .anyOf(topicIds)
    .toArray();
  
  return { topics, messages };
}

/**
 * Import user data
 */
export async function importUserData(data: { topics: Topic[]; messages: Message[]; }, userId: string): Promise<boolean> {
  try {
    // Validate that topics belong to the correct user
    const validTopics = data.topics.filter(topic => topic.userId === userId);
    
    if (validTopics.length === 0) {
      return false;
    }
    
    await db.transaction('rw', [db.topics, db.messages, db.wordIndex], async () => {
      // Import topics
      const topicIdMap = new Map<number, number>();
      
      for (const topic of validTopics) {
        const oldId = topic.id;
        delete topic.id; // Let Dexie assign a new ID
        
        // Save the topic
        const newId = await db.topics.add(topic);
        
        // Map old ID to new ID for message references
        if (oldId !== undefined) {
          topicIdMap.set(oldId, newId);
        }
      }
      
      // Import messages with updated topicIds
      for (const message of data.messages) {
        const oldTopicId = message.topicId;
        const newTopicId = topicIdMap.get(oldTopicId);
        
        if (newTopicId) {
          delete message.id; // Let Dexie assign a new ID
          message.topicId = newTopicId;
          
          // Add the message
          const messageId = await db.messages.add(message);
          
          // Index message content for search
          await indexMessageContent(message.content, newTopicId, messageId);
        }
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error importing data:', error);
    return false;
  }
}

/**
 * Clear all user data
 */
export async function clearUserData(userId: string): Promise<boolean> {
  try {
    // Get all topics for this user
    const userTopics = await db.topics
      .where('userId')
      .equals(userId)
      .toArray();
    
    const topicIds = userTopics.map(t => t.id).filter(id => id !== undefined) as number[];
    
    // Delete data in a transaction
    await db.transaction('rw', [db.topics, db.messages, db.wordIndex], async () => {
      for (const topicId of topicIds) {
        // Get message IDs for this topic
        const messageIds = await db.messages
          .where('topicId')
          .equals(topicId)
          .toArray()
          .then(messages => messages.map(msg => msg.id).filter(id => id !== undefined) as number[]);
        
        // Delete word indices for these messages
        await Promise.all(messageIds.map(async (messageId) => {
          await db.wordIndex
            .where('messageId')
            .equals(messageId)
            .delete();
        }));
        
        // Delete messages
        await db.messages
          .where('topicId')
          .equals(topicId)
          .delete();
      }
      
      // Delete topics
      await db.topics
        .where('userId')
        .equals(userId)
        .delete();
    });
    
    return true;
  } catch (error) {
    console.error('Error clearing user data:', error);
    return false;
  }
} 