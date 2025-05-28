import db, { Topic, Message } from '../db/ChatHistoryDB';
import { indexMessageContent, reindexTopic } from '../db/ChatHistoryDBUtil';

/**
 * Reindex all message content for a user
 * This ensures all messages are properly searchable
 */
export async function reindexAllUserMessages(userId: string): Promise<boolean> {
  try {
    console.log(`[SEARCH] Starting reindexing all messages for user ${userId}`);
    
    // Get all topics for this user
    const topics = await db.topics
      .where('userId')
      .equals(userId)
      .toArray();
    
    if (topics.length === 0) {
      console.log(`[SEARCH] No topics found for user ${userId}`);
      return true;
    }
    
    // Reindex each topic
    let successCount = 0;
    const totalTopics = topics.length;
    
    for (const topic of topics) {
      if (topic.id) {
        try {
          const success = await reindexTopic(topic.id);
          if (success) {
            successCount++;
          }
        } catch (error) {
          console.error(`[SEARCH] Error reindexing topic ${topic.id}:`, error);
        }
      }
    }
    
    console.log(`[SEARCH] Reindexed ${successCount}/${totalTopics} topics for user ${userId}`);
    return successCount === totalTopics;
  } catch (error) {
    console.error('[SEARCH] Error reindexing all user messages:', error);
    return false;
  }
}

/**
 * Reindex a single message to ensure it is searchable
 */
export async function reindexMessage(messageId: number): Promise<boolean> {
  try {
    // Get the message
    const message = await db.messages.get(messageId);
    if (!message || !message.content || !message.topicId) {
      console.warn(`[SEARCH] Message ${messageId} not found or missing content/topicId`);
      return false;
    }
    
    // Delete existing word indices for this message
    await db.wordIndex
      .where('messageId')
      .equals(messageId)
      .delete();
    
    // Reindex the message content
    await indexMessageContent(message.content, message.topicId, messageId);
    
    return true;
  } catch (error) {
    console.error(`[SEARCH] Error reindexing message ${messageId}:`, error);
    return false;
  }
}

/**
 * Check if a topic has been indexed
 */
export async function isTopicIndexed(topicId: number): Promise<boolean> {
  try {
    // Get all messages for this topic
    const messages = await db.messages
      .where('topicId')
      .equals(topicId)
      .toArray();
    
    if (messages.length === 0) {
      return true; // No messages to index
    }
    
    // Check if at least one message has been indexed
    const messageIds = messages
      .map(msg => msg.id)
      .filter((id): id is number => id !== undefined);
    
    if (messageIds.length === 0) {
      return false;
    }
    
    // Check if any word indices exist for these messages
    const firstIndexEntry = await db.wordIndex
      .where('messageId')
      .anyOf(messageIds)
      .first();
    
    return !!firstIndexEntry;
  } catch (error) {
    console.error(`[SEARCH] Error checking if topic ${topicId} is indexed:`, error);
    return false;
  }
}

/**
 * Get search index statistics
 */
export async function getSearchIndexStats(): Promise<{
  totalWords: number;
  uniqueWords: number;
  topicsCovered: number;
  messagesCovered: number;
}> {
  try {
    // Get total word index entries
    const totalWords = await db.wordIndex.count();
    
    // Get unique words
    const uniqueWords = await db.wordIndex
      .orderBy('word')
      .uniqueKeys();
    
    // Get distinct topic IDs in word index
    const topicIds = await db.wordIndex
      .orderBy('topicId')
      .uniqueKeys();
    
    // Get distinct message IDs in word index
    const messageIds = await db.wordIndex
      .orderBy('messageId')
      .uniqueKeys();
    
    return {
      totalWords,
      uniqueWords: uniqueWords.length,
      topicsCovered: topicIds.length,
      messagesCovered: messageIds.length
    };
  } catch (error) {
    console.error('[SEARCH] Error getting search index stats:', error);
    return {
      totalWords: 0,
      uniqueWords: 0,
      topicsCovered: 0,
      messagesCovered: 0
    };
  }
} 