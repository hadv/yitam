import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import db, { Topic, Message } from '../db/ChatHistoryDB';
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
      const id = await db.topics.add(topic);
      
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
  }, [startLoading, stopLoading, setError, invalidateCache]);
  
  // Update a topic with optimistic updates
  const updateTopic = useCallback(async (id: number, data: Partial<Topic>): Promise<boolean> => {
    const operationKey = `update-topic-${id}`;
    startLoading(operationKey);
    
    try {
      // Get the current topic
      const topic = await db.topics.get(id);
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
      await db.topics.update(id, data);
      return true;
    } catch (error) {
      console.error(`Error updating topic ${id}:`, error);
      setError(operationKey, 'Không thể cập nhật chủ đề.');
      
      // Invalidate caches
      invalidateCache(`topic-${id}`);
      const topic = await db.topics.get(id);
      if (topic) {
        invalidateCache(`topic-list-${topic.userId}`);
      }
      
      return false;
    } finally {
      stopLoading(operationKey);
    }
  }, [startLoading, stopLoading, setError, invalidateCache, cache]);
  
  // Delete a topic with optimistic updates
  const deleteTopic = useCallback(async (id: number): Promise<boolean> => {
    const operationKey = `delete-topic-${id}`;
    startLoading(operationKey);
    
    try {
      // Get the topic first so we can update the list cache
      const topic = await db.topics.get(id);
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
      
      // Delete from database in a transaction
      await db.transaction('rw', [db.topics, db.messages], async () => {
        // Delete all messages for this topic
        await db.messages.where('topicId').equals(id).delete();
        
        // Delete the topic
        await db.topics.delete(id);
      });
      
      return true;
    } catch (error) {
      console.error(`Error deleting topic ${id}:`, error);
      setError(operationKey, 'Không thể xóa chủ đề.');
      
      // Invalidate caches to refresh from DB
      const topic = await db.topics.get(id);
      if (topic) {
        invalidateCache(`topic-list-${topic.userId}`);
      }
      
      return false;
    } finally {
      stopLoading(operationKey);
    }
  }, [startLoading, stopLoading, setError, invalidateCache, cache]);
  
  // Add a message with optimistic updates
  const addMessage = useCallback(async (message: Omit<Message, 'id'>): Promise<number | undefined> => {
    const operationKey = `add-message-${message.topicId}`;
    startLoading(operationKey);
    
    try {
      // Optimistically add to cache with temporary ID
      const tempId = -Date.now(); // Temporary negative ID
      const newMessage = { ...message, id: tempId };
      
      // Add to cache
      const cacheKey = `messages-${message.topicId}`;
      setCache(prev => ({
        ...prev,
        [cacheKey]: [...(prev[cacheKey] || []), newMessage]
      }));
      
      // Create in database
      const id = await db.messages.add(message);
      
      // Update cache with real ID
      if (id) {
        setCache(prev => {
          const messageList = prev[cacheKey] || [];
          return {
            ...prev,
            [cacheKey]: messageList.map((m: Message) => m.id === tempId ? { ...m, id } : m)
          };
        });
        
        // Update topic stats
        const topic = await db.topics.get(message.topicId);
        if (topic) {
          const updateData: Partial<Topic> = {
            messageCnt: (topic.messageCnt || 0) + 1,
            lastActive: message.timestamp // Update last active time
          };
          
          if (message.role === 'user') {
            updateData.userMessageCnt = (topic.userMessageCnt || 0) + 1;
          } else {
            updateData.assistantMessageCnt = (topic.assistantMessageCnt || 0) + 1;
          }
          
          if (message.tokens) {
            updateData.totalTokens = (topic.totalTokens || 0) + message.tokens;
          }
          
          await db.topics.update(message.topicId, updateData);
          
          // Invalidate topic cache
          invalidateCache(`topic-${message.topicId}`);
        }
      }
      
      return id;
    } catch (error) {
      console.error('Error adding message:', error);
      setError(operationKey, 'Không thể gửi tin nhắn.');
      
      // Revert optimistic update
      invalidateCache(`messages-${message.topicId}`);
      
      return undefined;
    } finally {
      stopLoading(operationKey);
    }
  }, [startLoading, stopLoading, setError, invalidateCache]);
  
  // Delete a message with optimistic updates
  const deleteMessage = useCallback(async (messageId: number, topicId: number): Promise<boolean> => {
    const operationKey = `delete-message-${messageId}`;
    startLoading(operationKey);
    
    try {
      // Get the message first so we can update topic stats
      const message = await db.messages.get(messageId);
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
      await db.messages.delete(messageId);
      
      // Update topic stats
      const topic = await db.topics.get(topicId);
      if (topic) {
        const updateData: Partial<Topic> = {
          messageCnt: Math.max((topic.messageCnt || 0) - 1, 0)
        };
        
        if (message.role === 'user') {
          updateData.userMessageCnt = Math.max((topic.userMessageCnt || 0) - 1, 0);
        } else {
          updateData.assistantMessageCnt = Math.max((topic.assistantMessageCnt || 0) - 1, 0);
        }
        
        if (message.tokens) {
          updateData.totalTokens = Math.max((topic.totalTokens || 0) - message.tokens, 0);
        }
        
        await db.topics.update(topicId, updateData);
        
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
  }, [startLoading, stopLoading, setError, invalidateCache, cache]);
  
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