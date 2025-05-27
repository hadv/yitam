import Dexie from 'dexie';

// Define interfaces for database schema
export interface Topic {
  id?: number;
  userId: string;
  title: string;
  createdAt: number;
  lastActive: number;
  messageCnt?: number;
  userMessageCnt?: number;
  assistantMessageCnt?: number;
  totalTokens?: number;
  model?: string;
  systemPrompt?: string;
  pinnedState?: boolean;
  personaId?: string;
}

export interface Message {
  id?: number;
  topicId: number;
  timestamp: number;
  role: 'user' | 'assistant';
  content: string;
  type?: string;
  metadata?: any;
  tokens?: number;
  modelVersion?: string;
}

export interface WordIndex {
  id?: number;
  word: string;
  topicId: number;
  messageId: number;
}

// Database class definition
class ChatHistoryDB extends Dexie {
  topics: Dexie.Table<Topic, number>;
  messages: Dexie.Table<Message, number>;
  wordIndex: Dexie.Table<WordIndex, number>;

  constructor() {
    super('ChatHistoryDB');

    // Version 1 - Initial schema
    this.version(1).stores({
      topics: '++id, userId, title, lastActive',
      messages: '++id, topicId, timestamp, role, [topicId+timestamp]',
      wordIndex: '[word+topicId], word'
    });
    
    // Version 2 - Schema upgrade to fix potential issues with ID generation
    this.version(2).stores({
      topics: '++id, userId, title, lastActive',
      messages: '++id, topicId, timestamp, role, [topicId+timestamp]',
      wordIndex: '[word+topicId], word'
    }).upgrade(tx => {
      console.log('Upgrading database to version 2');
    });

    // Define table mappings
    this.topics = this.table('topics');
    this.messages = this.table('messages');
    this.wordIndex = this.table('wordIndex');

    // Add hooks for database events
    this.on('ready', () => this.onDatabaseReady());
    this.on('versionchange', () => this.onVersionChange());
    
    // Error handling on global database events
    this.on('blocked', (event) => {
      console.error('Database blocked event:', event);
    });
    
    // Add validation middleware for message creation
    this.messages.hook('creating', (primKey, obj: Message) => {
      console.log('Creating message:', JSON.stringify(obj).substring(0, 100) + '...');
      
      // Validate required fields
      if (!obj.content || !obj.topicId || !obj.timestamp) {
        console.error('Invalid message object:', JSON.stringify(obj).substring(0, 100) + '...');
        throw new Error('Missing required message fields');
      }
    });
  }

  // Lifecycle hooks
  private onDatabaseReady(): void {
    console.log('ChatHistoryDB is ready for use');
  }

  private onVersionChange(): void {
    console.log('Database version changed');
    // Close the database to avoid blocking upgrades
    this.close();
    // Reload the page to ensure clean state
    if (navigator.onLine) {
      window.location.reload();
    }
  }

  // Check database connection
  async checkConnection(): Promise<boolean> {
    try {
      // Try to access the database to verify connection
      await this.topics.toCollection().count();
      return true;
    } catch (error) {
      console.error('Database connection error:', error);
      return false;
    }
  }

  // Ensure the database is open before performing operations
  async ensureOpen(): Promise<boolean> {
    try {
      if (!this.isOpen()) {
        console.log('[DB DEBUG] Database not open, opening now');
        await this.open();
      }
      return true;
    } catch (error) {
      console.error('[DB DEBUG] Error ensuring database is open:', error);
      // Try to close and reopen as a last resort
      try {
        console.log('[DB DEBUG] Attempting to close and reopen database');
        await this.close();
        await this.open();
        return this.isOpen();
      } catch (reopenError) {
        console.error('[DB DEBUG] Failed to reopen database:', reopenError);
        return false;
      }
    }
  }
  
  // Enhanced message deletion with multiple strategies
  async forceDeleteMessage(messageId: number): Promise<boolean> {
    console.log(`[DB DEBUG] Force delete message: ${messageId}`);
    
    // Make sure DB is open
    await this.ensureOpen();
    
    try {
      // First try: Standard delete
      await this.messages.delete(messageId);
      
      // Verify deletion
      const check1 = await this.messages.get(messageId);
      if (!check1) {
        console.log(`[DB DEBUG] Message ${messageId} deleted successfully with standard delete`);
        return true;
      }
      
      console.log(`[DB DEBUG] Standard delete failed for message ${messageId}, trying where clause`);
      
      // Second try: Where clause
      await this.messages.where('id').equals(messageId).delete();
      
      // Verify again
      const check2 = await this.messages.get(messageId);
      if (!check2) {
        console.log(`[DB DEBUG] Message ${messageId} deleted successfully with where clause`);
        return true;
      }
      
      console.log(`[DB DEBUG] Where clause delete failed for message ${messageId}, trying with exclusive lock`);
      
      // Third try: With exclusive lock
      await this.transaction('rw!', this.messages, async () => {
        await this.messages.delete(messageId);
      });
      
      // Final verification
      const check3 = await this.messages.get(messageId);
      if (!check3) {
        console.log(`[DB DEBUG] Message ${messageId} deleted successfully with exclusive lock`);
        return true;
      }
      
      console.error(`[DB DEBUG] All deletion strategies failed for message ${messageId}`);
      return false;
    } catch (error) {
      console.error(`[DB DEBUG] Error in forceDeleteMessage:`, error);
      return false;
    }
  }

  // Enhanced message add with better error handling
  async safeMessagesAdd(message: Omit<Message, 'id'>): Promise<number> {
    try {
      if (!this.isOpen()) {
        await this.open();
      }
      
      // Validate required fields
      if (!message.content || !message.topicId || !message.timestamp) {
        console.error('Cannot add message with missing required fields:', 
          JSON.stringify(message).substring(0, 100) + '...');
        throw new Error('Missing required message fields');
      }
      
      // Use a transaction to ensure atomicity
      return await this.transaction('rw', this.messages, async () => {
        console.log('Starting transaction for message add');
        
        // Try to add the message
        const id = await this.messages.add(message as Message);
        
        // Verify the ID is valid
        if (!id || id <= 0) {
          console.error(`Received invalid ID from database: ${id}`);
          
          // Try an alternative approach - force an ID
          const forcedMessage = {
            ...message,
            id: Date.now() // Use timestamp as a fallback ID
          } as Message;
          
          console.log(`Trying with forced ID: ${forcedMessage.id}`);
          const forcedResult = await this.messages.put(forcedMessage);
          
          if (!forcedResult || forcedResult <= 0) {
            throw new Error(`Forced ID approach also failed: ${forcedResult}`);
          }
          
          return forcedResult;
        }
        
        // Verify the message was actually added
        const savedMessage = await this.messages.get(id);
        if (!savedMessage) {
          console.error(`Failed to verify message with ID ${id} after save`);
          throw new Error(`Message verification failed for ID ${id}`);
        }
        
        console.log(`Successfully verified message ${id} in database`);
        return id;
      });
    } catch (error) {
      console.error('Safe message add failed:', error);
      throw error;
    }
  }
  
  // Alternative message save using put instead of add
  async safePutMessage(message: Message): Promise<number> {
    try {
      console.log(`[DB DEBUG] Starting safePutMessage for ${message.role} message in topic ${message.topicId}`);
      
      if (!this.isOpen()) {
        console.log('[DB DEBUG] Database not open, attempting to open');
        await this.open();
      }
      
      // Ensure we have an ID to prevent auto-generation issues
      if (!message.id) {
        message.id = Date.now() + Math.floor(Math.random() * 1000);
        console.log(`[DB DEBUG] Assigned new ID ${message.id} to ${message.role} message`);
      }
      
      // Add tracing for message content
      console.log(`[DB DEBUG] Message details: role=${message.role}, topicId=${message.topicId}, content length=${message.content.length}, id=${message.id}`);
      
      // Verify that topic exists
      const topic = await this.topics.get(message.topicId);
      if (!topic) {
        console.error(`[DB DEBUG] Topic ${message.topicId} does not exist for ${message.role} message`);
        throw new Error(`Topic ${message.topicId} not found`);
      }
      console.log(`[DB DEBUG] Verified topic ${message.topicId} exists`);
      
      // Use put instead of add
      console.log(`[DB DEBUG] Using put for ${message.role} message with ID ${message.id}`);
      const id = await this.messages.put(message);
      
      if (!id || id <= 0) {
        console.error(`[DB DEBUG] Invalid message ID after put: ${id}`);
        throw new Error(`Invalid message ID after put: ${id}`);
      }
      
      console.log(`[DB DEBUG] Successfully saved ${message.role} message with ID ${id}`);
      
      // Verify message was saved
      const savedMessage = await this.messages.get(id);
      if (!savedMessage) {
        console.error(`[DB DEBUG] Failed to verify message with ID ${id} after put`);
        throw new Error(`Message verification failed for ID ${id} after put`);
      }
      
      console.log(`[DB DEBUG] Verified message was saved: ID=${id}, role=${savedMessage.role}, content length=${savedMessage.content.length}`);
      
      // Update topic statistics as well
      try {
        const updateData: Partial<Topic> = {
          lastActive: Date.now(),
          messageCnt: (topic.messageCnt || 0) + 1
        };
        
        // Update user or assistant message count based on the role
        if (message.role === 'user') {
          updateData.userMessageCnt = (topic.userMessageCnt || 0) + 1;
        } else if (message.role === 'assistant') {
          updateData.assistantMessageCnt = (topic.assistantMessageCnt || 0) + 1;
        }
        
        // Update token count if available
        if (message.tokens) {
          updateData.totalTokens = (topic.totalTokens || 0) + message.tokens;
        }
        
        await this.topics.update(message.topicId, updateData);
        console.log(`[DB DEBUG] Updated topic stats for topic ${message.topicId}, role=${message.role}`);
      } catch (statsError) {
        console.error('[DB DEBUG] Error updating topic stats:', statsError);
      }
      
      return id;
    } catch (error) {
      console.error('[DB DEBUG] Error in safePutMessage:', error);
      throw error;
    }
  }

  // Database quota and storage management
  async getStorageEstimate(): Promise<{ usage: number; quota: number; percentage: number }> {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 0;
        const percentage = quota > 0 ? (usage / quota) * 100 : 0;
        
        return { usage, quota, percentage };
      } catch (error) {
        console.error('Failed to get storage estimate:', error);
        return { usage: 0, quota: 0, percentage: 0 };
      }
    }
    return { usage: 0, quota: 0, percentage: 0 };
  }

  // Check if we're approaching storage limits
  async isStorageCritical(): Promise<boolean> {
    const { percentage } = await this.getStorageEstimate();
    // Consider critical if using more than 90% of available storage
    return percentage > 90;
  }

  // Database error recovery
  async attemptRecovery(): Promise<boolean> {
    try {
      // Close the current instance
      this.close();
      
      // Attempt to reopen the database
      await Dexie.delete('ChatHistoryDB');
      
      // Reinitialize the database
      // This is a last resort and will lose data
      this.version(1).stores({
        topics: '++id, userId, title, lastActive',
        messages: '++id, topicId, timestamp, role, [topicId+timestamp]',
        wordIndex: '[word+topicId], word'
      });
      
      await this.open();
      return true;
    } catch (error) {
      console.error('Database recovery failed:', error);
      return false;
    }
  }
  
  // Reset database
  async resetDatabase(): Promise<boolean> {
    try {
      console.log('Resetting database...');
      
      // Close and delete current database
      this.close();
      await Dexie.delete('ChatHistoryDB');
      
      // Create a new database with latest schema
      const newDb = new Dexie('ChatHistoryDB');
      newDb.version(2).stores({
        topics: '++id, userId, title, lastActive',
        messages: '++id, topicId, timestamp, role, [topicId+timestamp]',
        wordIndex: '[word+topicId], word'
      });
      
      await newDb.open();
      console.log('Database reset complete');
      
      // Reload the application to ensure clean state
      if (navigator.onLine) {
        window.location.reload();
      }
      
      return true;
    } catch (error) {
      console.error('Database reset failed:', error);
      return false;
    }
  }

  // Check if a topic is empty (has EXACTLY 0 messages)
  async isTopicEmpty(topicId: number): Promise<boolean> {
    try {
      await this.ensureOpen();
      
      // Check if the topic exists
      const topic = await this.topics.get(topicId);
      if (!topic) {
        console.log(`[DB DEBUG] Topic ${topicId} does not exist, considering it empty`);
        return true;
      }
      
      // Count messages for this topic
      const messageCount = await this.messages.where('topicId').equals(topicId).count();
      console.log(`[DB DEBUG] Topic ${topicId} has ${messageCount} messages`);
      
      // Only consider a topic empty if it has EXACTLY 0 messages
      return messageCount === 0;
    } catch (error) {
      console.error(`[DB DEBUG] Error checking if topic ${topicId} is empty:`, error);
      return false; // Default to not empty on error to prevent accidental deletion
    }
  }
  
  // Delete an empty topic - only if it has EXACTLY 0 messages
  async deleteEmptyTopic(topicId: number): Promise<boolean> {
    try {
      await this.ensureOpen();
      
      // First check if it's empty
      const isEmpty = await this.isTopicEmpty(topicId);
      if (!isEmpty) {
        console.log(`[DB DEBUG] Topic ${topicId} is not empty (has at least 1 message), not deleting`);
        return false;
      }
      
      // Use a transaction to delete the topic (no need to delete messages, there are none)
      await this.transaction('rw', [this.topics], async () => {
        // Delete the topic
        await this.topics.delete(topicId);
        console.log(`[DB DEBUG] Deleted empty topic ${topicId}`);
      });
      
      return true;
    } catch (error) {
      console.error(`[DB DEBUG] Error deleting empty topic ${topicId}:`, error);
      return false;
    }
  }

  /**
   * Update a topic's message count directly with accurate counts from the database
   * @param topicId The ID of the topic to update
   * @returns True if the update was successful
   */
  async updateTopicMessageCount(topicId: number): Promise<boolean> {
    try {
      console.log(`[DB] Updating message count for topic ${topicId}`);
      
      // Ensure the database is open
      await this.ensureOpen();
      
      // Verify the topic exists
      const topic = await this.topics.get(topicId);
      if (!topic) {
        console.error(`[DB] Topic ${topicId} not found, cannot update message count`);
        return false;
      }
      
      // Get accurate counts directly from database
      const actualMessageCount = await this.messages.where('topicId').equals(topicId).count();
      const actualUserCount = await this.messages.where('topicId').equals(topicId).and(msg => msg.role === 'user').count();
      const actualAssistantCount = await this.messages.where('topicId').equals(topicId).and(msg => msg.role === 'assistant').count();
      
      console.log(`[DB] Topic ${topicId} actual counts: total=${actualMessageCount}, user=${actualUserCount}, assistant=${actualAssistantCount}`);
      
      // If the topic has no messages, consider deleting it
      if (actualMessageCount === 0) {
        console.log(`[DB] Topic ${topicId} has no messages, deleting`);
        await this.topics.delete(topicId);
        return true;
      }
      
      // Update the topic with accurate counts
      await this.topics.update(topicId, {
        messageCnt: actualMessageCount,
        userMessageCnt: actualUserCount, 
        assistantMessageCnt: actualAssistantCount,
        lastActive: Date.now()
      });
      
      console.log(`[DB] Topic ${topicId} message count updated successfully`);
      return true;
    } catch (error) {
      console.error(`[DB] Error updating topic message count for ${topicId}:`, error);
      return false;
    }
  }

  /**
   * Clean up orphaned messages and empty topics
   * @returns Object with counts of deleted items
   */
  async cleanupOrphanedData(): Promise<{ deletedTopics: number, deletedMessages: number }> {
    try {
      console.log('[DB] Starting database cleanup');
      
      // Ensure the database is open
      await this.ensureOpen();
      
      // 1. Find and delete empty topics (topics with no messages)
      const emptyTopicIds: number[] = [];
      
      // Get all topics
      const allTopics = await this.topics.toArray();
      console.log(`[DB] Checking ${allTopics.length} topics for emptiness`);
      
      // Check each topic to see if it has messages
      for (const topic of allTopics) {
        if (!topic.id) continue;
        
        const messageCount = await this.messages.where('topicId').equals(topic.id).count();
        
        if (messageCount === 0) {
          console.log(`[DB] Topic ${topic.id} (${topic.title}) is empty, marking for deletion`);
          emptyTopicIds.push(topic.id);
        }
      }
      
      // Delete empty topics
      let deletedTopics = 0;
      for (const topicId of emptyTopicIds) {
        await this.topics.delete(topicId);
        deletedTopics++;
        console.log(`[DB] Deleted empty topic ${topicId}`);
      }
      
      // 2. Update all topic message counts to ensure they're accurate
      const remainingTopics = await this.topics.toArray();
      console.log(`[DB] Updating message counts for ${remainingTopics.length} remaining topics`);
      
      for (const topic of remainingTopics) {
        if (!topic.id) continue;
        
        await this.updateTopicMessageCount(topic.id);
      }
      
      console.log(`[DB] Database cleanup complete: deleted ${deletedTopics} empty topics`);
      return { deletedTopics, deletedMessages: 0 };
    } catch (error) {
      console.error(`[DB] Error during database cleanup:`, error);
      return { deletedTopics: 0, deletedMessages: 0 };
    }
  }
}

// Create a singleton instance
const db = new ChatHistoryDB();

export default db; 