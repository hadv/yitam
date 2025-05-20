import db, { Topic, Message, WordIndex } from './ChatHistoryDB';
import Dexie from 'dexie';

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
  const uniqueWords = [...new Set(words)];
  
  if (uniqueWords.length === 0) {
    return;
  }

  // Add each word to the index
  for (const word of uniqueWords) {
    await db.wordIndex.put({
      word,
      topicId,
      messageId
    });
  }
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
    
    // Get all topics for this user
    const userTopics = await db.topics
      .where('userId')
      .equals(userId)
      .toArray();
    
    const topicIds = userTopics
      .map((topic: Topic) => topic.id)
      .filter((id: number | undefined): id is number => id !== undefined);
    
    const topicMap = new Map<number, Topic>(
      userTopics
        .filter((topic: Topic) => topic.id !== undefined)
        .map((topic: Topic) => [topic.id as number, topic])
    );
    
    // Tokenize query
    let words = query.toLowerCase().split(/\W+/).filter(word => word.length >= 3);
    
    if (words.length === 0) {
      return [];
    }
    
    // For exact search, use the whole phrase
    if (filters.exact) {
      // Search for full phrase in message content
      const allMessages = await db.messages
        .where('topicId')
        .anyOf(topicIds)
        .toArray();
      
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
      
      // Sort by timestamp (newest first)
      const results = matchingMessages
        .sort((a: Message, b: Message) => b.timestamp - a.timestamp)
        .slice(0, limit)
        .map((message: Message) => ({
          message,
          topic: topicMap.get(message.topicId) as Topic
        }))
        .filter((result: {message: Message, topic: Topic}) => result.topic !== undefined); // Ensure topic exists
      
      return results;
    }
    
    // For non-exact search, use the word index
    let messageIds = new Set<number>();
    let messageTopicIds = new Map<number, number>();
    
    // Find messages containing the search words
    for (const word of words) {
      const entries = await db.wordIndex
        .where('word')
        .equals(word)
        .and((entry: WordIndex) => topicIds.includes(entry.topicId))
        .toArray();
      
      entries.forEach((entry: WordIndex) => {
        messageIds.add(entry.messageId);
        messageTopicIds.set(entry.messageId, entry.topicId);
      });
    }
    
    if (messageIds.size === 0) {
      return [];
    }
    
    // Get the actual messages
    const messages = await db.messages
      .where('id')
      .anyOf([...messageIds])
      .toArray();
    
    // Apply filters
    const filteredMessages = messages.filter((message: Message) => {
      // Apply date filters
      if (filters.startDate && message.timestamp < filters.startDate) return false;
      if (filters.endDate && message.timestamp > filters.endDate) return false;
      
      // Apply role filter
      if (filters.role && message.role !== filters.role) return false;
      
      return true;
    });
    
    // Sort by timestamp (newest first) and take top N
    const results = filteredMessages
      .sort((a: Message, b: Message) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map((message: Message) => ({
        message,
        topic: topicMap.get(message.topicId) as Topic
      }))
      .filter((result: {message: Message, topic: Topic}) => result.topic !== undefined); // Ensure topic exists
    
    return results;
  } catch (error) {
    console.error('Error in advanced search:', error);
    return [];
  }
}

/**
 * Re-index all messages for a topic
 * Useful after schema changes or for fixing search issues
 */
export async function reindexTopic(topicId: number): Promise<boolean> {
  try {
    // Delete all existing word indices for this topic
    await db.wordIndex
      .where('topicId')
      .equals(topicId)
      .delete();
    
    // Get all messages for this topic
    const messages = await db.messages
      .where('topicId')
      .equals(topicId)
      .toArray();
    
    // Re-index each message
    for (const message of messages) {
      if (message.id !== undefined && message.content) {
        await indexMessageContent(message.content, topicId, message.id);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error re-indexing topic:', error);
    return false;
  }
} 