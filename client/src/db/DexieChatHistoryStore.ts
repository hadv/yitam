import db from './ChatHistoryDB';
import { tokenizeQuery } from './searchTokenizer';
import {
  advancedSearch,
  cleanupOldData,
  clearUserData,
  exportUserData,
  importUserData,
  indexMessageContent,
  reindexTopic,
  reinitializeDatabase,
} from './ChatHistoryDBUtil';
import type {
  ChatHistoryStore,
  CleanupResult,
  CountMessagesOptions,
  DatabaseStats,
  DeleteTopicResult,
  ExportBundle,
  ListMessagesOptions,
  ListTopicsOptions,
  Message,
  MessageHit,
  NewMessage,
  NewTopic,
  SearchIndexStats,
  SearchMessagesOptions,
  StorageEstimate,
  StoreStatus,
  Topic,
  Unsubscribe,
} from './ChatHistoryStore';

/** Name of the underlying IndexedDB database, needed by the raw-write fallback. */
const IDB_NAME = 'ChatHistoryDB';

/** Rough token estimate used when a caller does not supply one. */
const estimateTokens = (content: string): number => Math.ceil(content.length / 4);

const isDefined = (id: number | undefined): id is number => id !== undefined;

/**
 * Dexie/IndexedDB implementation of {@link ChatHistoryStore}.
 *
 * This is the only place in the app that knows chat history lives in Dexie. The
 * defensive machinery that used to be scattered across call sites — verified
 * deletes, verified writes, the raw-IndexedDB write fallback — lives here now, so
 * callers get the safe behaviour without having to know it exists.
 */
export class DexieChatHistoryStore implements ChatHistoryStore {
  // --- lifecycle -----------------------------------------------------------

  async open(): Promise<void> {
    if (!db.isOpen()) {
      await db.open();
    }
  }

  async close(): Promise<void> {
    db.close();
  }

  isOpen(): boolean {
    return db.isOpen();
  }

  async checkConnection(): Promise<boolean> {
    return db.checkConnection();
  }

  async reinitialize(): Promise<boolean> {
    return reinitializeDatabase();
  }

  async attemptRecovery(): Promise<boolean> {
    return db.attemptRecovery();
  }

  onStatusChange(listener: (status: StoreStatus) => void): Unsubscribe {
    // Dexie replays 'ready' for an already-open database, but on a later microtask
    // and without cancelling it on unsubscribe. Gate delivery so every
    // implementation agrees on when a subscriber learns the state and when it
    // stops hearing about it.
    let subscribed = true;
    const notify = (status: StoreStatus) => {
      if (subscribed) listener(status);
    };

    const onReady = () => notify('ready');
    const onVersionChange = () => notify('closed');

    db.on('ready', onReady);
    db.on('versionchange', onVersionChange);

    if (db.isOpen()) {
      notify('ready');
    }

    return () => {
      subscribed = false;
      db.on('ready').unsubscribe(onReady);
      db.on('versionchange').unsubscribe(onVersionChange);
    };
  }

  // --- topics --------------------------------------------------------------

  async listTopics(userId: string, opts: ListTopicsOptions = {}): Promise<Topic[]> {
    const { order = 'desc', offset = 0, limit } = opts;

    const topics = await db.topics.where('userId').equals(userId).sortBy('lastActive');
    const ordered = order === 'desc' ? topics.reverse() : topics;

    if (offset === 0 && limit === undefined) {
      return ordered;
    }
    return ordered.slice(offset, limit === undefined ? undefined : offset + limit);
  }

  async getTopic(topicId: number): Promise<Topic | undefined> {
    return db.topics.get(topicId);
  }

  async createTopic(input: NewTopic): Promise<number> {
    return db.topics.add(input as Topic);
  }

  async putTopic(topic: Topic): Promise<number> {
    return db.topics.put(topic);
  }

  async updateTopic(topicId: number, patch: Partial<Topic>): Promise<void> {
    await db.topics.update(topicId, patch);
  }

  async deleteTopic(topicId: number): Promise<DeleteTopicResult> {
    return db.deleteTopic(topicId);
  }

  async deleteTopicIfEmpty(topicId: number): Promise<boolean> {
    return db.deleteEmptyTopic(topicId);
  }

  async countTopics(userId?: string): Promise<number> {
    if (userId === undefined) {
      return db.topics.count();
    }
    return db.topics.where('userId').equals(userId).count();
  }

  async recountTopic(topicId: number): Promise<boolean> {
    return db.updateTopicMessageCount(topicId);
  }

  // --- messages ------------------------------------------------------------

  async listMessages(topicId: number, opts: ListMessagesOptions = {}): Promise<Message[]> {
    const { order = 'asc', offset = 0, limit } = opts;

    let collection = db.messages
      .where('[topicId+timestamp]')
      .between([topicId, -Infinity], [topicId, Infinity]);

    if (order === 'desc') {
      collection = collection.reverse();
    }
    if (offset > 0) {
      collection = collection.offset(offset);
    }
    if (limit !== undefined) {
      collection = collection.limit(limit);
    }

    return collection.toArray();
  }

  async listUserMessages(userId: string): Promise<Message[]> {
    const topicIds = (await db.topics.where('userId').equals(userId).toArray())
      .map(topic => topic.id)
      .filter(isDefined);

    if (topicIds.length === 0) {
      return [];
    }
    return db.messages.where('topicId').anyOf(topicIds).toArray();
  }

  async getMessage(messageId: number): Promise<Message | undefined> {
    return db.messages.get(messageId);
  }

  /**
   * Append a message and roll the topic's counters forward.
   *
   * Three tiers, tried in order: a verified transactional add, a plain add, and a
   * raw IndexedDB write that bypasses Dexie entirely. The last tier exists because
   * Dexie transactions have historically failed on some browsers (see SCHEMA.md);
   * without it a failed write silently loses the user's message.
   */
  async appendMessage(topicId: number, msg: NewMessage): Promise<number> {
    await this.open();

    const topic = await db.topics.get(topicId);
    if (!topic) {
      throw new Error(`Topic ${topicId} not found`);
    }

    const record: Message = {
      type: 'text',
      tokens: estimateTokens(msg.content),
      ...msg,
      topicId,
    };

    let messageId: number;
    try {
      messageId = await db.safeMessagesAdd(record);
    } catch (dexieError) {
      console.error('[STORE] Transactional add failed, falling back to raw IndexedDB:', dexieError);
      messageId = await this.rawAppendMessage(topicId, record);
      // The raw path updates the topic in its own transaction; nothing more to do.
      return messageId;
    }

    await this.applyMessageToTopicCounters(topic, record);

    if (record.content) {
      try {
        await indexMessageContent(record.content, topicId, messageId);
      } catch (indexError) {
        // A message that is stored but unindexed is recoverable; a lost message is not.
        console.error(`[STORE] Failed to index message ${messageId}:`, indexError);
      }
    }

    return messageId;
  }

  async putMessage(msg: Message): Promise<number> {
    return db.messages.put(msg);
  }

  async updateMessage(messageId: number, patch: Partial<Message>): Promise<void> {
    await db.messages.update(messageId, patch);
  }

  async deleteMessage(messageId: number): Promise<boolean> {
    return db.forceDeleteMessage(messageId);
  }

  async clearTopicMessages(topicId: number): Promise<void> {
    await db.transaction('rw', [db.topics, db.messages, db.wordIndex], async () => {
      const messageIds = (await db.messages.where('topicId').equals(topicId).toArray())
        .map(msg => msg.id)
        .filter(isDefined);

      await Promise.all(
        messageIds.map(messageId => db.wordIndex.where('messageId').equals(messageId).delete())
      );

      await db.messages.where('topicId').equals(topicId).delete();

      const topic = await db.topics.get(topicId);
      if (topic) {
        await db.topics.put({
          ...topic,
          messageCnt: 0,
          userMessageCnt: 0,
          assistantMessageCnt: 0,
          totalTokens: 0,
        });
      }
    });
  }

  async countMessages(topicId?: number, opts: CountMessagesOptions = {}): Promise<number> {
    if (topicId === undefined) {
      return opts.role
        ? db.messages.filter(msg => msg.role === opts.role).count()
        : db.messages.count();
    }

    const scoped = db.messages.where('topicId').equals(topicId);
    return opts.role ? scoped.and(msg => msg.role === opts.role).count() : scoped.count();
  }

  async sampleMessages(limit: number): Promise<Message[]> {
    return db.messages.limit(limit).toArray();
  }

  // --- search --------------------------------------------------------------

  async searchMessages(
    userId: string,
    query: string,
    opts: SearchMessagesOptions = {}
  ): Promise<MessageHit[]> {
    return advancedSearch(query, userId, opts.filters ?? {}, opts.limit ?? 20);
  }

  async searchMessagesInTopic(topicId: number, query: string): Promise<Message[]> {
    const words = tokenizeQuery(query);

    if (words.length === 0) {
      return [];
    }

    let matches: Message[] = [];

    await db.transaction('r', [db.wordIndex, db.messages], async () => {
      const messageIds = new Set<number>();

      for (const word of words) {
        const entries = await db.wordIndex.where('[word+topicId]').equals([word, topicId]).toArray();
        entries.forEach(entry => messageIds.add(entry.messageId));
      }

      if (messageIds.size > 0) {
        matches = await db.messages
          .where('id')
          .anyOf([...messageIds])
          .toArray();
      }
    });

    return matches.sort((a, b) => b.timestamp - a.timestamp);
  }

  async reindexTopic(topicId: number): Promise<boolean> {
    return reindexTopic(topicId);
  }

  async reindexUser(userId: string): Promise<boolean> {
    try {
      const topics = await db.topics.where('userId').equals(userId).toArray();
      if (topics.length === 0) {
        return true;
      }

      let successCount = 0;
      for (const topic of topics) {
        if (topic.id === undefined) continue;
        try {
          if (await reindexTopic(topic.id)) {
            successCount++;
          }
        } catch (error) {
          console.error(`[STORE] Error reindexing topic ${topic.id}:`, error);
        }
      }

      return successCount === topics.length;
    } catch (error) {
      console.error('[STORE] Error reindexing user messages:', error);
      return false;
    }
  }

  async getSearchIndexStats(): Promise<SearchIndexStats> {
    try {
      const totalWords = await db.wordIndex.count();
      const uniqueWords = await db.wordIndex.orderBy('word').uniqueKeys();
      const topicIds = await db.wordIndex.orderBy('topicId').uniqueKeys();
      const messageIds = await db.wordIndex.orderBy('messageId').uniqueKeys();

      return {
        totalWords,
        uniqueWords: uniqueWords.length,
        topicsCovered: topicIds.length,
        messagesCovered: messageIds.length,
      };
    } catch (error) {
      console.error('[STORE] Error getting search index stats:', error);
      return { totalWords: 0, uniqueWords: 0, topicsCovered: 0, messagesCovered: 0 };
    }
  }

  // --- maintenance ---------------------------------------------------------

  async getStorageEstimate(): Promise<StorageEstimate> {
    return db.getStorageEstimate();
  }

  async isStorageCritical(): Promise<boolean> {
    return db.isStorageCritical();
  }

  async getDatabaseStats(): Promise<DatabaseStats> {
    const [topicCount, messageCount, wordIndexCount, storage] = await Promise.all([
      db.topics.count(),
      db.messages.count(),
      db.wordIndex.count(),
      db.getStorageEstimate(),
    ]);

    const topicIds = (await db.topics.toCollection().primaryKeys()) as number[];
    const orphanedMessageCount = await db.messages
      .filter(msg => !topicIds.includes(msg.topicId))
      .count();

    let emptyTopicCount = 0;
    for (const topicId of topicIds) {
      if ((await db.messages.where('topicId').equals(topicId).count()) === 0) {
        emptyTopicCount++;
      }
    }

    return {
      topicCount,
      messageCount,
      wordIndexCount,
      orphanedMessageCount,
      emptyTopicCount,
      storage,
    };
  }

  async cleanupOrphanedData(): Promise<CleanupResult> {
    return db.cleanupOrphanedData();
  }

  async deleteOldestTopics(userId: string, keepCount: number): Promise<number> {
    const total = await db.topics.where('userId').equals(userId).count();
    if (total <= keepCount) {
      return 0;
    }

    // sortBy('lastActive') is ascending, so the head of the list is the oldest.
    const oldest = (await db.topics.where('userId').equals(userId).sortBy('lastActive'))
      .slice(0, total - keepCount)
      .map(topic => topic.id)
      .filter(isDefined);

    if (oldest.length === 0) {
      return 0;
    }

    await db.topics.bulkDelete(oldest);
    // bulkDelete leaves the topics' messages and index entries behind.
    await db.cleanupOrphanedData();

    return oldest.length;
  }

  async cleanupOldData(userId: string, keepLastN: number = 20): Promise<void> {
    return cleanupOldData(userId, keepLastN);
  }

  async exportUserData(userId: string): Promise<ExportBundle> {
    return exportUserData(userId);
  }

  async importUserData(bundle: ExportBundle, userId: string): Promise<boolean> {
    return importUserData(bundle, userId);
  }

  async clearUserData(userId: string): Promise<boolean> {
    return clearUserData(userId);
  }

  // --- internals -----------------------------------------------------------

  /** Roll a topic's cached counters forward by one message. Never throws. */
  private async applyMessageToTopicCounters(topic: Topic, message: Message): Promise<void> {
    if (topic.id === undefined) return;

    try {
      const patch: Partial<Topic> = {
        lastActive: message.timestamp,
        messageCnt: (topic.messageCnt || 0) + 1,
        ...(message.role === 'user'
          ? { userMessageCnt: (topic.userMessageCnt || 0) + 1 }
          : { assistantMessageCnt: (topic.assistantMessageCnt || 0) + 1 }),
      };

      if (message.tokens) {
        patch.totalTokens = (topic.totalTokens || 0) + message.tokens;
      }

      await db.topics.update(topic.id, patch);
    } catch (error) {
      // Counters are a cache; recountTopic() can rebuild them from the messages.
      console.error(`[STORE] Failed to update counters for topic ${topic.id}:`, error);
    }
  }

  /**
   * Write a message straight to IndexedDB, bypassing Dexie.
   *
   * Last resort for when the Dexie layer refuses a write. Updates the topic's
   * counters in the same raw fashion, since the Dexie path is evidently unusable.
   */
  private rawAppendMessage(topicId: number, message: Message): Promise<number> {
    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(IDB_NAME);

      request.onerror = event => {
        console.error('[STORE] Error opening IndexedDB directly:', event);
        reject(new Error('Failed to open IndexedDB for raw write'));
      };

      request.onsuccess = event => {
        const directDb = (event.target as IDBOpenDBRequest).result;

        try {
          const store = directDb.transaction('messages', 'readwrite').objectStore('messages');
          const addRequest = store.add({ ...message, topicId });

          addRequest.onsuccess = () => {
            const messageId = addRequest.result as number;
            console.log(`[STORE] Raw IndexedDB write succeeded for topic ${topicId}`);

            try {
              this.rawApplyTopicCounters(directDb, topicId, message);
            } catch (statsError) {
              console.error('[STORE] Error updating topic counters in raw mode:', statsError);
            }

            directDb.close();
            resolve(messageId);
          };

          addRequest.onerror = e => {
            console.error('[STORE] Error adding message directly:', e);
            directDb.close();
            reject(new Error('Raw IndexedDB write failed'));
          };
        } catch (error) {
          console.error('[STORE] Error in direct IndexedDB transaction:', error);
          directDb.close();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };
    });
  }

  private rawApplyTopicCounters(directDb: IDBDatabase, topicId: number, message: Message): void {
    const topicStore = directDb.transaction('topics', 'readwrite').objectStore('topics');
    const getRequest = topicStore.get(topicId);

    getRequest.onsuccess = () => {
      const topic = getRequest.result;
      if (!topic) return;

      topic.lastActive = message.timestamp;
      topic.messageCnt = (topic.messageCnt || 0) + 1;

      if (message.role === 'user') {
        topic.userMessageCnt = (topic.userMessageCnt || 0) + 1;
      } else {
        topic.assistantMessageCnt = (topic.assistantMessageCnt || 0) + 1;
      }

      topic.totalTokens = (topic.totalTokens || 0) + (message.tokens || 0);

      topicStore.put(topic);
    };
  }
}

/**
 * The application's chat-history store.
 *
 * React code should reach this through `useChatHistoryStore()` rather than
 * importing it, so that a test or a future engine swap only has to replace the
 * value the provider hands out.
 */
export const chatHistoryStore: ChatHistoryStore = new DexieChatHistoryStore();

export default chatHistoryStore;
