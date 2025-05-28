import db, { Topic, Message, WordIndex } from './ChatHistoryDB';
import Dexie from 'dexie';

// Debug IndexedDB
export async function debugIndexedDB(): Promise<boolean> {
  console.log("Starting IndexedDB debug check");
  try {
    // Check if IndexedDB is available
    if (!window.indexedDB) {
      console.error("IndexedDB is not available in this browser");
      return false;
    }
    
    // Check if we can open a test database
    const testDBName = "testDB";
    const request = window.indexedDB.open(testDBName, 1);
    
    return new Promise((resolve) => {
      request.onerror = (event) => {
        console.error("Error opening test IndexedDB:", event);
        console.error("IndexedDB error:", (event.target as IDBOpenDBRequest).error);
        resolve(false);
      };
      
      request.onsuccess = (event) => {
        console.log("Successfully opened test IndexedDB");
        const db = (event.target as IDBOpenDBRequest).result;
        db.close();
        
        // Clean up test database
        window.indexedDB.deleteDatabase(testDBName);
        
        resolve(true);
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        console.log("Creating test store in IndexedDB");
        db.createObjectStore("testStore", { keyPath: "id" });
      };
    });
  } catch (error) {
    console.error("Error during IndexedDB debug check:", error);
    return false;
  }
}

// Direct database write function bypassing Dexie
export async function enhancedDirectDBWrite(topicId: number, message: { role: 'user' | 'assistant'; content: string; timestamp: number }): Promise<boolean> {
  try {
    console.log(`[DB UTIL] Starting direct write for ${message.role} message in topic ${topicId}`);
    
    // First check if database is open
    if (!db.isOpen()) {
      console.log('[DB UTIL] Database not open, opening now');
      await db.open();
    }
    
    // Check if topic exists
    const topic = await db.topics.get(topicId);
    if (!topic) {
      console.error(`[DB UTIL] Topic ${topicId} not found for direct write`);
      return false;
    }
    
    // Try both methods: direct IndexedDB and Dexie API
    try {
      // Method 1: Using Dexie API
      // Create message record
      const messageData = {
        topicId,
        timestamp: message.timestamp,
        role: message.role,
        content: message.content,
        type: 'text',
        tokens: Math.ceil(message.content.length / 4)
      };
      
      // Add message directly
      const messageId = await db.messages.add(messageData);
      console.log(`[DB UTIL] Added ${message.role} message with ID ${messageId} using Dexie API`);
      
      // Update topic statistics
      await db.topics.update(topicId, {
        lastActive: message.timestamp,
        messageCnt: (topic.messageCnt || 0) + 1,
        ...(message.role === 'user' 
          ? { userMessageCnt: (topic.userMessageCnt || 0) + 1 }
          : { assistantMessageCnt: (topic.assistantMessageCnt || 0) + 1 }),
        totalTokens: (topic.totalTokens || 0) + Math.ceil(message.content.length / 4)
      });
      
      console.log(`[DB UTIL] Updated topic ${topicId} statistics for ${message.role} message`);
      return true;
    } catch (dexieError) {
      console.error(`[DB UTIL] Dexie API error:`, dexieError);
      
      // Method 2: Fallback to direct IndexedDB
      console.log(`[DB UTIL] Attempting direct IndexedDB write as fallback`);
      
      // Open the database directly
      const dbName = "ChatHistoryDB";
      const request = window.indexedDB.open(dbName);
      
      return new Promise((resolve) => {
        request.onerror = (event) => {
          console.error("[DB UTIL] Error opening IndexedDB directly:", event);
          resolve(false);
        };
        
        request.onsuccess = (event) => {
          const directDb = (event.target as IDBOpenDBRequest).result;
          try {
            const tx = directDb.transaction("messages", "readwrite");
            const store = tx.objectStore("messages");
            
            const messageToAdd = {
              topicId,
              role: message.role,
              content: message.content,
              timestamp: message.timestamp,
              type: "text",
              tokens: Math.ceil(message.content.length / 4)
            };
            
            const addRequest = store.add(messageToAdd);
            
            addRequest.onsuccess = () => {
              console.log(`[DB UTIL] Successfully wrote message directly to IndexedDB for topic ${topicId}`);
              
              // Try to update topic stats
              try {
                const topicTx = directDb.transaction("topics", "readwrite");
                const topicStore = topicTx.objectStore("topics");
                
                // Get current topic
                const getRequest = topicStore.get(topicId);
                getRequest.onsuccess = () => {
                  const currentTopic = getRequest.result;
                  if (currentTopic) {
                    // Update stats
                    currentTopic.lastActive = message.timestamp;
                    currentTopic.messageCnt = (currentTopic.messageCnt || 0) + 1;
                    
                    if (message.role === 'user') {
                      currentTopic.userMessageCnt = (currentTopic.userMessageCnt || 0) + 1;
                    } else {
                      currentTopic.assistantMessageCnt = (currentTopic.assistantMessageCnt || 0) + 1;
                    }
                    
                    currentTopic.totalTokens = (currentTopic.totalTokens || 0) + Math.ceil(message.content.length / 4);
                    
                    // Put updated topic
                    topicStore.put(currentTopic);
                  }
                };
              } catch (statsError) {
                console.error("[DB UTIL] Error updating topic stats in direct mode:", statsError);
              }
              
              directDb.close();
              resolve(true);
            };
            
            addRequest.onerror = (e) => {
              console.error("[DB UTIL] Error adding message directly:", e);
              directDb.close();
              resolve(false);
            };
          } catch (error) {
            console.error("[DB UTIL] Error in direct IndexedDB transaction:", error);
            directDb.close();
            resolve(false);
          }
        };
      });
    }
  } catch (error) {
    console.error(`[DB UTIL] Error in direct database write:`, error);
    return false;
  }
}

// Reinitialize database
export async function reinitializeDatabase(): Promise<boolean> {
  try {
    console.log("Attempting to reinitialize database");
    
    // Close current database connection
    db.close();
    
    // Wait a moment for connections to close
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Reopen database
    await db.open();
    
    // Test connection
    const isConnected = await db.checkConnection();
    console.log("Database reinitialized, connection status:", isConnected);
    
    return isConnected;
  } catch (error) {
    console.error("Error reinitializing database:", error);
    return false;
  }
}

// Stop words for search index filtering (Vietnamese)
const STOP_WORDS = new Set([
  // Common Vietnamese stop words
  'và', 'hoặc', 'là', 'của', 'có', 'không', 'được', 'các', 'những', 'một', 'trong',
  'để', 'từ', 'với', 'cho', 'bởi', 'tại', 'về', 'theo', 'trên', 'khi', 'như', 'nếu',
  'này', 'đã', 'đó', 'vì', 'sẽ', 'đến', 'phải', 'còn', 'bị', 'thì', 'cũng', 'nên', 
  'rằng', 'tôi', 'bạn', 'họ', 'chúng', 'ta', 'mình', 'ai', 'mà', 'nhưng', 'hay',
  'làm', 'rất', 'thế', 'đang', 'lại', 'sau', 'trước', 'vậy', 'đây', 'kia', 'thật',
  'quá', 'cần', 'chỉ', 'đều', 'mới', 'cứ', 'lên', 'xuống', 'ra', 'vào', 'ngoài', 'qua'
]);

/**
 * Index message content for search functionality
 */
export async function indexMessageContent(content: string, topicId: number, messageId: number): Promise<void> {
  if (!content || content.trim() === '') {
    return;
  }

  try {
    // Tokenize and filter the content - more permissive for Vietnamese
    const words = content.toLowerCase()
      .split(/\s+|[,.!?;:()"']/g) // Split by whitespace and punctuation
      .map(word => word.trim())
      .filter(word => 
        word.length >= 2 && // Reduced from 3 to 2 to better handle Vietnamese words
        word.length <= 40 && // Increased from 30 to 40 to handle longer compound words
        !STOP_WORDS.has(word) &&
        !/^\d+$/.test(word) // Not just digits
      );

    // Store in word index
    const uniqueWords = [...new Set(words)];
    
    if (uniqueWords.length === 0) {
      return;
    }

    // Add each word to the index
    for (const word of uniqueWords) {
      try {
        await db.wordIndex.put({
          word,
          topicId,
          messageId
        });
      } catch (error) {
        console.error(`Error indexing word "${word}" for message ${messageId}:`, error);
        // Continue with other words even if one fails
      }
    }
    
    console.log(`[INDEX] Successfully indexed ${uniqueWords.length} unique words for message ${messageId}`);
  } catch (error) {
    console.error(`[INDEX] Error in indexMessageContent for message ${messageId}:`, error);
    throw error; // Re-throw for proper error handling
  }
}

/**
 * Database initialization check and handling
 */
export async function ensureDatabaseReady(): Promise<boolean> {
  try {
    console.log("Starting database initialization check");
    
    // First debug IndexedDB
    const isIDBAvailable = await debugIndexedDB();
    if (!isIDBAvailable) {
      console.error("IndexedDB check failed");
      return false;
    }
    
    // Check connection
    const isConnected = await db.checkConnection();
    
    if (!isConnected) {
      console.warn('Database connection failed, attempting recovery');
      
      // Try reinitializing first
      const isReinitialized = await reinitializeDatabase();
      if (isReinitialized) {
        console.log("Database successfully reinitialized");
        return true;
      }
      
      // If reinitialization fails, try recovery
      return await db.attemptRecovery();
    }
    
    // Check storage limits
    const isStorageCritical = await db.isStorageCritical();
    if (isStorageCritical) {
      console.warn('Storage is approaching capacity limits');
      // Implement graceful degradation or notify user
    }
    
    console.log("Database is ready");
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
        // Get IDs of topics to remove
        const topicIds = topicsToRemove
          .map((topic: Topic) => topic.id)
          .filter((id: number | undefined): id is number => id !== undefined);
        
        // Remove associated messages and word indices
        for (const topicId of topicIds) {
          // Get message IDs for this topic
          const messages = await db.messages
            .where('topicId')
            .equals(topicId)
            .toArray();
          
          const messageIds = messages
            .map((msg: Message) => msg.id)
            .filter((id: number | undefined): id is number => id !== undefined);
          
          // Delete word indices for these messages
          for (const messageId of messageIds) {
            await db.wordIndex
              .where('messageId')
              .equals(messageId)
              .delete();
          }
          
          // Delete messages
          await db.messages
            .where('topicId')
            .equals(topicId)
            .delete();
        }
        
        // Delete topics
        for (const topicId of topicIds) {
          await db.topics.delete(topicId);
        }
        
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
  const topicIds = topics
    .map((topic: Topic) => topic.id)
    .filter((id: number | undefined): id is number => id !== undefined);
  
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
    
    const topicIds = userTopics
      .map((topic: Topic) => topic.id)
      .filter((id: number | undefined): id is number => id !== undefined);
    
    // Delete data step by step
    for (const topicId of topicIds) {
      // Get message IDs for this topic
      const messages = await db.messages
        .where('topicId')
        .equals(topicId)
        .toArray();
      
      const messageIds = messages
        .map((msg: Message) => msg.id)
        .filter((id: number | undefined): id is number => id !== undefined);
      
      // Delete word indices for these messages
      for (const messageId of messageIds) {
        await db.wordIndex
          .where('messageId')
          .equals(messageId)
          .delete();
      }
      
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
    
    return true;
  } catch (error) {
    console.error('Error clearing user data:', error);
    return false;
  }
}

/**
 * Get user activity statistics by time period
 */
export async function getUserActivityStats(userId: string, days: number = 30): Promise<{
  messagesPerDay: { date: string; count: number }[];
  topicCreationDates: { date: string; count: number }[];
  activeHours: { hour: number; count: number }[];
}> {
  try {
    // Calculate the date range
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - days);
    const startTimestamp = startDate.getTime();
    
    // Get all topics for this user
    const userTopics = await db.topics
      .where('userId')
      .equals(userId)
      .toArray();
    
    const topicIds = userTopics
      .map((topic: Topic) => topic.id)
      .filter((id: number | undefined): id is number => id !== undefined);
    
    // Get all messages for these topics in the date range
    const messages = await db.messages
      .where('topicId')
      .anyOf(topicIds)
      .and((message: Message) => message.timestamp >= startTimestamp)
      .toArray();
    
    // Group messages by day
    const messagesByDay: Record<string, number> = messages.reduce((acc: Record<string, number>, message: Message) => {
      const date = new Date(message.timestamp);
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
      
      if (!acc[dateStr]) {
        acc[dateStr] = 0;
      }
      
      acc[dateStr]++;
      return acc;
    }, {} as Record<string, number>);
    
    // Group topic creation by day
    const topicsByDay: Record<string, number> = userTopics
      .filter((topic: Topic) => topic.createdAt >= startTimestamp)
      .reduce((acc: Record<string, number>, topic: Topic) => {
        const date = new Date(topic.createdAt);
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
        
        if (!acc[dateStr]) {
          acc[dateStr] = 0;
        }
        
        acc[dateStr]++;
        return acc;
      }, {} as Record<string, number>);
    
    // Group messages by hour of day
    const messagesByHour: Record<number, number> = messages.reduce((acc: Record<number, number>, message: Message) => {
      const date = new Date(message.timestamp);
      const hour = date.getHours();
      
      if (!acc[hour]) {
        acc[hour] = 0;
      }
      
      acc[hour]++;
      return acc;
    }, {} as Record<number, number>);
    
    // Convert to arrays for return
    const messagesPerDay = Object.entries(messagesByDay).map(([date, count]) => ({ date, count }));
    const topicCreationDates = Object.entries(topicsByDay).map(([date, count]) => ({ date, count }));
    const activeHours = Object.entries(messagesByHour).map(([hour, count]) => ({ hour: parseInt(hour), count }));
    
    return {
      messagesPerDay,
      topicCreationDates,
      activeHours
    };
  } catch (error) {
    console.error('Error getting user activity stats:', error);
    return {
      messagesPerDay: [],
      topicCreationDates: [],
      activeHours: []
    };
  }
}

/**
 * Get message distribution by role for a topic
 */
export async function getMessageDistribution(topicId: number): Promise<{
  userMessageCount: number;
  assistantMessageCount: number;
  averageUserMessageLength: number;
  averageAssistantMessageLength: number;
  userTokenCount: number;
  assistantTokenCount: number;
}> {
  try {
    // Get all messages for this topic
    const messages = await db.messages
      .where('topicId')
      .equals(topicId)
      .toArray();
    
    // Separate messages by role
    const userMessages = messages.filter((msg: Message) => msg.role === 'user');
    const assistantMessages = messages.filter((msg: Message) => msg.role === 'assistant');
    
    // Calculate metrics
    const userMessageCount = userMessages.length;
    const assistantMessageCount = assistantMessages.length;
    
    const userContentLengths = userMessages.map((msg: Message) => msg.content.length);
    const assistantContentLengths = assistantMessages.map((msg: Message) => msg.content.length);
    
    const averageUserMessageLength = userContentLengths.length > 0
      ? userContentLengths.reduce((a: number, b: number) => a + b, 0) / userContentLengths.length
      : 0;
    
    const averageAssistantMessageLength = assistantContentLengths.length > 0
      ? assistantContentLengths.reduce((a: number, b: number) => a + b, 0) / assistantContentLengths.length
      : 0;
    
    const userTokenCount = userMessages.reduce((sum: number, msg: Message) => sum + (msg.tokens || 0), 0);
    const assistantTokenCount = assistantMessages.reduce((sum: number, msg: Message) => sum + (msg.tokens || 0), 0);
    
    return {
      userMessageCount,
      assistantMessageCount,
      averageUserMessageLength,
      averageAssistantMessageLength,
      userTokenCount,
      assistantTokenCount
    };
  } catch (error) {
    console.error('Error getting message distribution:', error);
    return {
      userMessageCount: 0,
      assistantMessageCount: 0,
      averageUserMessageLength: 0,
      averageAssistantMessageLength: 0,
      userTokenCount: 0,
      assistantTokenCount: 0
    };
  }
}

/**
 * Find related topics based on word occurrence similarity
 */
export async function findRelatedTopics(topicId: number, userId: string, limit: number = 5): Promise<Topic[]> {
  try {
    // Get all words for the current topic
    const topicWords = await db.wordIndex
      .where('topicId')
      .equals(topicId)
      .toArray()
      .then((entries: WordIndex[]) => entries.map((entry: WordIndex) => entry.word));
    
    const uniqueWords = [...new Set(topicWords)];
    
    if (uniqueWords.length === 0) {
      return [];
    }
    
    // Get all topics for this user
    const userTopics = await db.topics
      .where('userId')
      .equals(userId)
      .toArray();
    
    // Filter out the current topic
    const otherTopics = userTopics.filter((topic: Topic) => topic.id !== topicId);
    
    if (otherTopics.length === 0) {
      return [];
    }
    
    // For each topic, count matching words
    const topicScores = await Promise.all(
      otherTopics.map(async (topic: Topic) => {
        if (topic.id === undefined) {
          return { topic, score: 0 };
        }
        
        // Get words for this topic
        const words = await db.wordIndex
          .where('topicId')
          .equals(topic.id)
          .toArray()
          .then((entries: WordIndex[]) => entries.map((entry: WordIndex) => entry.word));
        
        const uniqueTopicWords = [...new Set(words)];
        
        // Count matches
        const matchCount = uniqueWords.filter(word => uniqueTopicWords.includes(word)).length;
        const score = uniqueWords.length > 0 ? matchCount / uniqueWords.length : 0;
        
        return { topic, score };
      })
    );
    
    // Sort by score and take top N
    return topicScores
      .sort((a: {topic: Topic, score: number}, b: {topic: Topic, score: number}) => b.score - a.score)
      .slice(0, limit)
      .map((item: {topic: Topic, score: number}) => item.topic);
  } catch (error) {
    console.error('Error finding related topics:', error);
    return [];
  }
}

/**
 * Perform an advanced search with filters
 */
export interface SearchFilters {
  startDate?: number;
  endDate?: number;
  role?: 'user' | 'assistant';
  exact?: boolean;
}

export async function advancedSearch(
  query: string,
  userId: string,
  filters: SearchFilters = {},
  limit: number = 20
): Promise<{ message: Message; topic: Topic }[]> {
  try {
    if (!query || query.trim() === '') {
      return [];
    }
    
    console.log(`[SEARCH] Starting advanced search for "${query}" for user ${userId}`);
    
    // Get all topics for this user
    const userTopics = await db.topics
      .where('userId')
      .equals(userId)
      .toArray();
    
    console.log(`[SEARCH] Found ${userTopics.length} topics for user`);
    
    const topicIds = userTopics
      .map((topic) => topic.id)
      .filter((id): id is number => id !== undefined);
    
    const topicMap = new Map<number, Topic>(
      userTopics
        .filter((topic) => topic.id !== undefined)
        .map((topic) => [topic.id as number, topic])
    );
    
    console.log(`[SEARCH] Created topic map with ${topicMap.size} entries`);
    
    // Tokenize query with more permissive rules for Vietnamese
    let words = query.toLowerCase()
      .split(/\s+|[,.!?;:()"']/g)
      .map(word => word.trim())
      .filter(word => word.length >= 2); // More permissive minimum length for Vietnamese
    
    if (words.length === 0) {
      return [];
    }

    // For exact search, use the whole phrase
    if (filters.exact) {
      console.log(`[SEARCH] Using exact phrase search for "${query}"`);
      
      // Search for full phrase in message content
      const allMessages = await db.messages
        .where('topicId')
        .anyOf(topicIds)
        .toArray();
      
      console.log(`[SEARCH] Retrieved ${allMessages.length} messages from all topics`);
      
      // Filter messages by content containing exact phrase
      const matchingMessages = allMessages.filter((message: Message) => {
        // Apply date filters
        if (filters.startDate && message.timestamp < filters.startDate) return false;
        if (filters.endDate && message.timestamp > filters.endDate) return false;
        
        // Apply role filter
        if (filters.role && message.role !== filters.role) return false;
        
        // Check for exact phrase
        return message.content.toLowerCase().includes(query.toLowerCase());
      });
      
      console.log(`[SEARCH] Found ${matchingMessages.length} messages matching exact phrase`);
      
      // Sort by timestamp (newest first)
      const results = matchingMessages
        .sort((a: Message, b: Message) => b.timestamp - a.timestamp)
        .slice(0, limit)
        .map((message: Message) => {
          const topic = topicMap.get(message.topicId);
          if (!topic) {
            console.warn(`[SEARCH] Could not find topic with ID ${message.topicId} for message ${message.id}`);
          }
          return {
            message,
            topic: topic as Topic
          };
        })
        .filter((result: {message: Message, topic: Topic}) => result.topic !== undefined);
      
      console.log(`[SEARCH] Returning ${results.length} final exact match results`);
      
      // Log first 3 results for debugging
      results.slice(0, 3).forEach((result, index) => {
        console.log(`[SEARCH] Result ${index+1}: Message ID ${result.message.id}, Topic ID ${result.topic.id}, Topic Title "${result.topic.title}"`);
      });
      
      return results;
    }
    
    // For non-exact search, try to use the word index first
    try {
      console.log(`[SEARCH] Using word index search for ${words.length} words`);
      
      let messageIds = new Set<number>();
      let messageTopicIds = new Map<number, number>();
      
      // Find messages containing the search words
      for (const word of words) {
        try {
          const entries = await db.wordIndex
            .where('word')
            .equals(word)
            .and((entry: WordIndex) => topicIds.includes(entry.topicId))
            .toArray();
          
          console.log(`[SEARCH] Found ${entries.length} entries for word "${word}"`);
          
          entries.forEach((entry: WordIndex) => {
            messageIds.add(entry.messageId);
            messageTopicIds.set(entry.messageId, entry.topicId);
          });
        } catch (error) {
          console.error(`Error searching for word "${word}":`, error);
          // Continue with other words
        }
      }
      
      console.log(`[SEARCH] Word index search found ${messageIds.size} unique message IDs`);
      
      if (messageIds.size === 0) {
        // If no results from index, fall back to direct search
        console.log('[SEARCH] No results from word index, falling back to direct search');
        return await directContentSearch(query, userId, topicIds, topicMap, filters, limit);
      }
      
      // Get the actual messages
      const messages = await db.messages
        .where('id')
        .anyOf([...messageIds])
        .toArray();
      
      console.log(`[SEARCH] Retrieved ${messages.length} messages from database`);
      
      // Apply filters
      const filteredMessages = messages.filter((message: Message) => {
        // Apply date filters
        if (filters.startDate && message.timestamp < filters.startDate) return false;
        if (filters.endDate && message.timestamp > filters.endDate) return false;
        
        // Apply role filter
        if (filters.role && message.role !== filters.role) return false;
        
        return true;
      });
      
      console.log(`[SEARCH] After applying filters: ${filteredMessages.length} messages remain`);
      
      // Sort by timestamp (newest first) and take top N
      const results = filteredMessages
        .sort((a: Message, b: Message) => b.timestamp - a.timestamp)
        .slice(0, limit)
        .map((message: Message) => {
          // Use the topic ID from the message to get the topic
          const topic = topicMap.get(message.topicId);
          if (!topic) {
            console.warn(`[SEARCH] Could not find topic with ID ${message.topicId} for message ${message.id}`);
          }
          return {
            message,
            topic: topic as Topic
          };
        })
        .filter((result: {message: Message, topic: Topic}) => result.topic !== undefined);
      
      console.log(`[SEARCH] Returning ${results.length} final results from word index search`);
      
      // Log first 3 results for debugging
      results.slice(0, 3).forEach((result, index) => {
        console.log(`[SEARCH] Result ${index+1}: Message ID ${result.message.id}, Topic ID ${result.topic.id}, Topic Title "${result.topic.title}"`);
      });
      
      return results;
    } catch (indexError) {
      console.error('[SEARCH] Error using word index for search:', indexError);
      // Fall back to direct content search if word index fails
      return await directContentSearch(query, userId, topicIds, topicMap, filters, limit);
    }
  } catch (error) {
    console.error('[SEARCH] Error in advanced search:', error);
    return [];
  }
}

/**
 * Direct content search without using word index
 * Used as a fallback when word index search fails
 */
async function directContentSearch(
  query: string,
  userId: string,
  topicIds: number[],
  topicMap: Map<number, Topic>,
  filters: SearchFilters = {},
  limit: number = 20
): Promise<{ message: Message; topic: Topic }[]> {
  try {
    console.log(`[SEARCH] Performing direct content search for: "${query}"`);
    
    // Get all messages from the user's topics
    const messages = await db.messages
      .where('topicId')
      .anyOf(topicIds)
      .toArray();
    
    console.log(`[SEARCH] Retrieved ${messages.length} messages from ${topicIds.length} topics`);
    
    // Filter messages by content and other filters
    const queryLower = query.toLowerCase();
    const matchingMessages = messages.filter((message: Message) => {
      // Apply date filters
      if (filters.startDate && message.timestamp < filters.startDate) return false;
      if (filters.endDate && message.timestamp > filters.endDate) return false;
      
      // Apply role filter
      if (filters.role && message.role !== filters.role) return false;
      
      // Check content contains the query
      return message.content.toLowerCase().includes(queryLower);
    });
    
    console.log(`[SEARCH] Found ${matchingMessages.length} messages containing the search term`);
    
    // Group messages by topic for debugging
    const messagesByTopic = new Map<number, number>();
    matchingMessages.forEach(msg => {
      const count = messagesByTopic.get(msg.topicId) || 0;
      messagesByTopic.set(msg.topicId, count + 1);
    });
    
    console.log(`[SEARCH] Messages distribution across topics:`);
    for (const [topicId, count] of messagesByTopic.entries()) {
      const topic = topicMap.get(topicId);
      console.log(`[SEARCH] Topic ID ${topicId} (${topic ? topic.title : 'Unknown'}): ${count} matching messages`);
    }
    
    // Sort by timestamp (newest first) and take top N
    const results = matchingMessages
      .sort((a: Message, b: Message) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map((message: Message) => {
        const topic = topicMap.get(message.topicId);
        if (!topic) {
          console.warn(`[SEARCH] Could not find topic with ID ${message.topicId} for message ${message.id}`);
        }
        return {
          message,
          topic: topic as Topic
        };
      })
      .filter((result: {message: Message, topic: Topic}) => result.topic !== undefined);
    
    console.log(`[SEARCH] Direct content search returning ${results.length} final results`);
    
    // Log first 3 results for debugging
    results.slice(0, 3).forEach((result, index) => {
      console.log(`[SEARCH] Result ${index+1}: Message ID ${result.message.id}, Topic ID ${result.topic.id}, Topic Title "${result.topic.title}"`);
    });
    
    return results;
  } catch (error) {
    console.error('[SEARCH] Error in direct content search:', error);
    return [];
  }
}

/**
 * Re-index all messages for a topic
 * Useful after schema changes or for fixing search issues
 */
export async function reindexTopic(topicId: number): Promise<boolean> {
  try {
    // Try to delete all existing word indices for this topic
    try {
      // Check if the wordIndex table exists and has the correct schema
      let hasWordIndex = true;
      try {
        // Try to access the wordIndex table
        await db.wordIndex.count();
      } catch (schemaError) {
        console.error('[SEARCH] Error accessing wordIndex table, may not exist in schema:', schemaError);
        hasWordIndex = false;
      }

      if (hasWordIndex) {
        try {
          // Try to delete existing indices
          await db.wordIndex
            .where('topicId')
            .equals(topicId)
            .delete();
        } catch (deleteError) {
          // If the topicId is not indexed, this will fail with a SchemaError
          console.log('[SEARCH] Could not delete existing word indices by topicId, likely due to schema issues:', deleteError);
          
          // Try a different approach - get all messageIds for this topic first
          const messages = await db.messages
            .where('topicId')
            .equals(topicId)
            .toArray();
          
          const messageIds = messages
            .map(message => message.id)
            .filter((id): id is number => id !== undefined);
          
          // Then delete word indices for these messages one by one
          for (const messageId of messageIds) {
            try {
              await db.wordIndex
                .where('messageId')
                .equals(messageId)
                .delete();
            } catch (error) {
              console.error(`[SEARCH] Error deleting word indices for message ${messageId}:`, error);
              // Continue with other messages
            }
          }
        }
      }
    } catch (error) {
      console.error('[SEARCH] Error clearing existing word indices:', error);
      // Continue anyway - we can still try to add new indices
    }
    
    // Get all messages for this topic
    const messages = await db.messages
      .where('topicId')
      .equals(topicId)
      .toArray();
    
    // Re-index each message
    let indexedCount = 0;
    for (const message of messages) {
      if (message.id !== undefined && message.content) {
        try {
          await indexMessageContent(message.content, topicId, message.id);
          indexedCount++;
        } catch (error) {
          console.error(`[SEARCH] Error indexing message ${message.id}:`, error);
          // Continue with other messages
        }
      }
    }
    
    console.log(`[SEARCH] Successfully indexed ${indexedCount}/${messages.length} messages for topic ${topicId}`);
    return indexedCount > 0 || messages.length === 0;
  } catch (error) {
    console.error('Error re-indexing topic:', error);
    return false;
  }
}

/**
 * Verify database functionality by attempting to add and read a test message,
 * then remove it afterward. This is a diagnostic function to check database access.
 */
export async function verifyDatabaseFunctionality(): Promise<boolean> {
  console.log("Starting database functionality verification test");
  try {
    // Check if database is open
    if (!db.isOpen()) {
      console.error("Database is not open, attempting to open");
      await db.open();
    }

    // Create a test topic
    const testTopicId = await db.topics.add({
      userId: 'test-verification-user',
      title: "TEST TOPIC - WILL BE DELETED",
      createdAt: Date.now(),
      lastActive: Date.now(),
      messageCnt: 0,
      userMessageCnt: 0,
      assistantMessageCnt: 0,
      totalTokens: 0,
      model: 'test-model',
      systemPrompt: '',
      pinnedState: false
    });
    
    console.log(`Created test topic with ID: ${testTopicId}`);

    // Add a test message
    const messageData = {
      topicId: testTopicId,
      timestamp: Date.now(),
      role: 'user' as const,
      content: 'This is a test message to verify database functionality',
      type: 'text',
      tokens: 10
    };
    
    const messageId = await db.messages.add(messageData);
    console.log(`Added test message with ID: ${messageId}`);

    // Verify we can read the message back
    const savedMessage = await db.messages.get(messageId);
    if (!savedMessage) {
      console.error("Test message not found after saving - database read failed");
      return false;
    }

    console.log(`Successfully read back test message: ${savedMessage.content.substring(0, 20)}...`);

    // Delete the test topic and all its messages
    await db.messages.where('topicId').equals(testTopicId).delete();
    await db.topics.delete(testTopicId);
    console.log(`Cleaned up test topic and messages`);

    console.log("Database verification completed successfully");
    return true;
  } catch (error) {
    console.error("Database verification failed:", error);
    return false;
  }
}

// Add back the original directDBWrite function declaration
export async function directDBWrite(topicId: number, message: { role: 'user' | 'assistant'; content: string; timestamp: number }): Promise<boolean> {
  try {
    console.log(`Attempting direct IndexedDB write for topic ${topicId}`);
    
    // Open the database directly
    const dbName = "ChatHistoryDB";
    const request = window.indexedDB.open(dbName);
    
    return new Promise((resolve) => {
      request.onerror = (event) => {
        console.error("Error opening IndexedDB directly:", event);
        resolve(false);
      };
      
      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        try {
          const tx = db.transaction("messages", "readwrite");
          const store = tx.objectStore("messages");
          
          const messageToAdd = {
            topicId,
            role: message.role,
            content: message.content,
            timestamp: message.timestamp,
            type: "text",
            tokens: Math.ceil(message.content.length / 4)
          };
          
          const addRequest = store.add(messageToAdd);
          
          addRequest.onsuccess = () => {
            console.log(`Successfully wrote message directly to IndexedDB for topic ${topicId}`);
            db.close();
            resolve(true);
          };
          
          addRequest.onerror = (e) => {
            console.error("Error adding message directly:", e);
            db.close();
            resolve(false);
          };
          
          tx.oncomplete = () => {
            console.log("Transaction completed");
          };
          
          tx.onerror = (e) => {
            console.error("Transaction error:", e);
          };
        } catch (error) {
          console.error("Error in direct IndexedDB transaction:", error);
          db.close();
          resolve(false);
        }
      };
    });
  } catch (error) {
    console.error("Error in directDBWrite:", error);
    return false;
  }
} 