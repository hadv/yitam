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

const TailwindMessagePersistence: React.FC<MessagePersistenceProps> = ({ children }) => {
  // Save a single message and update topic stats
  const saveMessage = async (topicId: number, message: Omit<Message, 'id' | 'topicId'>): Promise<number> => {
    try {
      // Save message to the database
      const messageWithTopicId = { ...message, topicId };
      const messageId = await db.messages.add(messageWithTopicId);
      
      // Update topic statistics
      await updateTopicOnMessageAdd(topicId, message);
      
      return messageId;
    } catch (error) {
      console.error('Error saving message:', error);
      return -1;
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