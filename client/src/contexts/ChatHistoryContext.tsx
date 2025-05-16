import React, { createContext, useContext, useState, useEffect } from 'react';
import db, { Topic, Message } from '../db/ChatHistoryDB';
import { ensureDatabaseReady, cleanupOldData } from '../db/ChatHistoryDBUtil';

interface ChatHistoryContextType {
  isDBReady: boolean;
  dbError: string | null;
  storageUsage: { usage: number; quota: number; percentage: number } | null;
  checkStorageUsage: () => Promise<void>;
  clearUserChatHistory: (userId: string) => Promise<boolean>;
}

// Create context with default values
const ChatHistoryContext = createContext<ChatHistoryContextType>({
  isDBReady: false,
  dbError: null,
  storageUsage: null,
  checkStorageUsage: async () => {},
  clearUserChatHistory: async () => false,
});

// Custom hook for consuming the context
export const useChatHistory = () => useContext(ChatHistoryContext);

interface ChatHistoryProviderProps {
  children: React.ReactNode;
}

export const ChatHistoryProvider: React.FC<ChatHistoryProviderProps> = ({ children }) => {
  const [isDBReady, setIsDBReady] = useState(false);
  const [dbError, setDBError] = useState<string | null>(null);
  const [storageUsage, setStorageUsage] = useState<{ usage: number; quota: number; percentage: number } | null>(null);
  
  // Initialize database when component mounts
  useEffect(() => {
    const initDatabase = async () => {
      try {
        // Ensure database is ready
        const isReady = await ensureDatabaseReady();
        setIsDBReady(isReady);
        
        if (!isReady) {
          setDBError('Failed to initialize local database. Chat history will not be saved.');
          return;
        }
        
        // Get initial storage usage
        await checkStorageUsage();
      } catch (error) {
        console.error('Error initializing database:', error);
        setDBError('Database initialization error. Some features may not work properly.');
        setIsDBReady(false);
      }
    };
    
    initDatabase();
  }, []);
  
  // Check storage usage
  const checkStorageUsage = async () => {
    try {
      const usage = await db.getStorageEstimate();
      setStorageUsage(usage);
    } catch (error) {
      console.error('Error checking storage usage:', error);
    }
  };
  
  // Clear chat history for a user
  const clearUserChatHistory = async (userId: string): Promise<boolean> => {
    try {
      if (!isDBReady) {
        throw new Error('Database not ready');
      }
      
      // Get all topics for the user
      const userTopics = await db.topics
        .where('userId')
        .equals(userId)
        .toArray();
      
      // Delete data in a transaction
      await db.transaction('rw', [db.topics, db.messages, db.wordIndex], async () => {
        // Get IDs of topics to remove
        const topicIds = userTopics.map(topic => topic.id).filter(id => id !== undefined) as number[];
        
        // Delete messages and word indices for these topics
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
      
      // Update storage usage after clearing
      await checkStorageUsage();
      
      return true;
    } catch (error) {
      console.error('Error clearing chat history:', error);
      return false;
    }
  };
  
  // Context value
  const contextValue: ChatHistoryContextType = {
    isDBReady,
    dbError,
    storageUsage,
    checkStorageUsage,
    clearUserChatHistory,
  };
  
  return (
    <ChatHistoryContext.Provider value={contextValue}>
      {children}
    </ChatHistoryContext.Provider>
  );
};

export default ChatHistoryContext; 