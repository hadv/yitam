import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { Topic, Message } from '../db';
import { useChatHistoryStore } from './ChatHistoryContext';
import { useLoading } from './LoadingContext';

// Define our context type
interface DataContextType {
  // Topics
  createTopic: (topic: Omit<Topic, 'id'>) => Promise<number | undefined>;
  updateTopic: (id: number, data: Partial<Topic>) => Promise<boolean>;
  deleteTopic: (id: number) => Promise<boolean>;
  
  // Messages
  addMessage: (message: Omit<Message, 'id'>) => Promise<number | undefined>;
  deleteMessage: (messageId: number, topicId: number) => Promise<boolean>;
  
  // Cache management
  invalidateCache: (key: string) => void;
}

// Create the context
const DataContext = createContext<DataContextType>({
  createTopic: async () => undefined,
  updateTopic: async () => false,
  deleteTopic: async () => false,
  addMessage: async () => undefined,
  deleteMessage: async () => false,
  invalidateCache: () => {},
});

// Export the hook for consuming the context
export const useData = () => useContext(DataContext);

// Provider component
export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const store = useChatHistoryStore();
  const { startLoading, stopLoading, setError } = useLoading();
  
  // Cache for optimistic updates
  const [cache, setCache] = useState<Record<string, any>>({});
  
  // Invalidate a cache entry
  const invalidateCache = useCallback((key: string) => {
    setCache(prev => {
      const newCache = { ...prev };
      delete newCache[key];
      return newCache;
    });
  }, []);
  
  // Create a new topic with optimistic updates
  const createTopic = useCallback(async (topic: Omit<Topic, 'id'>): Promise<number | undefined> => {
    const operationKey = 'create-topic';
    startLoading(operationKey);
    
    try {
      // Optimistically add to cache with temporary ID
      const tempId = -Date.now(); // Temporary negative ID
      const newTopic = { ...topic, id: tempId };
      
      // Add to cache
      const cacheKey = `topic-list-${topic.userId}`;
      setCache(prev => ({
        ...prev,
        [cacheKey]: [newTopic, ...(prev[cacheKey] || [])]
      }));
      
      // Create in database
      const id = await store.createTopic(topic);
      
      // Update cache with real ID
      if (id) {
        setCache(prev => {
          const topicList = prev[cacheKey] || [];
          return {
            ...prev,
            [cacheKey]: topicList.map((t: any) => t.id === tempId ? { ...t, id } : t)
          };
        });
      }
      
      return id;
    } catch (error) {
      console.error('Error creating topic:', error);
      setError(operationKey, 'Không thể tạo chủ đề mới.');
      
      // Revert optimistic update
      const cacheKey = `topic-list-${topic.userId}`;
      invalidateCache(cacheKey);
      
      return undefined;
    } finally {
      stopLoading(operationKey);
    }
  }, [startLoading, stopLoading, setError, invalidateCache, store]);
  
  // Update a topic with optimistic updates
  const updateTopic = useCallback(async (id: number, data: Partial<Topic>): Promise<boolean> => {
    const operationKey = `update-topic-${id}`;
    startLoading(operationKey);
    
    try {
      // Get the current topic
      const topic = await store.getTopic(id);
      if (!topic) {
        throw new Error('Topic not found');
      }
      
      // Create updated topic
      const updatedTopic = { ...topic, ...data };
      
      // Optimistically update cache
      const cacheKey = `topic-${id}`;
      setCache(prev => ({
        ...prev,
        [cacheKey]: updatedTopic
      }));
      
      // Also update topic list cache if it exists
      const listCacheKey = `topic-list-${topic.userId}`;
      if (cache[listCacheKey]) {
        setCache(prev => {
          const topicList = prev[listCacheKey] || [];
          return {
            ...prev,
            [listCacheKey]: topicList.map((t: Topic) => t.id === id ? updatedTopic : t)
          };
        });
      }
      
      // Update in database
      await store.updateTopic(id, data);
      return true;
    } catch (error) {
      console.error(`Error updating topic ${id}:`, error);
      setError(operationKey, 'Không thể cập nhật chủ đề.');
      
      // Invalidate caches
      invalidateCache(`topic-${id}`);
      const topic = await store.getTopic(id);
      if (topic) {
        invalidateCache(`topic-list-${topic.userId}`);
      }
      
      return false;
    } finally {
      stopLoading(operationKey);
    }
  }, [startLoading, stopLoading, setError, invalidateCache, cache, store]);
  
  // Delete a topic with optimistic updates
  const deleteTopic = useCallback(async (id: number): Promise<boolean> => {
    const operationKey = `delete-topic-${id}`;
    startLoading(operationKey);
    
    try {
      // Get the topic first so we can update the list cache
      const topic = await store.getTopic(id);
      if (!topic) {
        throw new Error('Topic not found');
      }
      
      // Optimistically update cache
      invalidateCache(`topic-${id}`);
      
      // Update topic list cache
      const listCacheKey = `topic-list-${topic.userId}`;
      if (cache[listCacheKey]) {
        setCache(prev => {
          const topicList = prev[listCacheKey] || [];
          return {
            ...prev,
            [listCacheKey]: topicList.filter((t: Topic) => t.id !== id)
          };
        });
      }
      
      // Cascades to the topic's messages and word index entries
      await store.deleteTopic(id);
      
      return true;
    } catch (error) {
      console.error(`Error deleting topic ${id}:`, error);
      setError(operationKey, 'Không thể xóa chủ đề.');
      
      // Invalidate caches to refresh from DB
      const topic = await store.getTopic(id);
      if (topic) {
        invalidateCache(`topic-list-${topic.userId}`);
      }
      
      return false;
    } finally {
      stopLoading(operationKey);
    }
  }, [startLoading, stopLoading, setError, invalidateCache, cache, store]);
  
  // Add a message with optimistic updates
  const addMessage = useCallback(async (message: Omit<Message, 'id'>): Promise<number | undefined> => {
    const { topicId, ...rest } = message;
    const operationKey = `add-message-${topicId}`;
    startLoading(operationKey);

    try {
      // Optimistically add to cache with temporary ID
      const tempId = -Date.now(); // Temporary negative ID
      const newMessage = { ...message, id: tempId };

      // Add to cache
      const cacheKey = `messages-${topicId}`;
      setCache(prev => ({
        ...prev,
        [cacheKey]: [...(prev[cacheKey] || []), newMessage]
      }));

      // Create in database — the store rolls the topic's counters forward too
      const id = await store.appendMessage(topicId, rest);

      // Update cache with real ID
      if (id) {
        setCache(prev => {
          const messageList = prev[cacheKey] || [];
          return {
            ...prev,
            [cacheKey]: messageList.map((m: Message) => m.id === tempId ? { ...m, id } : m)
          };
        });

        // The topic's counters just changed
        invalidateCache(`topic-${topicId}`);
      }

      return id;
    } catch (error) {
      console.error('Error adding message:', error);
      setError(operationKey, 'Không thể gửi tin nhắn.');
      
      // Revert optimistic update
      invalidateCache(`messages-${topicId}`);

      return undefined;
    } finally {
      stopLoading(operationKey);
    }
  }, [startLoading, stopLoading, setError, invalidateCache, store]);
  
  // Delete a message with optimistic updates
  const deleteMessage = useCallback(async (messageId: number, topicId: number): Promise<boolean> => {
    const operationKey = `delete-message-${messageId}`;
    startLoading(operationKey);
    
    try {
      // Get the message first so we can update topic stats
      const message = await store.getMessage(messageId);
      if (!message) {
        throw new Error('Message not found');
      }
      
      // Optimistically update cache
      const cacheKey = `messages-${topicId}`;
      if (cache[cacheKey]) {
        setCache(prev => {
          const messageList = prev[cacheKey] || [];
          return {
            ...prev,
            [cacheKey]: messageList.filter((m: Message) => m.id !== messageId)
          };
        });
      }
      
      // Delete from database
      await store.deleteMessage(messageId);
      
      // Update topic stats
      const topic = await store.getTopic(topicId);
      if (topic) {
        const updateData: Partial<Topic> = {
          messageCnt: Math.max((topic.messageCnt || 0) - 1, 0),
          lastActive: Date.now() // Update lastActive - deleting messages is user activity
        };

        if (message.role === 'user') {
          updateData.userMessageCnt = Math.max((topic.userMessageCnt || 0) - 1, 0);
        } else {
          updateData.assistantMessageCnt = Math.max((topic.assistantMessageCnt || 0) - 1, 0);
        }

        if (message.tokens) {
          updateData.totalTokens = Math.max((topic.totalTokens || 0) - message.tokens, 0);
        }

        await store.updateTopic(topicId, updateData);

        // Invalidate topic cache
        invalidateCache(`topic-${topicId}`);
      }
      
      return true;
    } catch (error) {
      console.error(`Error deleting message ${messageId}:`, error);
      setError(operationKey, 'Không thể xóa tin nhắn.');
      
      // Invalidate cache to refresh from DB
      invalidateCache(`messages-${topicId}`);
      
      return false;
    } finally {
      stopLoading(operationKey);
    }
  }, [startLoading, stopLoading, setError, invalidateCache, cache, store]);
  
  // Context value
  const contextValue: DataContextType = {
    createTopic,
    updateTopic,
    deleteTopic,
    addMessage,
    deleteMessage,
    invalidateCache
  };
  
  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
};

export default DataContext; 