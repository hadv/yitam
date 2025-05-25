import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from 'react';
import db, { Topic, Message } from '../db/ChatHistoryDB';
import { ensureDatabaseReady, cleanupOldData } from '../db/ChatHistoryDBUtil';

interface ChatHistoryContextProps {
  isDBReady: boolean;
  dbError: Error | null;
  storageUsage: { usage: number; quota: number; percentage: number } | null;
  forceDBInit: () => Promise<boolean>;
  checkStorageUsage: () => Promise<void>;
  clearUserChatHistory: (userId: string) => Promise<boolean>;
}

const ChatHistoryContext = createContext<ChatHistoryContextProps>({
  isDBReady: false,
  dbError: null,
  storageUsage: null,
  forceDBInit: async () => false,
  checkStorageUsage: async () => {},
  clearUserChatHistory: async () => false,
});

export const useChatHistory = () => useContext(ChatHistoryContext);

interface ChatHistoryProviderProps {
  children: ReactNode;
}

export const ChatHistoryProvider = ({ children }: ChatHistoryProviderProps) => {
  const [isDBReady, setIsDBReady] = useState(false);
  const [dbError, setDBError] = useState<Error | null>(null);
  const [storageUsage, setStorageUsage] = useState<{ usage: number; quota: number; percentage: number } | null>(null);
  const initAttemptsRef = useRef(0);
  
  // Function to initialize the database
  const initDatabase = useCallback(async () => {
    try {
      // Ensure database is open
      if (!db.isOpen()) {
        await db.open();
      }
      
      // Verify database connection
      const isConnected = await db.checkConnection();
      if (!isConnected) {
        throw new Error('Database connection check failed');
      }
      
      // Try a simple read operation
      await db.topics.count();
      
      setIsDBReady(true);
      setDBError(null);
      return true;
    } catch (error) {
      console.error('[CONTEXT DEBUG] Database initialization error:', error);
      setDBError(error instanceof Error ? error : new Error('Unknown database error'));
      
      // Try recovery if multiple init attempts fail
      if (initAttemptsRef.current >= 2) {
        try {
          const recovered = await db.attemptRecovery();
          if (recovered) {
            setIsDBReady(true);
            setDBError(null);
            return true;
          }
        } catch (recoveryError) {
          console.error('[CONTEXT DEBUG] Database recovery error:', recoveryError);
        }
      }
      
      return false;
    }
  }, []);

  // Function to force database initialization - can be called from components
  const forceDBInit = useCallback(async () => {
    initAttemptsRef.current += 1;
    return await initDatabase();
  }, [initDatabase]);
  
  // Check storage usage
  const checkStorageUsage = useCallback(async () => {
    try {
      const usage = await db.getStorageEstimate();
      setStorageUsage(usage);
      
      // Warn if storage is getting full
      if (usage.percentage > 80) {
        console.warn(`Storage usage high: ${usage.percentage.toFixed(1)}%`);
      }
    } catch (error) {
      console.error('Storage usage check error:', error);
    }
  }, []);

  // Initialize database when component mounts
  useEffect(() => {
    // Function to handle initialization with retries
    const initWithRetries = async () => {
      let success = false;
      let attempts = 0;
      const maxAttempts = 3;
      
      while (!success && attempts < maxAttempts) {
        attempts++;
        success = await initDatabase();
        
        if (!success && attempts < maxAttempts) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      if (success) {
        // Check storage usage after successful initialization
        await checkStorageUsage();
      }
    };
    
    initWithRetries();
    
    // Periodically check storage usage
    const storageCheckInterval = setInterval(checkStorageUsage, 60000); // Check every minute
    
    return () => {
      clearInterval(storageCheckInterval);
    };
  }, [initDatabase, checkStorageUsage]);

  // Listen for database open/close events
  useEffect(() => {
    const handleDBOpened = () => {
      setIsDBReady(true);
    };
    
    const handleDBClosed = () => {
      setIsDBReady(false);
    };
    
    // Add event listeners
    db.on('ready', handleDBOpened);
    db.on('versionchange', handleDBClosed);
    
    return () => {
      // Remove event listeners
      db.on('ready').unsubscribe(handleDBOpened);
      db.on('versionchange').unsubscribe(handleDBClosed);
    };
  }, []);
  
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
  
  return (
    <ChatHistoryContext.Provider value={{ isDBReady, dbError, storageUsage, forceDBInit, checkStorageUsage, clearUserChatHistory }}>
      {children}
    </ChatHistoryContext.Provider>
  );
};

export default ChatHistoryContext; 