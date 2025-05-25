import db from './ChatHistoryDB';

/**
 * Enhanced database helper functions for direct database access and emergency saves
 */

// Function to force save a message with minimal dependencies
export async function forceSaveMessage(
  userId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<boolean> {
  try {
    console.log(`[DB UTIL] Force-saving ${role} message, content length: ${content.length}`);
    
    // First ensure database is open
    if (!db.isOpen()) {
      await db.open();
    }
    
    // First try to get an existing topic
    const topics = await db.topics
      .where('userId')
      .equals(userId)
      .reverse()
      .sortBy('lastActive');
    
    let topicId: number;
    
    if (topics && topics.length > 0) {
      // Use the most recent topic
      topicId = topics[0].id!;
      console.log(`[DB UTIL] Using existing topic ${topicId}`);
    } else {
      // Create a new topic
      console.log(`[DB UTIL] Creating new topic for force save`);
      const timestamp = Date.now();
      topicId = await db.topics.add({
        userId,
        title: "New Conversation",
        createdAt: timestamp,
        lastActive: timestamp,
        messageCnt: 0,
        userMessageCnt: 0,
        assistantMessageCnt: 0,
        totalTokens: 0,
        model: 'claude-3',
        systemPrompt: '',
        pinnedState: false
      });
    }
    
    // Now add the message
    const messageId = await db.messages.add({
      topicId,
      timestamp: Date.now(),
      role,
      content,
      type: 'text',
      tokens: Math.ceil(content.length / 4)
    });
    
    console.log(`[DB UTIL] Force-saved message with ID ${messageId}`);
    
    // Update topic stats
    const topic = await db.topics.get(topicId);
    if (topic) {
      await db.topics.update(topicId, {
        lastActive: Date.now(),
        messageCnt: (topic.messageCnt || 0) + 1,
        ...(role === 'user' 
          ? { userMessageCnt: (topic.userMessageCnt || 0) + 1 }
          : { assistantMessageCnt: (topic.assistantMessageCnt || 0) + 1 }),
        totalTokens: (topic.totalTokens || 0) + Math.ceil(content.length / 4)
      });
    }
    
    return true;
  } catch (error) {
    console.error(`[DB UTIL] Error in force save:`, error);
    return false;
  }
}

// Enhanced direct database write with better error handling
export async function enhancedDirectDBWrite(
  topicId: number,
  message: {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }
): Promise<boolean> {
  try {
    console.log(`[DB UTIL] Starting enhanced direct write for ${message.role} message in topic ${topicId}`);
    
    // First check if database is open
    if (!db.isOpen()) {
      console.log('[DB UTIL] Database not open, opening now');
      await db.open();
    }
    
    // Check if topic exists
    const topic = await db.topics.get(topicId);
    if (!topic) {
      console.error(`[DB UTIL] Topic ${topicId} not found for direct write`);
      return false;
    }
    
    // Try both methods: direct IndexedDB and Dexie API
    try {
      // Method 1: Using Dexie API
      // Create message record
      const messageData = {
        topicId,
        timestamp: message.timestamp,
        role: message.role,
        content: message.content,
        type: 'text',
        tokens: Math.ceil(message.content.length / 4)
      };
      
      // Add message directly
      const messageId = await db.messages.add(messageData);
      console.log(`[DB UTIL] Added ${message.role} message with ID ${messageId} using Dexie API`);
      
      // Update topic statistics
      await db.topics.update(topicId, {
        lastActive: message.timestamp,
        messageCnt: (topic.messageCnt || 0) + 1,
        ...(message.role === 'user' 
          ? { userMessageCnt: (topic.userMessageCnt || 0) + 1 }
          : { assistantMessageCnt: (topic.assistantMessageCnt || 0) + 1 }),
        totalTokens: (topic.totalTokens || 0) + Math.ceil(message.content.length / 4)
      });
      
      console.log(`[DB UTIL] Updated topic ${topicId} statistics for ${message.role} message`);
      return true;
    } catch (dexieError) {
      console.error(`[DB UTIL] Dexie API error:`, dexieError);
      
      // Method 2: Fallback to direct IndexedDB
      console.log(`[DB UTIL] Attempting direct IndexedDB write as fallback`);
      
      // Open the database directly
      const dbName = "ChatHistoryDB";
      const request = window.indexedDB.open(dbName);
      
      return new Promise((resolve) => {
        request.onerror = (event) => {
          console.error("[DB UTIL] Error opening IndexedDB directly:", event);
          resolve(false);
        };
        
        request.onsuccess = (event) => {
          const directDb = (event.target as IDBOpenDBRequest).result;
          try {
            const tx = directDb.transaction("messages", "readwrite");
            const store = tx.objectStore("messages");
            
            const messageToAdd = {
              topicId,
              role: message.role,
              content: message.content,
              timestamp: message.timestamp,
              type: "text",
              tokens: Math.ceil(message.content.length / 4)
            };
            
            const addRequest = store.add(messageToAdd);
            
            addRequest.onsuccess = () => {
              console.log(`[DB UTIL] Successfully wrote message directly to IndexedDB for topic ${topicId}`);
              
              // Try to update topic stats
              try {
                const topicTx = directDb.transaction("topics", "readwrite");
                const topicStore = topicTx.objectStore("topics");
                
                // Get current topic
                const getRequest = topicStore.get(topicId);
                getRequest.onsuccess = () => {
                  const currentTopic = getRequest.result;
                  if (currentTopic) {
                    // Update stats
                    currentTopic.lastActive = message.timestamp;
                    currentTopic.messageCnt = (currentTopic.messageCnt || 0) + 1;
                    
                    if (message.role === 'user') {
                      currentTopic.userMessageCnt = (currentTopic.userMessageCnt || 0) + 1;
                    } else {
                      currentTopic.assistantMessageCnt = (currentTopic.assistantMessageCnt || 0) + 1;
                    }
                    
                    currentTopic.totalTokens = (currentTopic.totalTokens || 0) + Math.ceil(message.content.length / 4);
                    
                    // Put updated topic
                    topicStore.put(currentTopic);
                  }
                };
              } catch (statsError) {
                console.error("[DB UTIL] Error updating topic stats in direct mode:", statsError);
              }
              
              directDb.close();
              resolve(true);
            };
            
            addRequest.onerror = (e) => {
              console.error("[DB UTIL] Error adding message directly:", e);
              directDb.close();
              resolve(false);
            };
          } catch (error) {
            console.error("[DB UTIL] Error in direct IndexedDB transaction:", error);
            directDb.close();
            resolve(false);
          }
        };
      });
    }
  } catch (error) {
    console.error(`[DB UTIL] Error in enhanced direct database write:`, error);
    return false;
  }
} 