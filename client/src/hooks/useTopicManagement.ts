import { useState, useCallback, useEffect } from 'react';
import type { Topic } from '../db';
import { useChatHistory, useChatHistoryStore } from '../contexts/ChatHistoryContext';
import { config } from '../config';

interface UseTopicManagementProps {
  userId: string;
}

interface UseTopicManagementResult {
  topics: Topic[];
  isLoading: boolean;
  error: string | null;
  createTopic: (title: string, systemPrompt?: string) => Promise<number | undefined>;
  updateTopic: (topicId: number, updates: Partial<Topic>) => Promise<boolean>;
  deleteTopic: (topicId: number) => Promise<boolean>;
  reloadTopics: () => Promise<void>;
  cleanupStorage: () => Promise<void>;
}

/**
 * Hook for managing chat topics
 */
export const useTopicManagement = ({ userId }: UseTopicManagementProps): UseTopicManagementResult => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { isDBReady } = useChatHistory();
  const store = useChatHistoryStore();

  /**
   * Load topics for the current user
   */
  const loadTopics = useCallback(async () => {
    if (!isDBReady || !userId) {
      setTopics([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Topics come back newest-active first
      setTopics(await store.listTopics(userId));
    } catch (error) {
      console.error('Error loading topics:', error);
      setError('Failed to load chat topics');
    } finally {
      setIsLoading(false);
    }
  }, [userId, isDBReady, store]);

  /**
   * Load topics when component mounts or userId changes
   */
  const reloadTopics = useCallback(async () => {
    await loadTopics();
  }, [loadTopics]);

  /**
   * Create a new topic
   */
  const createTopic = useCallback(async (title: string, systemPrompt?: string): Promise<number | undefined> => {
    if (!isDBReady || !userId) {
      setError('Database not ready');
      return undefined;
    }

    try {
      const now = Date.now();
      const topicId = await store.createTopic({
        userId,
        title,
        createdAt: now,
        lastActive: now,
        messageCnt: 0,
        userMessageCnt: 0,
        assistantMessageCnt: 0,
        totalTokens: 0,
        model: config.model.default,
        systemPrompt: systemPrompt || '',
        pinnedState: false
      });
      
      // Reload topics to refresh the list
      await loadTopics();
      
      return topicId;
    } catch (error) {
      console.error('Error creating topic:', error);
      setError('Failed to create new topic');
      return undefined;
    }
  }, [userId, isDBReady, loadTopics, store]);

  /**
   * Update an existing topic
   */
  const updateTopic = useCallback(async (topicId: number, updates: Partial<Topic>): Promise<boolean> => {
    if (!isDBReady) {
      setError('Database not ready');
      return false;
    }

    try {
      // Get current topic
      const topic = await store.getTopic(topicId);

      if (!topic) {
        throw new Error('Topic not found');
      }

      // Check if this topic belongs to the current user
      if (topic.userId !== userId) {
        throw new Error('Unauthorized access to topic');
      }

      // Update the topic
      await store.updateTopic(topicId, updates);

      // Reload topics to refresh the list
      await loadTopics();

      return true;
    } catch (error) {
      console.error('Error updating topic:', error);
      setError('Failed to update topic');
      return false;
    }
  }, [userId, isDBReady, loadTopics, store]);

  /**
   * Delete a topic and all associated messages
   */
  const deleteTopic = useCallback(async (topicId: number): Promise<boolean> => {
    if (!isDBReady) {
      setError('Database not ready');
      return false;
    }

    try {
      // Get current topic
      const topic = await store.getTopic(topicId);

      if (!topic) {
        throw new Error('Topic not found');
      }

      // Check if this topic belongs to the current user
      if (topic.userId !== userId) {
        throw new Error('Unauthorized access to topic');
      }

      // Cascades to the topic's messages and word index entries
      await store.deleteTopic(topicId);

      // Reload topics to refresh the list
      await loadTopics();

      return true;
    } catch (error) {
      console.error('Error deleting topic:', error);
      setError('Failed to delete topic');
      return false;
    }
  }, [userId, isDBReady, loadTopics, store]);

  /**
   * Clean up old data if storage is approaching limits
   */
  const cleanupStorage = useCallback(async () => {
    if (!isDBReady || !userId) {
      return;
    }

    try {
      await store.cleanupOldData(userId);
      // Reload topics to refresh the list
      await loadTopics();
    } catch (error) {
      console.error('Error cleaning up storage:', error);
      setError('Failed to clean up storage');
    }
  }, [userId, isDBReady, loadTopics, store]);

  // Load topics on initial render
  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  return {
    topics,
    isLoading,
    error,
    createTopic,
    updateTopic,
    deleteTopic,
    reloadTopics,
    cleanupStorage
  };
};

export default useTopicManagement; 