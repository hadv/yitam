import { useEffect } from 'react';
import { setupWindowDebugFunctions } from '../utils/debugging';
import { extractTitleFromBotText } from '../utils/titleExtraction';
import { useChatHistoryStore } from '../contexts/ChatHistoryContext';

export const useDebugFunctions = (
  getCurrentPersonaId: () => string | undefined,
  absoluteForcePersona: (personaId: string) => void,
  user: { email: string } | null
) => {
  const store = useChatHistoryStore();

  useEffect(() => {
    // Type cast getCurrentPersonaId to match expected signature in setupWindowDebugFunctions
    const getPersonaIdForDebug = (() => getCurrentPersonaId() || '') as () => string;
    
    const cleanup = setupWindowDebugFunctions(
      getPersonaIdForDebug,
      absoluteForcePersona,
      undefined, // debugPersonaSystem
      undefined, // checkTopicPersonaConsistency
      undefined, // fixTopicPersonas
      async (topicId: number) => {
        try {
          console.log(`[EXPORT DEBUG] Exporting topic ${topicId}`);
          
          // Get the topic
          const topic = await store.getTopic(topicId);
          if (!topic) {
            console.error(`[EXPORT DEBUG] Topic ${topicId} not found`);
            return { success: false, error: 'Topic not found' };
          }

          // Get all messages for this topic
          const messages = await store.listMessages(topicId);
          
          // Create export data
          const exportData = {
            topics: [topic],
            messages: messages
          };
          
          // Create a download link
          const dataStr = JSON.stringify(exportData, null, 2);
          const dataBlob = new Blob([dataStr], { type: 'application/json' });
          const url = URL.createObjectURL(dataBlob);
          
          // Create filename with topic title and date
          const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
          const safeTitle = topic.title.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
          const filename = `yitam_${safeTitle}_${date}.json`;
          
          // Create and click a download link
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          
          // Clean up
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 100);
          
          return { success: true, topic, messageCount: messages.length };
        } catch (error) {
          console.error('[EXPORT DEBUG] Error exporting topic:', error);
          return { success: false, error };
        }
      },
      (text: string) => extractTitleFromBotText(text)
    );

    // Add a helper function to trigger topic refresh via event
    window.triggerTopicListRefresh = () => {
      console.log('[APP] Triggering topic list refresh via event');
      // First try the regular refreshTopicList function if available
      if (window.refreshTopicList && typeof window.refreshTopicList === 'function') {
        window.refreshTopicList();
      }
      
      // Also dispatch a custom event for components that listen for it
      window.dispatchEvent(new Event('storage:refreshTopics'));
    };

    // The index-poking helpers that used to live here (reindexAllMessages,
    // reindexCurrentTopic, getSearchStats) are gone: the store keeps its own
    // index in repair, and a different engine may not have one to inspect.
    window.searchMessages = async (query: string, filters = {}) => {
      if (!user || !user.email) {
        console.warn('[SEARCH DEBUG] No user to search for');
        return [];
      }
      console.log(`[SEARCH DEBUG] Searching for "${query}" with filters:`, filters);
      return await store.searchMessages(user.email, query, { filters });
    };
    
    return () => {
      cleanup();
      delete window.triggerTopicListRefresh;
      delete window.searchMessages;
    };
  }, [getCurrentPersonaId, absoluteForcePersona, user, store]);
};

export default useDebugFunctions; 