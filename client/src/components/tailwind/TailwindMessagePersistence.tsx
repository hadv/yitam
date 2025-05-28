import React, { createContext, useContext } from 'react';
import db, { Message, Topic } from '../../db/ChatHistoryDB';
import { enhancedDirectDBWrite } from '../../db/ChatHistoryDBUtil';
import { indexMessageContent } from '../../db/ChatHistoryDBUtil';

interface MessagePersistenceProps {
  children: React.ReactNode;
}

export interface MessagePersistenceContextType {
  saveMessage: (topicId: number, message: Omit<Message, 'id' | 'topicId'>) => Promise<number>;
  saveMessageBatch: (topicId: number, messages: Omit<Message, 'id' | 'topicId'>[]) => Promise<number[]>;
  deleteMessage: (messageId: number, topicId: number) => Promise<void>;
  updateTopicStats: (topicId: number) => Promise<void>;
}

// Create the context with a default value
export const MessagePersistenceContext = React.createContext<MessagePersistenceContextType>({
  saveMessage: async () => -1,
  saveMessageBatch: async () => [],
  deleteMessage: async () => {},
  updateTopicStats: async () => {}
});

// Hook to use the message persistence context
export const useMessagePersistence = () => React.useContext(MessagePersistenceContext);

// Direct message save function that works outside of React context
export async function directSaveMessage(topicId: number, message: Omit<Message, 'id' | 'topicId'>): Promise<number> {
  console.log(`[MSG_PERSIST] Starting directSaveMessage fallback for topic ${topicId}`);

  try {
    // Add the message to the database
    const messageWithTopicId = { ...message, topicId };
    const messageId = await db.messages.add(messageWithTopicId);
    
    // If we get here, save succeeded
    console.log(`[MSG_PERSIST] Successfully saved message with ID ${messageId} using direct method`);

    // Try to update topic stats
    try {
      const topic = await db.topics.get(topicId);
      if (topic) {
        await updateTopicStats(topic, message);
      }
    } catch (statsError) {
      console.error('[MSG_PERSIST] Error updating topic stats in direct save:', statsError);
    }

    // Index message content for search
    try {
      console.log(`[MSG_PERSIST] Indexing message ${messageId} for search (direct save)`);
      await indexMessageContent(message.content, topicId, messageId);
    } catch (indexError) {
      console.error(`[MSG_PERSIST] Error indexing message in direct save:`, indexError);
      // Continue even if indexing fails
    }
    
    return messageId;
  } catch (error) {
    console.error('[MSG_PERSIST] Error in direct save method:', error);
    
    // Last resort - try the enhanced direct write method
    try {
      console.log('[MSG_PERSIST] Attempting last-resort direct write');
      const success = await enhancedDirectDBWrite(topicId, {
        role: message.role,
        content: message.content,
        timestamp: message.timestamp || Date.now()
      });
      
      if (success) {
        console.log('[MSG_PERSIST] Last-resort write succeeded');
        return -2; // Special code to indicate success but no id
      }
      
      console.error('[MSG_PERSIST] Last-resort write failed');
    } catch (lastError) {
      console.error('[MSG_PERSIST] Last-resort write error:', lastError);
    }
    
    return -1;
  }
}

// Helper function to update topic stats
async function updateTopicStats(topic: Topic, message: Omit<Message, 'id' | 'topicId'>): Promise<void> {
  try {
    const updateData: Partial<Topic> = {
      lastActive: Date.now(),
      messageCnt: (topic.messageCnt || 0) + 1
    };
    
    // Update user or assistant message count based on the role
    if (message.role === 'user') {
      updateData.userMessageCnt = (topic.userMessageCnt || 0) + 1;
    } else if (message.role === 'assistant') {
      updateData.assistantMessageCnt = (topic.assistantMessageCnt || 0) + 1;
    }
    
    // Update token count if available
    if (message.tokens) {
      updateData.totalTokens = (topic.totalTokens || 0) + message.tokens;
    }
    
    await db.topics.update(topic.id!, updateData);
    console.log(`[DIRECT_SAVE] Topic stats updated for topic ${topic.id}`);
  } catch (statsError) {
    console.error('[DIRECT_SAVE] Error updating topic stats:', statsError);
  }
}

const TailwindMessagePersistence: React.FC<MessagePersistenceProps> = ({ children }) => {
  // Save a single message and update topic stats
  const saveMessage = async (topicId: number, message: Omit<Message, 'id' | 'topicId'>): Promise<number> => {
    console.log(`[MSG_PERSIST] Starting saveMessage for topic ${topicId}, role: ${message.role}, content length: ${message.content.length}`);
    
    try {
      // Ensure database is open
      if (!db.isOpen()) {
        console.log('[MSG_PERSIST] Database not open, attempting to open');
        await db.open();
      }
      
      // Explicitly verify the topic exists first
      const topic = await db.topics.get(topicId);
      if (!topic) {
        console.error(`[MSG_PERSIST] Cannot save message: Topic ${topicId} does not exist`);
        // Instead of returning -1 immediately, try to recreate the topic
        try {
          console.log(`[MSG_PERSIST] Attempting to recreate missing topic ${topicId}`);
          await db.topics.add({
            id: topicId,
            userId: 'recovered-user',
            title: 'Recovered Conversation',
            createdAt: Date.now(),
            lastActive: Date.now(),
            messageCnt: 0,
            userMessageCnt: 0,
            assistantMessageCnt: 0,
            totalTokens: 0
          });
          console.log(`[MSG_PERSIST] Successfully recreated topic ${topicId}`);
        } catch (topicRecreateError) {
          console.error(`[MSG_PERSIST] Failed to recreate topic: ${topicRecreateError}`);
          return -1;
        }
      }
      
      // Save message to the database using the new safe method
      try {
        // Use the enhanced safe method for message adding
        const messageWithTopicId = { ...message, topicId };
        const messageId = await db.safeMessagesAdd(messageWithTopicId);
        console.log(`[MSG_PERSIST] Message saved with ID ${messageId} using safe method`);
      
        // Update topic statistics
        await updateTopicOnMessageAdd(topicId, message);
        
        // Index message content for search
        try {
          console.log(`[MSG_PERSIST] Indexing message ${messageId} for search`);
          await indexMessageContent(message.content, topicId, messageId);
        } catch (indexError) {
          console.error(`[MSG_PERSIST] Error indexing message content:`, indexError);
          // Continue even if indexing fails - search will be affected but core functionality remains
        }
        
        // Double check message count for debugging
        const msgCount = await db.messages.where('topicId').equals(topicId).count();
        console.log(`[MSG_PERSIST] Topic ${topicId} now has ${msgCount} messages`);
        
        // Verify message was actually saved
        const savedMessage = await db.messages.get(messageId);
        if (savedMessage) {
          console.log(`[MSG_PERSIST] Successfully verified message ${messageId} exists in database`);
        } else {
          console.warn(`[MSG_PERSIST] Warning: Could not verify message ${messageId} in database after save`);
        }
      
        return messageId;
      } catch (innerError) {
        console.error('[MSG_PERSIST] Error in safe message add:', innerError);
        return await directSaveMessage(topicId, message);
      }
    } catch (error) {
      console.error('[MSG_PERSIST] Error saving message:', error);
      
      // Try direct save as fallback
      return await directSaveMessage(topicId, message);
    }
  };

  // Save multiple messages at once
  const saveMessageBatch = async (
    topicId: number, 
    messages: Omit<Message, 'id' | 'topicId'>[]
  ): Promise<number[]> => {
    try {
      // Prepare messages with topicId
      const messagesWithTopicId = messages.map(message => ({ ...message, topicId }));
      
      // Use transaction to ensure atomic operation
      const messageIds = await db.transaction('rw', db.messages, db.topics, async () => {
        // Add all messages and get their IDs
        const ids = await Promise.all(
          messagesWithTopicId.map(msg => db.messages.add(msg))
        );
        
        // Update topic statistics
        const topic = await db.topics.get(topicId);
        if (topic) {
          // Calculate statistics from the new messages
          const userMsgCount = messages.filter(msg => msg.role === 'user').length;
          const assistantMsgCount = messages.filter(msg => msg.role === 'assistant').length;
          const totalTokens = messages.reduce((sum, msg) => sum + (msg.tokens || 0), 0);
          
          // Update topic
          await db.topics.update(topicId, {
            lastActive: Date.now(),
            messageCnt: (topic.messageCnt || 0) + messages.length,
            userMessageCnt: (topic.userMessageCnt || 0) + userMsgCount,
            assistantMessageCnt: (topic.assistantMessageCnt || 0) + assistantMsgCount,
            totalTokens: (topic.totalTokens || 0) + totalTokens
          });
        }
        
        return ids;
      });
      
      // Index all messages for search
      try {
        console.log(`[MSG_PERSIST] Indexing ${messageIds.length} messages in batch for search`);
        for (let i = 0; i < messageIds.length; i++) {
          const messageId = messageIds[i];
          const message = messages[i];
          if (messageId && message.content) {
            await indexMessageContent(message.content, topicId, messageId);
          }
        }
      } catch (indexError) {
        console.error(`[MSG_PERSIST] Error indexing batch messages:`, indexError);
        // Continue even if indexing fails
      }
      
      return messageIds;
    } catch (error) {
      console.error('Error saving message batch:', error);
      return [];
    }
  };

  // Delete a message and update topic stats
  const deleteMessage = async (messageId: number, topicId: number): Promise<void> => {
    try {
      console.log(`[DELETE DEBUG] Starting deletion process for message ID ${messageId} from topic ${topicId}`);
      
      // Make sure the database is open
      await db.ensureOpen();
      
      // Check if the topic exists first
      const topicExists = await db.topics.get(topicId);
      if (!topicExists) {
        console.log(`[DELETE DEBUG] Topic ${topicId} does not exist, nothing to delete`);
        return;
      }
      
      // Get the message first for topic stats update
      const message = await db.messages.get(messageId);
      if (!message) {
        console.log(`[DELETE DEBUG] Message ID ${messageId} not found in database, nothing to delete`);
        return;
      }

      console.log(`[DELETE DEBUG] Found message to delete: ID=${messageId}, role=${message.role}, content=${message.content.substring(0, 30)}...`);
      
      // Count messages BEFORE deletion
      const messageCountBefore = await db.messages.where('topicId').equals(topicId).count();
      console.log(`[DELETE DEBUG] Topic ${topicId} has ${messageCountBefore} messages before deletion`);
      
      // If this is the last message, delete the topic directly
      if (messageCountBefore === 1) {
        console.log(`[DELETE DEBUG] This is the last message in topic ${topicId}, deleting topic`);
        
        try {
          // Delete message first
          await db.forceDeleteMessage(messageId);
          
          // Then delete the topic
          await db.topics.delete(topicId);
          console.log(`[DELETE DEBUG] Topic ${topicId} deleted successfully`);
          
          // No need for further processing since topic is gone
          return;
        } catch (error) {
          console.error(`[DELETE DEBUG] Error deleting topic ${topicId}:`, error);
          // Continue with normal flow if topic deletion fails
        }
      }
      
      // Use the force delete method which tries multiple deletion strategies
      const deleteSuccess = await db.forceDeleteMessage(messageId);
      
      if (!deleteSuccess) {
        console.error(`[DELETE DEBUG] Failed to delete message ${messageId} after multiple attempts`);
        throw new Error(`Unable to delete message ${messageId} using all available strategies`);
      }
      
      console.log(`[DELETE DEBUG] Successfully deleted message ${messageId}`);
      
      // Count messages AFTER deletion to see if the topic is now empty
      const messageCountAfter = await db.messages.where('topicId').equals(topicId).count();
      console.log(`[DELETE DEBUG] Topic ${topicId} has ${messageCountAfter} messages after deletion`);
      
      // Check if the topic is now COMPLETELY empty (exactly 0 messages)
      if (messageCountAfter === 0) {
        console.log(`[DELETE DEBUG] Topic ${topicId} is now completely empty (0 messages), deleting topic`);
        
        try {
          // Delete the topic
          await db.topics.delete(topicId);
          console.log(`[DELETE DEBUG] Topic ${topicId} deleted successfully`);
          
          // Fire the custom refresh event to update UI
          if (typeof window !== 'undefined') {
            console.log(`[DELETE DEBUG] Dispatching refresh event to update UI`);
            window.dispatchEvent(new Event('storage:refreshTopics'));
          }
          
          // Return early since there's no topic to update stats for
          return;
        } catch (topicDeleteError) {
          console.error(`[DELETE DEBUG] Error deleting topic ${topicId}:`, topicDeleteError);
          // Continue with normal stats update if topic deletion fails
        }
      }
      
      // Update topic statistics using our updateTopicMessageCount method
      try {
        const updateSuccess = await db.updateTopicMessageCount(topicId);
        console.log(`[DELETE DEBUG] Topic ${topicId} stats update: ${updateSuccess ? 'success' : 'failed'}`);
        
        // Fire the custom refresh event to update UI
        if (typeof window !== 'undefined') {
          console.log(`[DELETE DEBUG] Dispatching refresh event to update UI`);
          window.dispatchEvent(new Event('storage:refreshTopics'));
        }
      } catch (statsError) {
        console.error(`[DELETE DEBUG] Error updating topic stats for ${topicId}:`, statsError);
      }
    } catch (error) {
      console.error(`[DELETE DEBUG] Error deleting message ${messageId}:`, error);
      throw error; // Re-throw to allow proper handling in UI
    }
  };

  // Update topic statistics when a message is added
  const updateTopicOnMessageAdd = async (topicId: number, message: Omit<Message, 'id' | 'topicId'>): Promise<void> => {
    try {
      const topic = await db.topics.get(topicId);
      if (topic) {
        const updateData: Partial<Topic> = {
          lastActive: Date.now(),
          messageCnt: (topic.messageCnt || 0) + 1
        };
        
        // Update user or assistant message count based on the role
        if (message.role === 'user') {
          updateData.userMessageCnt = (topic.userMessageCnt || 0) + 1;
        } else if (message.role === 'assistant') {
          updateData.assistantMessageCnt = (topic.assistantMessageCnt || 0) + 1;
        }
        
        // Update token count if available
        if (message.tokens) {
          updateData.totalTokens = (topic.totalTokens || 0) + message.tokens;
        }
        
        await db.topics.update(topicId, updateData);
        console.log(`[MSG_PERSIST] Topic stats updated for topic ${topicId}`);
      }
    } catch (error) {
      console.error('Error updating topic stats on message add:', error);
    }
  };

  // Update topic statistics when a message is deleted
  const updateTopicOnMessageDelete = async (topicId: number, message: Message): Promise<void> => {
    try {
      console.log(`[STATS DEBUG] Updating topic ${topicId} stats after deleting a message`);
      
      // First verify topic still exists
      const topic = await db.topics.get(topicId);
      if (!topic) {
        console.log(`[STATS DEBUG] Topic ${topicId} no longer exists, skipping stats update`);
        return;
      }
      
      // Get actual message count directly from database
      const actualMessageCount = await db.messages.where('topicId').equals(topicId).count();
      const actualUserCount = await db.messages.where('topicId').equals(topicId).and(msg => msg.role === 'user').count();
      const actualAssistantCount = await db.messages.where('topicId').equals(topicId).and(msg => msg.role === 'assistant').count();
      
      console.log(`[STATS DEBUG] Actual counts for topic ${topicId}: total=${actualMessageCount}, user=${actualUserCount}, assistant=${actualAssistantCount}`);
      
      // Calculate token count (this is approximate as we'd need to load all messages to be exact)
      let newTokenCount = (topic.totalTokens || 0) - (message.tokens || 0);
      if (newTokenCount < 0) newTokenCount = 0;
      
      // Use transaction to ensure atomicity
      await db.transaction('rw', db.topics, async () => {
        await db.topics.update(topicId, {
          messageCnt: actualMessageCount,
          userMessageCnt: actualUserCount,
          assistantMessageCnt: actualAssistantCount,
          totalTokens: newTokenCount,
          lastActive: Date.now()
        });
        
        console.log(`[STATS DEBUG] Topic ${topicId} stats updated with accurate counts`);
      });
      
      // Check if topic is now empty and should be deleted
      if (actualMessageCount === 0) {
        console.log(`[STATS DEBUG] Topic ${topicId} is now empty, marking for deletion`);
        // We don't delete here - this will be handled in the main deleteMessage function
      }
    } catch (error) {
      console.error(`[STATS DEBUG] Error updating topic stats on message delete for topic ${topicId}:`, error);
    }
  };

  // Manually update topic statistics by counting all messages
  const updateTopicStats = async (topicId: number): Promise<void> => {
    try {
      console.log(`[STATS DEBUG] Starting complete topic stats refresh for topic ${topicId}`);
      
      // First ensure the topic exists
      const topic = await db.topics.get(topicId);
      if (!topic) {
        console.error(`[STATS DEBUG] Topic ${topicId} not found, cannot update stats`);
        return;
      }
      
      // Get all messages for this topic with a fresh query
      const messages = await db.messages
        .where('topicId')
        .equals(topicId)
        .toArray();
      
      console.log(`[STATS DEBUG] Found ${messages.length} messages for topic ${topicId}`);
      
      // Calculate statistics
      const userMessages = messages.filter(msg => msg.role === 'user');
      const assistantMessages = messages.filter(msg => msg.role === 'assistant');
      const totalTokens = messages.reduce((sum, msg) => sum + (msg.tokens || 0), 0);
      
      // Get the latest message timestamp or use current time
      const lastActive = messages.length > 0
        ? Math.max(...messages.map(msg => msg.timestamp))
        : Date.now();
      
      // Update topic with accurate counts
      await db.transaction('rw', db.topics, async () => {
        await db.topics.update(topicId, {
          messageCnt: messages.length,
          userMessageCnt: userMessages.length,
          assistantMessageCnt: assistantMessages.length,
          totalTokens,
          lastActive
        });
        console.log(`[STATS DEBUG] Topic ${topicId} stats updated successfully: ${messages.length} total messages`);
      });
    } catch (error) {
      console.error('[STATS DEBUG] Error updating topic stats:', error);
    }
  };

  // Create the context value object
  const contextValue: MessagePersistenceContextType = {
    saveMessage,
    saveMessageBatch,
    deleteMessage,
    updateTopicStats
  };

  return (
    <MessagePersistenceContext.Provider value={contextValue}>
      {children}
    </MessagePersistenceContext.Provider>
  );
};

export default TailwindMessagePersistence; 