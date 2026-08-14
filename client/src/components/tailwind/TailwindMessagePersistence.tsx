import React from 'react';
import type { Message } from '../../db';
import { useChatHistoryStore } from '../../contexts/ChatHistoryContext';

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
  const store = useChatHistoryStore();

  // Save a single message. The store handles topic counters, indexing, and the
  // write fallbacks that used to be spelled out here.
  const saveMessage = async (topicId: number, message: Omit<Message, 'id' | 'topicId'>): Promise<number> => {
    console.log(`[MSG_PERSIST] Saving message for topic ${topicId}, role: ${message.role}, content length: ${message.content.length}`);

    try {
      // A message whose topic has gone missing would be unreachable; recreate a
      // placeholder topic so the content is not lost.
      const topic = await store.getTopic(topicId);
      if (!topic) {
        console.error(`[MSG_PERSIST] Topic ${topicId} does not exist, attempting to recreate it`);
        try {
          await store.putTopic({
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

      const messageId = await store.appendMessage(topicId, message);
      console.log(`[MSG_PERSIST] Message saved with ID ${messageId}`);
      return messageId;
    } catch (error) {
      console.error('[MSG_PERSIST] Error saving message:', error);
      return -1;
    }
  };

  // Save multiple messages at once
  const saveMessageBatch = async (
    topicId: number,
    messages: Omit<Message, 'id' | 'topicId'>[]
  ): Promise<number[]> => {
    try {
      const messageIds: number[] = [];
      for (const message of messages) {
        messageIds.push(await store.appendMessage(topicId, message));
      }
      return messageIds;
    } catch (error) {
      console.error('Error saving message batch:', error);
      return [];
    }
  };

  // Delete a message, and the topic too if that was its last message
  const deleteMessage = async (messageId: number, topicId: number): Promise<void> => {
    try {
      console.log(`[DELETE DEBUG] Starting deletion process for message ID ${messageId} from topic ${topicId}`);

      const topic = await store.getTopic(topicId);
      if (!topic) {
        console.log(`[DELETE DEBUG] Topic ${topicId} does not exist, nothing to delete`);
        return;
      }

      const message = await store.getMessage(messageId);
      if (!message) {
        console.log(`[DELETE DEBUG] Message ID ${messageId} not found in database, nothing to delete`);
        return;
      }

      const deleteSuccess = await store.deleteMessage(messageId);
      if (!deleteSuccess) {
        throw new Error(`Unable to delete message ${messageId} using all available strategies`);
      }

      console.log(`[DELETE DEBUG] Successfully deleted message ${messageId}`);

      // A topic with no messages left has nothing to show, so drop it
      const remaining = await store.countMessages(topicId);
      if (remaining === 0) {
        console.log(`[DELETE DEBUG] Topic ${topicId} is now empty, deleting topic`);
        await store.deleteTopic(topicId);
      } else {
        await store.recountTopic(topicId);
      }

      // Fire the custom refresh event to update UI
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('storage:refreshTopics'));
      }
    } catch (error) {
      console.error(`[DELETE DEBUG] Error deleting message ${messageId}:`, error);
      throw error; // Re-throw to allow proper handling in UI
    }
  };

  // Recompute a topic's counters from the messages actually stored
  const updateTopicStats = async (topicId: number): Promise<void> => {
    try {
      await store.recountTopic(topicId);
    } catch (error) {
      console.error('[STATS DEBUG] Error updating topic stats:', error);
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
