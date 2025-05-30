import { useState, useCallback } from 'react';
import { Message } from '../types/chat';
import db from '../db/ChatHistoryDB';

export const useMessageDeletion = (
  messages: Message[],
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  currentTopicId: number | undefined,
  startNewChat: () => void,
  setCurrentTopicId: (id: number | undefined) => void
) => {
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);

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
          const messageInDb = await db.messages.get(messageObj.dbMessageId);
          if (!messageInDb) {
            console.warn(`[DELETE DEBUG] Message ${messageObj.dbMessageId} not found in database`);
            setMessageToDelete(null);
            return;
          }
          
          // Delete from database using direct database deletion for reliability
          console.log(`[DELETE DEBUG] Forcefully deleting message ${messageObj.dbMessageId} from database`);
          const deleteResult = await db.forceDeleteMessage(messageObj.dbMessageId);
          
          if (!deleteResult) {
            console.error(`[DELETE DEBUG] Failed to delete message ${messageObj.dbMessageId} from database`);
            alert('Failed to delete message. Please try again later.');
            setMessageToDelete(null);
            return;
          }
          
          console.log(`[DELETE DEBUG] Message ${messageObj.dbMessageId} deleted successfully from database`);
          
          // Double-check message was actually deleted
          const verifyDeleted = await db.messages.get(messageObj.dbMessageId);
          if (verifyDeleted) {
            console.error(`[DELETE DEBUG] Critical error: Message ${messageObj.dbMessageId} still exists in database after deletion`);
            // Try one more time with direct table access
            await db.messages.where('id').equals(messageObj.dbMessageId).delete();
            
            // Check again
            const secondCheck = await db.messages.get(messageObj.dbMessageId);
            if (secondCheck) {
              console.error(`[DELETE DEBUG] Fatal error: Message ${messageObj.dbMessageId} cannot be deleted`);
              alert('Failed to delete message. Please try again later.');
              setMessageToDelete(null);
              return;
            }
          }
          
          // Now check the message count for the topic
          const remainingMessages = await db.messages.where('topicId').equals(topicToCheck).count();
          console.log(`[DELETE DEBUG] Topic ${topicToCheck} now has ${remainingMessages} messages`);
          
          // If no messages remain, delete the topic
          if (remainingMessages === 0) {
            console.log(`[DELETE DEBUG] No messages left in topic ${topicToCheck}, deleting topic`);
            await db.deleteTopic(topicToCheck);
            console.log(`[DELETE DEBUG] Topic ${topicToCheck} deleted successfully`);
            
            // Update UI state
            setCurrentTopicId(undefined);
            startNewChat();
            
            // Trigger topic list refresh
            if (window.triggerTopicListRefresh) {
              window.triggerTopicListRefresh();
            }
          } else {
            // Update topic count in the database
            await db.updateTopicMessageCount(topicToCheck);
            
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
  }, [messageToDelete, messages, setMessages, currentTopicId, startNewChat, setCurrentTopicId]);

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