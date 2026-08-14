import { useState, useCallback } from 'react';
import { Message } from '../types/chat';
import { useChatHistoryStore } from '../contexts/ChatHistoryContext';

export const useMessageDeletion = (
  messages: Message[],
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  currentTopicId: number | undefined,
  startNewChat: () => void,
  setCurrentTopicId: (id: number | undefined) => void
) => {
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const store = useChatHistoryStore();

  // Handle message deletion request
  const handleDeleteMessage = useCallback((messageId: string) => {
    setMessageToDelete(messageId);
  }, []);

  // Confirm message deletion
  const confirmDeleteMessage = useCallback(async () => {
    if (!messageToDelete || !currentTopicId) return;
    
    try {
      // Find the message object in the current messages array
      const messageObj = messages.find(msg => msg.id === messageToDelete);
      if (!messageObj) return;
      
      // Log message details for debugging
      console.log('[DELETE DEBUG] Attempting to delete message:', {
        uiId: messageObj.id,
        dbId: messageObj.dbMessageId,
        isBot: messageObj.isBot,
        text: messageObj.text.substring(0, 30) + (messageObj.text.length > 30 ? '...' : '')
      });
      
      // Remove message from UI immediately to give instant feedback
      setMessages(messages.filter(msg => msg.id !== messageToDelete));
      
      // Store the current topic ID for later checking if it's deleted
      const topicToCheck = currentTopicId;
      
      // If it's a DB message (has a numeric id stored in the message object)
      if (messageObj.dbMessageId) {
        try {
          // First verify the message exists in the database
          const messageInDb = await store.getMessage(messageObj.dbMessageId);
          if (!messageInDb) {
            console.warn(`[DELETE DEBUG] Message ${messageObj.dbMessageId} not found in database`);
            setMessageToDelete(null);
            return;
          }

          console.log(`[DELETE DEBUG] Deleting message ${messageObj.dbMessageId} from database`);
          const deleteResult = await store.deleteMessage(messageObj.dbMessageId);

          if (!deleteResult) {
            console.error(`[DELETE DEBUG] Failed to delete message ${messageObj.dbMessageId} from database`);
            alert('Failed to delete message. Please try again later.');
            setMessageToDelete(null);
            return;
          }

          console.log(`[DELETE DEBUG] Message ${messageObj.dbMessageId} deleted successfully from database`);

          // Now check the message count for the topic
          const remainingMessages = await store.countMessages(topicToCheck);
          console.log(`[DELETE DEBUG] Topic ${topicToCheck} now has ${remainingMessages} messages`);

          // If no messages remain, delete the topic
          if (remainingMessages === 0) {
            console.log(`[DELETE DEBUG] No messages left in topic ${topicToCheck}, deleting topic`);
            await store.deleteTopic(topicToCheck);
            console.log(`[DELETE DEBUG] Topic ${topicToCheck} deleted successfully`);

            // Update UI state
            setCurrentTopicId(undefined);
            startNewChat();

            // Trigger topic list refresh
            if (window.triggerTopicListRefresh) {
              window.triggerTopicListRefresh();
            }
          } else {
            // Update topic count and lastActive in the database
            const topic = await store.getTopic(topicToCheck);
            if (topic) {
              await store.updateTopic(topicToCheck, {
                messageCnt: remainingMessages,
                lastActive: Date.now() // Update lastActive - deleting messages is user activity
              });
            }

            // Trigger UI updates
            if (window.updateTopicMessageCount) {
              window.updateTopicMessageCount(topicToCheck, remainingMessages);
            }

            if (window.triggerTopicListRefresh) {
              window.triggerTopicListRefresh();
            }
          }
        } catch (error) {
          console.error(`[DELETE DEBUG] Error deleting message:`, error);
          alert('Failed to delete message. Please try again later.');
        }
      }
    } finally {
      // Clear the message to delete
      setMessageToDelete(null);
    }
  }, [messageToDelete, messages, setMessages, currentTopicId, startNewChat, setCurrentTopicId, store]);

  // Cancel message deletion
  const cancelDeleteMessage = useCallback(() => {
    setMessageToDelete(null);
  }, []);

  return {
    messageToDelete,
    handleDeleteMessage,
    confirmDeleteMessage,
    cancelDeleteMessage
  };
};

export default useMessageDeletion; 