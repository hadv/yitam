import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from 'react';
import { chatHistoryStore, type ChatHistoryStore, type StorageEstimate } from '../db';

interface ChatHistoryContextProps {
  /** The single persistence entry point for the whole app. */
  store: ChatHistoryStore;
  isDBReady: boolean;
  dbError: Error | null;
  storageUsage: StorageEstimate | null;
  forceDBInit: () => Promise<boolean>;
  checkStorageUsage: () => Promise<void>;
  clearUserChatHistory: (userId: string) => Promise<boolean>;
}

const ChatHistoryContext = createContext<ChatHistoryContextProps>({
  store: chatHistoryStore,
  isDBReady: false,
  dbError: null,
  storageUsage: null,
  forceDBInit: async () => false,
  checkStorageUsage: async () => {},
  clearUserChatHistory: async () => false,
});

export const useChatHistory = () => useContext(ChatHistoryContext);

/**
 * The chat-history store. Prefer this over importing the singleton, so a test or a
 * future storage engine only has to replace what the provider hands out.
 */
export const useChatHistoryStore = (): ChatHistoryStore => useContext(ChatHistoryContext).store;

interface ChatHistoryProviderProps {
  children: ReactNode;
  /** Override the store — used by tests and by any future engine swap. */
  store?: ChatHistoryStore;
}

export const ChatHistoryProvider = ({ children, store = chatHistoryStore }: ChatHistoryProviderProps) => {
  const [isDBReady, setIsDBReady] = useState(false);
  const [dbError, setDBError] = useState<Error | null>(null);
  const [storageUsage, setStorageUsage] = useState<StorageEstimate | null>(null);
  const initAttemptsRef = useRef(0);

  // Function to initialize the database
  const initDatabase = useCallback(async () => {
    try {
      await store.open();

      // Verify database connection
      const isConnected = await store.checkConnection();
      if (!isConnected) {
        throw new Error('Database connection check failed');
      }

      // Try a simple read operation
      await store.countTopics();

      setIsDBReady(true);
      setDBError(null);
      return true;
    } catch (error) {
      console.error('[CONTEXT DEBUG] Database initialization error:', error);
      setDBError(error instanceof Error ? error : new Error('Unknown database error'));

      // Try recovery if multiple init attempts fail
      if (initAttemptsRef.current >= 2) {
        try {
          const recovered = await store.attemptRecovery();
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
  }, [store]);

  // Function to force database initialization - can be called from components
  const forceDBInit = useCallback(async () => {
    initAttemptsRef.current += 1;
    return await initDatabase();
  }, [initDatabase]);

  // Check storage usage
  const checkStorageUsage = useCallback(async () => {
    try {
      const usage = await store.getStorageEstimate();
      setStorageUsage(usage);

      // Warn if storage is getting full
      if (usage.percentage > 80) {
        console.warn(`Storage usage high: ${usage.percentage.toFixed(1)}%`);
      }
    } catch (error) {
      console.error('Storage usage check error:', error);
    }
  }, [store]);

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

  // Track the store opening and closing under us
  useEffect(() => {
    return store.onStatusChange(status => {
      setIsDBReady(status === 'ready');
    });
  }, [store]);

  // Clear chat history for a user
  const clearUserChatHistory = useCallback(async (userId: string): Promise<boolean> => {
    try {
      if (!isDBReady) {
        throw new Error('Database not ready');
      }

      const cleared = await store.clearUserData(userId);

      // Update storage usage after clearing
      await checkStorageUsage();

      return cleared;
    } catch (error) {
      console.error('Error clearing chat history:', error);
      return false;
    }
  }, [store, isDBReady, checkStorageUsage]);

  return (
    <ChatHistoryContext.Provider
      value={{ store, isDBReady, dbError, storageUsage, forceDBInit, checkStorageUsage, clearUserChatHistory }}
    >
      {children}
    </ChatHistoryContext.Provider>
  );
};

export default ChatHistoryContext;
