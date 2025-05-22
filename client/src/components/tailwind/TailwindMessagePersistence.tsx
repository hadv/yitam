import React from 'react';
import db, { Message, Topic } from '../../db/ChatHistoryDB';

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
  try {
    console.log(`[DIRECT_SAVE] Starting direct save for topic ${topicId}, role: ${message.role}`);
    
    // Verify DB connection first
    try {
      const isConnected = await db.isOpen();
      if (!isConnected) {
        console.error('[DIRECT_SAVE] Database connection not open, attempting to open');
        await db.open();
      }
    } catch (connError) {
      console.error('[DIRECT_SAVE] Database connection check failed:', connError);
    }
    
    // Check if topic exists
    const topic = await db.topics.get(topicId);
    if (!topic) {
      console.error(`[DIRECT_SAVE] Topic ${topicId} does not exist, message cannot be saved`);
      return -1;
    }
    
    // Add the message directly to the database
    console.log(`[DIRECT_SAVE] Attempting to save message for topic ${topicId}, role: ${message.role}, content length: ${message.content.length}`);
    
    try {
      // First try with safeMessagesAdd
      const messageWithTopicId = { ...message, topicId };
      console.log('[DIRECT_SAVE] Trying with safeMessagesAdd first');
      const messageId = await db.safeMessagesAdd(messageWithTopicId);
      
      if (messageId > 0) {
        console.log(`[DIRECT_SAVE] Message added with safeMessagesAdd, ID: ${messageId}`);
        
        // Update topic statistics
        await updateTopicStats(topic, message);
        
        return messageId;
      } else {
        throw new Error(`Failed to get valid messageId: ${messageId}`);
      }
    } catch (firstAttemptError) {
      console.error('[DIRECT_SAVE] safeMessagesAdd failed:', firstAttemptError);
      
      // Try with safePutMessage as fallback
      try {
        console.log('[DIRECT_SAVE] Trying with safePutMessage as fallback');
        const messageWithTopicId = { 
          ...message, 
          topicId,
          id: Date.now() + Math.floor(Math.random() * 1000) 
        };
        
        const messageId = await db.safePutMessage(messageWithTopicId as Message);
        
        if (messageId > 0) {
          console.log(`[DIRECT_SAVE] Message added with safePutMessage, ID: ${messageId}`);
          
          // Update topic statistics
          await updateTopicStats(topic, message);
          
          return messageId;
        } else {
          throw new Error(`safePutMessage failed with ID: ${messageId}`);
        }
      } catch (secondAttemptError) {
        console.error('[DIRECT_SAVE] safePutMessage fallback failed:', secondAttemptError);
        
        // Try traditional add as last resort
        try {
          console.log('[DIRECT_SAVE] Trying traditional add as last resort');
          const messageWithTopicId = { ...message, topicId };
          const messageId = await db.messages.add(messageWithTopicId);
          
          if (!messageId || messageId <= 0) {
            console.error(`[DIRECT_SAVE] Failed to get valid messageId with traditional add: ${messageId}`);
            return -1;
          }
          
          console.log(`[DIRECT_SAVE] Message added with traditional add, ID: ${messageId}`);
          
          // Update topic statistics
          await updateTopicStats(topic, message);
          
          return messageId;
        } catch (thirdAttemptError) {
          console.error('[DIRECT_SAVE] All save methods failed:', thirdAttemptError);
          return -1;
        }
      }
    }
  } catch (error) {
    console.error('[DIRECT_SAVE] Error in direct save:', error);
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
        
        // Double check message count for debugging
        const msgCount = await db.messages.where('topicId').equals(topicId).count();
        console.log(`[MSG_PERSIST] Topic ${topicId} now has ${msgCount} messages`);
        
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
      
      return messageIds;
    } catch (error) {
      console.error('Error saving message batch:', error);
      return [];
    }
  };

  // Delete a message and update topic stats
  const deleteMessage = async (messageId: number, topicId: number): Promise<void> => {
    try {
      // Get the message to be deleted to update topic stats
      const message = await db.messages.get(messageId);
      if (!message) return;
      
      // Delete the message
      await db.messages.delete(messageId);
      
      // Update topic statistics
      await updateTopicOnMessageDelete(topicId, message);
    } catch (error) {
      console.error('Error deleting message:', error);
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
      const topic = await db.topics.get(topicId);
      if (topic) {
        const updateData: Partial<Topic> = {
          messageCnt: Math.max(0, (topic.messageCnt || 0) - 1)
        };
        
        // Update user or assistant message count based on the role
        if (message.role === 'user') {
          updateData.userMessageCnt = Math.max(0, (topic.userMessageCnt || 0) - 1);
        } else if (message.role === 'assistant') {
          updateData.assistantMessageCnt = Math.max(0, (topic.assistantMessageCnt || 0) - 1);
        }
        
        // Update token count if available
        if (message.tokens) {
          updateData.totalTokens = Math.max(0, (topic.totalTokens || 0) - message.tokens);
        }
        
        await db.topics.update(topicId, updateData);
      }
    } catch (error) {
      console.error('Error updating topic stats on message delete:', error);
    }
  };

  // Manually update topic statistics by counting all messages
  const updateTopicStats = async (topicId: number): Promise<void> => {
    try {
      // Get all messages for this topic
      const messages = await db.messages
        .where('topicId')
        .equals(topicId)
        .toArray();
      
      // Calculate statistics
      const userMessages = messages.filter(msg => msg.role === 'user');
      const assistantMessages = messages.filter(msg => msg.role === 'assistant');
      const totalTokens = messages.reduce((sum, msg) => sum + (msg.tokens || 0), 0);
      
      // Get the latest message timestamp or use current time
      const lastActive = messages.length > 0
        ? Math.max(...messages.map(msg => msg.timestamp))
        : Date.now();
      
      // Update topic
      await db.topics.update(topicId, {
        messageCnt: messages.length,
        userMessageCnt: userMessages.length,
        assistantMessageCnt: assistantMessages.length,
        totalTokens,
        lastActive
      });
    } catch (error) {
      console.error('Error updating topic stats:', error);
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