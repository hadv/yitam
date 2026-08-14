import { useState, useCallback, useEffect } from 'react';
import type { Message } from '../db';
import { useChatHistory, useChatHistoryStore } from '../contexts/ChatHistoryContext';

interface UseMessageManagementProps {
  topicId: number | null;
}

interface UseMessageManagementResult {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  addMessage: (message: Omit<Message, 'id' | 'timestamp' | 'topicId'>) => Promise<number | undefined>;
  getMessages: (limit?: number, offset?: number) => Promise<Message[]>;
  searchMessages: (query: string) => Promise<Message[]>;
  clearMessages: () => Promise<boolean>;
  reloadMessages: () => Promise<void>;
}

/**
 * Hook for managing chat messages for a specific topic
 */
export const useMessageManagement = ({ topicId }: UseMessageManagementProps): UseMessageManagementResult => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { isDBReady } = useChatHistory();
  const store = useChatHistoryStore();

  /**
   * Load messages for the current topic
   */
  const loadMessages = useCallback(async (limit: number = 50, offset: number = 0) => {
    if (!isDBReady || !topicId) {
      setMessages([]);
      setIsLoading(false);
      return [];
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get messages sorted by timestamp (oldest first)
      const topicMessages = await store.listMessages(topicId, { offset, limit });

      setMessages(topicMessages);
      return topicMessages;
    } catch (error) {
      console.error('Error loading messages:', error);
      setError('Failed to load chat messages');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [topicId, isDBReady, store]);
  
  /**
   * Reload messages when component mounts or topicId changes
   */
  const reloadMessages = useCallback(async () => {
    await loadMessages();
  }, [loadMessages]);
  
  /**
   * Add a new message to the current topic
   */
  const addMessage = useCallback(async (message: Omit<Message, 'id' | 'timestamp' | 'topicId'>): Promise<number | undefined> => {
    if (!isDBReady || !topicId) {
      setError('Database not ready or no topic selected');
      return undefined;
    }
    
    try {
      // appendMessage rolls the topic's counters forward and indexes the content
      const messageId = await store.appendMessage(topicId, {
        ...message,
        timestamp: Date.now()
      });

      // Reload messages to refresh the list
      await loadMessages();

      return messageId;
    } catch (error) {
      console.error('Error adding message:', error);
      setError('Failed to add message');
      return undefined;
    }
  }, [topicId, isDBReady, loadMessages, store]);
  
  /**
   * Get messages from the current topic with pagination
   */
  const getMessages = useCallback(async (limit: number = 50, offset: number = 0): Promise<Message[]> => {
    return loadMessages(limit, offset);
  }, [loadMessages]);
  
  /**
   * Search for messages containing specific text
   */
  const searchMessages = useCallback(async (query: string): Promise<Message[]> => {
    if (!isDBReady || !topicId || !query) {
      return [];
    }
    
    try {
      return await store.searchMessagesInTopic(topicId, query);
    } catch (error) {
      console.error('Error searching messages:', error);
      setError('Search failed');
      return [];
    }
  }, [topicId, isDBReady, store]);

  /**
   * Clear all messages from the current topic
   */
  const clearMessages = useCallback(async (): Promise<boolean> => {
    if (!isDBReady || !topicId) {
      setError('Database not ready or no topic selected');
      return false;
    }

    try {
      await store.clearTopicMessages(topicId);

      // Reload messages to refresh the list
      setMessages([]);

      return true;
    } catch (error) {
      console.error('Error clearing messages:', error);
      setError('Failed to clear messages');
      return false;
    }
  }, [topicId, isDBReady, store]);
  
  // Load messages on initial render
  useEffect(() => {
    if (topicId) {
      loadMessages();
    }
  }, [loadMessages, topicId]);
  
  return {
    messages,
    isLoading,
    error,
    addMessage,
    getMessages,
    searchMessages,
    clearMessages,
    reloadMessages
  };
};

export default useMessageManagement; 