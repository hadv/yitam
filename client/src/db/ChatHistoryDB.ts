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

    this.version(1).stores({
      topics: '++id, userId, title, lastActive',
      messages: '++id, topicId, timestamp, role, [topicId+timestamp]',
      wordIndex: '[word+topicId], word'
    });

    // Define table mappings
    this.topics = this.table('topics');
    this.messages = this.table('messages');
    this.wordIndex = this.table('wordIndex');

    // Add hooks for database events
    this.on('ready', () => this.onDatabaseReady());
    this.on('versionchange', () => this.onVersionChange());
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
}

// Create a singleton instance
const db = new ChatHistoryDB();

export default db; 