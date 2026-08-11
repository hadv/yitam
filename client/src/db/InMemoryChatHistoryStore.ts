import { tokenizeForIndex, tokenizeQuery } from './searchTokenizer';
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
  WordIndex,
} from './ChatHistoryStore';

const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

const estimateTokens = (content: string): number => Math.ceil(content.length / 4);

const isDefined = (id: number | undefined): id is number => id !== undefined;

/**
 * An in-memory {@link ChatHistoryStore}.
 *
 * Its reason to exist is testability: anything that reads or writes chat history
 * can be exercised against this without a browser or an IndexedDB. It passes the
 * same contract suite as {@link DexieChatHistoryStore}, which is what makes it a
 * trustworthy stand-in rather than an approximation.
 *
 * Records are cloned on the way in and out, so callers cannot mutate stored state
 * by holding on to a returned object — matching what a real database gives you.
 */
export class InMemoryChatHistoryStore implements ChatHistoryStore {
  private topics = new Map<number, Topic>();
  private messages = new Map<number, Message>();
  private index: WordIndex[] = [];

  private nextTopicId = 1;
  private nextMessageId = 1;
  private nextIndexId = 1;

  private open_ = true;
  private listeners = new Set<(status: StoreStatus) => void>();

  // --- lifecycle -----------------------------------------------------------

  async open(): Promise<void> {
    if (!this.open_) {
      this.open_ = true;
      this.emit('ready');
    }
  }

  async close(): Promise<void> {
    if (this.open_) {
      this.open_ = false;
      this.emit('closed');
    }
  }

  isOpen(): boolean {
    return this.open_;
  }

  async checkConnection(): Promise<boolean> {
    return this.open_;
  }

  async reinitialize(): Promise<boolean> {
    await this.close();
    await this.open();
    return true;
  }

  async attemptRecovery(): Promise<boolean> {
    this.topics.clear();
    this.messages.clear();
    this.index = [];
    this.nextTopicId = 1;
    this.nextMessageId = 1;
    this.nextIndexId = 1;
    await this.open();
    return true;
  }

  onStatusChange(listener: (status: StoreStatus) => void): Unsubscribe {
    this.listeners.add(listener);

    // Report the current state straight away, so a subscriber never has to guess
    // whether it missed the transition that already happened.
    if (this.open_) {
      listener('ready');
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(status: StoreStatus): void {
    this.listeners.forEach(listener => listener(status));
  }

  // --- topics --------------------------------------------------------------

  async listTopics(userId: string, opts: ListTopicsOptions = {}): Promise<Topic[]> {
    const { order = 'desc', offset = 0, limit } = opts;

    const sorted = [...this.topics.values()]
      .filter(topic => topic.userId === userId)
      .sort((a, b) => (order === 'desc' ? b.lastActive - a.lastActive : a.lastActive - b.lastActive));

    const page = sorted.slice(offset, limit === undefined ? undefined : offset + limit);
    return page.map(clone);
  }

  async getTopic(topicId: number): Promise<Topic | undefined> {
    return clone(this.topics.get(topicId));
  }

  async createTopic(input: NewTopic): Promise<number> {
    const id = this.nextTopicId++;
    this.topics.set(id, { ...clone(input), id });
    return id;
  }

  async putTopic(topic: Topic): Promise<number> {
    const id = topic.id ?? this.nextTopicId++;
    this.nextTopicId = Math.max(this.nextTopicId, id + 1);
    this.topics.set(id, { ...clone(topic), id });
    return id;
  }

  async updateTopic(topicId: number, patch: Partial<Topic>): Promise<void> {
    const topic = this.topics.get(topicId);
    if (!topic) return;
    this.topics.set(topicId, { ...topic, ...clone(patch), id: topicId });
  }

  async deleteTopic(topicId: number): Promise<DeleteTopicResult> {
    if (!this.topics.has(topicId)) {
      return { success: false, deletedMessages: 0, deletedIndices: 0 };
    }

    const messageIds = [...this.messages.values()]
      .filter(msg => msg.topicId === topicId)
      .map(msg => msg.id)
      .filter(isDefined);

    const indicesBefore = this.index.length;
    this.index = this.index.filter(entry => entry.topicId !== topicId);
    messageIds.forEach(id => this.messages.delete(id));
    this.topics.delete(topicId);

    return {
      success: true,
      deletedMessages: messageIds.length,
      deletedIndices: indicesBefore - this.index.length,
    };
  }

  async deleteTopicIfEmpty(topicId: number): Promise<boolean> {
    if (!this.topics.has(topicId)) {
      return false;
    }
    if ((await this.countMessages(topicId)) > 0) {
      return false;
    }
    this.topics.delete(topicId);
    return true;
  }

  async countTopics(userId?: string): Promise<number> {
    if (userId === undefined) {
      return this.topics.size;
    }
    return [...this.topics.values()].filter(topic => topic.userId === userId).length;
  }

  async recountTopic(topicId: number): Promise<boolean> {
    const topic = this.topics.get(topicId);
    if (!topic) return false;

    const messages = [...this.messages.values()].filter(msg => msg.topicId === topicId);

    if (messages.length === 0) {
      this.topics.delete(topicId);
      return true;
    }

    this.topics.set(topicId, {
      ...topic,
      messageCnt: messages.length,
      userMessageCnt: messages.filter(msg => msg.role === 'user').length,
      assistantMessageCnt: messages.filter(msg => msg.role === 'assistant').length,
    });
    return true;
  }

  // --- messages ------------------------------------------------------------

  async listMessages(topicId: number, opts: ListMessagesOptions = {}): Promise<Message[]> {
    const { order = 'asc', offset = 0, limit } = opts;

    const sorted = [...this.messages.values()]
      .filter(msg => msg.topicId === topicId)
      .sort((a, b) => (order === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp));

    return sorted.slice(offset, limit === undefined ? undefined : offset + limit).map(clone);
  }

  async listUserMessages(userId: string): Promise<Message[]> {
    const topicIds = new Set(
      [...this.topics.values()].filter(topic => topic.userId === userId).map(topic => topic.id)
    );

    return [...this.messages.values()].filter(msg => topicIds.has(msg.topicId)).map(clone);
  }

  async getMessage(messageId: number): Promise<Message | undefined> {
    return clone(this.messages.get(messageId));
  }

  async appendMessage(topicId: number, msg: NewMessage): Promise<number> {
    const topic = this.topics.get(topicId);
    if (!topic) {
      throw new Error(`Topic ${topicId} not found`);
    }
    if (!msg.content || !msg.timestamp) {
      throw new Error('Missing required message fields');
    }

    const id = this.nextMessageId++;
    const record: Message = {
      type: 'text',
      tokens: estimateTokens(msg.content),
      ...clone(msg),
      topicId,
      id,
    };
    this.messages.set(id, record);

    this.topics.set(topicId, {
      ...topic,
      lastActive: record.timestamp,
      messageCnt: (topic.messageCnt || 0) + 1,
      ...(record.role === 'user'
        ? { userMessageCnt: (topic.userMessageCnt || 0) + 1 }
        : { assistantMessageCnt: (topic.assistantMessageCnt || 0) + 1 }),
      ...(record.tokens ? { totalTokens: (topic.totalTokens || 0) + record.tokens } : {}),
    });

    await this.indexMessage(topicId, id, record.content);

    return id;
  }

  async putMessage(msg: Message): Promise<number> {
    const id = msg.id ?? this.nextMessageId++;
    this.nextMessageId = Math.max(this.nextMessageId, id + 1);
    this.messages.set(id, { ...clone(msg), id });
    return id;
  }

  async updateMessage(messageId: number, patch: Partial<Message>): Promise<void> {
    const message = this.messages.get(messageId);
    if (!message) return;
    this.messages.set(messageId, { ...message, ...clone(patch), id: messageId });
  }

  async deleteMessage(messageId: number): Promise<boolean> {
    this.messages.delete(messageId);
    this.index = this.index.filter(entry => entry.messageId !== messageId);
    return !this.messages.has(messageId);
  }

  async clearTopicMessages(topicId: number): Promise<void> {
    const messageIds = [...this.messages.values()]
      .filter(msg => msg.topicId === topicId)
      .map(msg => msg.id)
      .filter(isDefined);

    messageIds.forEach(id => this.messages.delete(id));
    this.index = this.index.filter(entry => !messageIds.includes(entry.messageId));

    const topic = this.topics.get(topicId);
    if (topic) {
      this.topics.set(topicId, {
        ...topic,
        messageCnt: 0,
        userMessageCnt: 0,
        assistantMessageCnt: 0,
        totalTokens: 0,
      });
    }
  }

  async countMessages(topicId?: number, opts: CountMessagesOptions = {}): Promise<number> {
    return [...this.messages.values()].filter(
      msg =>
        (topicId === undefined || msg.topicId === topicId) &&
        (opts.role === undefined || msg.role === opts.role)
    ).length;
  }

  async sampleMessages(limit: number): Promise<Message[]> {
    return [...this.messages.values()].slice(0, limit).map(clone);
  }

  // --- search --------------------------------------------------------------

  async searchTopics(userId: string, query: string): Promise<Topic[]> {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];

    const topics = await this.listTopics(userId);
    return topics.filter(topic => topic.title.toLowerCase().includes(trimmed));
  }

  async searchMessages(
    userId: string,
    query: string,
    opts: SearchMessagesOptions = {}
  ): Promise<MessageHit[]> {
    if (!query || query.trim() === '') return [];

    const { filters = {}, limit = 20 } = opts;

    const userTopics = [...this.topics.values()].filter(topic => topic.userId === userId);
    const topicMap = new Map(userTopics.filter(t => isDefined(t.id)).map(t => [t.id as number, t]));

    const words = tokenizeQuery(query);
    if (words.length === 0) return [];

    const passesFilters = (message: Message): boolean => {
      if (filters.startDate && message.timestamp < filters.startDate) return false;
      if (filters.endDate && message.timestamp > filters.endDate) return false;
      if (filters.role && message.role !== filters.role) return false;
      return true;
    };

    const candidates = [...this.messages.values()].filter(msg => topicMap.has(msg.topicId));

    let matches: Message[];
    if (filters.exact) {
      const needle = query.toLowerCase();
      matches = candidates.filter(msg => passesFilters(msg) && msg.content.toLowerCase().includes(needle));
    } else {
      const indexed = new Set(
        this.index.filter(entry => words.includes(entry.word) && topicMap.has(entry.topicId))
          .map(entry => entry.messageId)
      );

      matches = indexed.size > 0
        ? candidates.filter(msg => isDefined(msg.id) && indexed.has(msg.id) && passesFilters(msg))
        : // Fall back to a content scan when the index cannot answer
          candidates.filter(msg => passesFilters(msg) && msg.content.toLowerCase().includes(query.toLowerCase()));
    }

    return matches
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map(message => ({ message: clone(message), topic: clone(topicMap.get(message.topicId)!) }));
  }

  async searchMessagesInTopic(topicId: number, query: string): Promise<Message[]> {
    const words = tokenizeQuery(query);

    if (words.length === 0) return [];

    const messageIds = new Set(
      this.index
        .filter(entry => entry.topicId === topicId && words.includes(entry.word))
        .map(entry => entry.messageId)
    );

    return [...messageIds]
      .map(id => this.messages.get(id))
      .filter((msg): msg is Message => msg !== undefined)
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(clone);
  }

  async indexMessage(topicId: number, messageId: number, content: string): Promise<void> {
    if (!content || content.trim() === '') return;

    for (const word of tokenizeForIndex(content)) {
      const existing = this.index.find(
        entry => entry.word === word && entry.topicId === topicId && entry.messageId === messageId
      );
      if (!existing) {
        this.index.push({ id: this.nextIndexId++, word, topicId, messageId });
      }
    }
  }

  async reindexTopic(topicId: number): Promise<boolean> {
    this.index = this.index.filter(entry => entry.topicId !== topicId);

    const messages = [...this.messages.values()].filter(msg => msg.topicId === topicId);
    for (const message of messages) {
      if (isDefined(message.id) && message.content) {
        await this.indexMessage(topicId, message.id, message.content);
      }
    }

    return true;
  }

  async reindexMessage(messageId: number): Promise<boolean> {
    const message = this.messages.get(messageId);
    if (!message || !message.content || !message.topicId) return false;

    this.index = this.index.filter(entry => entry.messageId !== messageId);
    await this.indexMessage(message.topicId, messageId, message.content);
    return true;
  }

  async reindexUser(userId: string): Promise<boolean> {
    const topicIds = [...this.topics.values()]
      .filter(topic => topic.userId === userId)
      .map(topic => topic.id)
      .filter(isDefined);

    for (const topicId of topicIds) {
      await this.reindexTopic(topicId);
    }
    return true;
  }

  async isTopicIndexed(topicId: number): Promise<boolean> {
    const messageIds = [...this.messages.values()]
      .filter(msg => msg.topicId === topicId)
      .map(msg => msg.id)
      .filter(isDefined);

    if (messageIds.length === 0) return true;
    return this.index.some(entry => messageIds.includes(entry.messageId));
  }

  async getSearchIndexStats(): Promise<SearchIndexStats> {
    return {
      totalWords: this.index.length,
      uniqueWords: new Set(this.index.map(e => e.word)).size,
      topicsCovered: new Set(this.index.map(e => e.topicId)).size,
      messagesCovered: new Set(this.index.map(e => e.messageId)).size,
    };
  }

  // --- maintenance ---------------------------------------------------------

  async getStorageEstimate(): Promise<StorageEstimate> {
    // Nothing is persisted, so nothing is consumed.
    return { usage: 0, quota: 0, percentage: 0 };
  }

  async isStorageCritical(): Promise<boolean> {
    return false;
  }

  async getDatabaseStats(): Promise<DatabaseStats> {
    const topicIds = new Set(this.topics.keys());

    let emptyTopicCount = 0;
    for (const topicId of topicIds) {
      if ((await this.countMessages(topicId)) === 0) emptyTopicCount++;
    }

    return {
      topicCount: this.topics.size,
      messageCount: this.messages.size,
      wordIndexCount: this.index.length,
      orphanedMessageCount: [...this.messages.values()].filter(msg => !topicIds.has(msg.topicId)).length,
      emptyTopicCount,
      storage: await this.getStorageEstimate(),
    };
  }

  async cleanupOrphanedData(): Promise<CleanupResult> {
    let deletedTopics = 0;
    let deletedMessages = 0;

    // Empty topics
    for (const topicId of [...this.topics.keys()]) {
      if ((await this.countMessages(topicId)) === 0) {
        const result = await this.deleteTopic(topicId);
        if (result.success) {
          deletedTopics++;
          deletedMessages += result.deletedMessages;
        }
      }
    }

    // Messages whose topic is gone
    const topicIds = new Set(this.topics.keys());
    for (const message of [...this.messages.values()]) {
      if (!topicIds.has(message.topicId) && isDefined(message.id)) {
        this.messages.delete(message.id);
        this.index = this.index.filter(entry => entry.messageId !== message.id);
        deletedMessages++;
      }
    }

    // Index entries whose message or topic is gone
    const messageIds = new Set(this.messages.keys());
    const before = this.index.length;
    this.index = this.index.filter(
      entry => messageIds.has(entry.messageId) && topicIds.has(entry.topicId)
    );

    for (const topicId of [...this.topics.keys()]) {
      await this.recountTopic(topicId);
    }

    return { deletedTopics, deletedMessages, deletedWordIndices: before - this.index.length };
  }

  async deleteOldestTopics(userId: string, keepCount: number): Promise<number> {
    const total = await this.countTopics(userId);
    if (total <= keepCount) return 0;

    const oldest = (await this.listTopics(userId, { order: 'asc' }))
      .slice(0, total - keepCount)
      .map(topic => topic.id)
      .filter(isDefined);

    for (const topicId of oldest) {
      await this.deleteTopic(topicId);
    }

    return oldest.length;
  }

  async cleanupOldData(userId: string, keepLastN: number = 20): Promise<void> {
    if (!(await this.isStorageCritical())) return;
    await this.deleteOldestTopics(userId, keepLastN);
  }

  async exportUserData(userId: string): Promise<ExportBundle> {
    const topics = [...this.topics.values()].filter(topic => topic.userId === userId);
    const topicIds = new Set(topics.map(topic => topic.id));

    return {
      topics: topics.map(clone),
      messages: [...this.messages.values()].filter(msg => topicIds.has(msg.topicId)).map(clone),
    };
  }

  async importUserData(bundle: ExportBundle, userId: string): Promise<boolean> {
    const validTopics = bundle.topics.filter(topic => topic.userId === userId);
    if (validTopics.length === 0) return false;

    const topicIdMap = new Map<number, number>();

    for (const topic of validTopics) {
      const { id: oldId, ...rest } = topic;
      const newId = await this.createTopic(rest);
      if (isDefined(oldId)) {
        topicIdMap.set(oldId, newId);
      }
    }

    for (const message of bundle.messages) {
      const newTopicId = topicIdMap.get(message.topicId);
      if (newTopicId === undefined) continue;

      const { id: _oldId, topicId: _oldTopicId, ...rest } = message;
      const newId = await this.putMessage({ ...rest, topicId: newTopicId });
      await this.indexMessage(newTopicId, newId, message.content);
    }

    return true;
  }

  async clearUserData(userId: string): Promise<boolean> {
    const topicIds = [...this.topics.values()]
      .filter(topic => topic.userId === userId)
      .map(topic => topic.id)
      .filter(isDefined);

    for (const topicId of topicIds) {
      await this.deleteTopic(topicId);
    }
    return true;
  }
}

export default InMemoryChatHistoryStore;
