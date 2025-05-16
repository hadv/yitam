import { useState, useCallback, useEffect } from 'react';
import Dexie from 'dexie';
import db, { Message } from '../db/ChatHistoryDB';
import { indexMessageContent } from '../db/ChatHistoryDBUtil';
import { useChatHistory } from '../contexts/ChatHistoryContext';

interface UseMessageManagementProps {
  topicId: number | null;
}

interface UseMessageManagementResult {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => Promise<number | undefined>;
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
      const topicMessages = await db.messages
        .where('[topicId+timestamp]')
        .between([topicId, Dexie.minKey], [topicId, Dexie.maxKey])
        .offset(offset)
        .limit(limit)
        .toArray();
      
      setMessages(topicMessages);
      return topicMessages;
    } catch (error) {
      console.error('Error loading messages:', error);
      setError('Failed to load chat messages');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [topicId, isDBReady]);
  
  /**
   * Reload messages when component mounts or topicId changes
   */
  const reloadMessages = useCallback(async () => {
    await loadMessages();
  }, [loadMessages]);
  
  /**
   * Add a new message to the current topic
   */
  const addMessage = useCallback(async (message: Omit<Message, 'id' | 'timestamp'>): Promise<number | undefined> => {
    if (!isDBReady || !topicId) {
      setError('Database not ready or no topic selected');
      return undefined;
    }
    
    try {
      // Add timestamp if not provided
      const timestamp = Date.now();
      const fullMessage: Message = {
        ...message,
        topicId,
        timestamp
      };
      
      // Transaction to add message and update topic metadata
      const messageId = await db.transaction('rw', [db.topics, db.messages, db.wordIndex], async () => {
        // Save message
        const id = await db.messages.add(fullMessage);
        
        // Update topic metadata
        const topic = await db.topics.get(topicId);
        if (topic) {
          topic.lastActive = timestamp;
          topic.messageCnt = (topic.messageCnt || 0) + 1;
          
          if (message.role === 'user') {
            topic.userMessageCnt = (topic.userMessageCnt || 0) + 1;
          } else {
            topic.assistantMessageCnt = (topic.assistantMessageCnt || 0) + 1;
          }
          
          if (message.tokens) {
            topic.totalTokens = (topic.totalTokens || 0) + message.tokens;
          }
          
          await db.topics.put(topic);
        }
        
        // Index words for search
        if (message.content) {
          await indexMessageContent(message.content, topicId, id);
        }
        
        return id;
      });
      
      // Reload messages to refresh the list
      await loadMessages();
      
      return messageId;
    } catch (error) {
      console.error('Error adding message:', error);
      setError('Failed to add message');
      return undefined;
    }
  }, [topicId, isDBReady, loadMessages]);
  
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
      const words = query.toLowerCase()
        .split(/\W+/)
        .filter(word => word.length >= 3);
      
      if (words.length === 0) {
        return [];
      }
      
      // First find matching messageIds from word index
      let matchingMessages: Message[] = [];
      
      await db.transaction('r', [db.wordIndex, db.messages], async () => {
        const messageIds = new Set<number>();
        
        // For each search word, find matching messages
        for (const word of words) {
          const entries = await db.wordIndex
            .where('[word+topicId]')
            .equals([word, topicId])
            .toArray();
          
          entries.forEach(entry => messageIds.add(entry.messageId));
        }
        
        // Fetch the actual messages
        if (messageIds.size > 0) {
          matchingMessages = await db.messages
            .where('id')
            .anyOf([...messageIds])
            .toArray();
        }
      });
      
      // Sort by timestamp (newest first)
      return matchingMessages.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Error searching messages:', error);
      setError('Search failed');
      return [];
    }
  }, [topicId, isDBReady]);
  
  /**
   * Clear all messages from the current topic
   */
  const clearMessages = useCallback(async (): Promise<boolean> => {
    if (!isDBReady || !topicId) {
      setError('Database not ready or no topic selected');
      return false;
    }
    
    try {
      await db.transaction('rw', [db.topics, db.messages, db.wordIndex], async () => {
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
        
        // Update topic metadata
        const topic = await db.topics.get(topicId);
        if (topic) {
          topic.messageCnt = 0;
          topic.userMessageCnt = 0;
          topic.assistantMessageCnt = 0;
          topic.totalTokens = 0;
          
          await db.topics.put(topic);
        }
      });
      
      // Reload messages to refresh the list
      setMessages([]);
      
      return true;
    } catch (error) {
      console.error('Error clearing messages:', error);
      setError('Failed to clear messages');
      return false;
    }
  }, [topicId, isDBReady]);
  
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