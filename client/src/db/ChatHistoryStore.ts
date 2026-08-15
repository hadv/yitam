/**
 * ChatHistoryStore — the single entry point for chat-history persistence.
 *
 * Everything the app persists about conversations goes through this interface.
 * Nothing outside `client/src/db/` should import the Dexie handle (`db`) directly;
 * see `scripts/check-db-boundary.sh` for the guard that keeps it that way.
 *
 * The types below are deliberately storage-agnostic: no Dexie types appear in any
 * signature, so a second implementation (in-memory for tests, SQLite/WASM for a
 * local-first backend) is a drop-in replacement rather than a rewrite.
 */

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

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
  role: MessageRole;
  content: string;
  type?: string;
  metadata?: any;
  tokens?: number;
  modelVersion?: string;
}

/**
 * A single term → message posting in the search index.
 *
 * An engine detail, not part of the store's public face: it is shared between the
 * implementations in this directory and deliberately absent from `./index.ts`, so
 * an engine with its own full-text search owes nothing to this shape.
 */
export interface WordIndex {
  id?: number;
  word: string;
  topicId: number;
  messageId: number;
}

export type MessageRole = 'user' | 'assistant';

/** A topic that has not been assigned an id by the store yet. */
export type NewTopic = Omit<Topic, 'id'>;

/** A message that has not been assigned an id by the store yet. `topicId` is supplied separately. */
export type NewMessage = Omit<Message, 'id' | 'topicId'>;

/** A search result: the matching message plus the topic it belongs to. */
export interface MessageHit {
  message: Message;
  topic: Topic;
}

// ---------------------------------------------------------------------------
// Operation options and results
// ---------------------------------------------------------------------------

/** Slice of a result set. `offset` counts from the start of the ordered set. */
export interface Page {
  offset?: number;
  limit?: number;
}

export interface ListTopicsOptions extends Page {
  /** Ordering by last-active time. Defaults to `'desc'` (most recent first). */
  order?: 'asc' | 'desc';
}

export interface ListMessagesOptions extends Page {
  /** Ordering by timestamp. Defaults to `'asc'` (oldest first, reading order). */
  order?: 'asc' | 'desc';
}

export interface CountMessagesOptions {
  role?: MessageRole;
}

export interface SearchFilters {
  startDate?: number;
  endDate?: number;
  role?: MessageRole;
  /** Match the query as a literal phrase instead of tokenising it. */
  exact?: boolean;
}

export interface SearchMessagesOptions {
  filters?: SearchFilters;
  limit?: number;
}

export interface DeleteTopicResult {
  success: boolean;
  deletedMessages: number;
  deletedIndices: number;
}

export interface CleanupResult {
  deletedTopics: number;
  deletedMessages: number;
  deletedWordIndices: number;
}

export interface StorageEstimate {
  usage: number;
  quota: number;
  percentage: number;
}

export interface DatabaseStats {
  topicCount: number;
  messageCount: number;
  wordIndexCount: number;
  orphanedMessageCount: number;
  emptyTopicCount: number;
  storage: StorageEstimate;
}

export interface SearchIndexStats {
  totalWords: number;
  uniqueWords: number;
  topicsCovered: number;
  messagesCovered: number;
}

/** A portable dump of one user's chat history. */
export interface ExportBundle {
  topics: Topic[];
  messages: Message[];
}

/** Lifecycle transitions a consumer may want to react to. */
export type StoreStatus = 'ready' | 'closed';

export type Unsubscribe = () => void;

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

export interface ChatHistoryStore {
  // --- lifecycle -----------------------------------------------------------

  /** Open the store, if it is not already open. Idempotent. */
  open(): Promise<void>;
  close(): Promise<void>;
  isOpen(): boolean;
  /** Verify the store can actually be read, not merely that it reports itself open. */
  checkConnection(): Promise<boolean>;
  /** Close and reopen. Returns whether the store came back up. */
  reinitialize(): Promise<boolean>;
  /**
   * Last-resort recovery for a store that will not open.
   * Destructive: may discard the underlying data to get back to a usable state.
   */
  attemptRecovery(): Promise<boolean>;
  /**
   * Subscribe to lifecycle transitions. Returns the unsubscribe function.
   *
   * An already-open store notifies the new listener with `'ready'` straight away,
   * so a subscriber never has to guess whether it missed the transition.
   */
  onStatusChange(listener: (status: StoreStatus) => void): Unsubscribe;

  // --- topics --------------------------------------------------------------

  /** A user's topics, most recently active first unless `order` says otherwise. */
  listTopics(userId: string, opts?: ListTopicsOptions): Promise<Topic[]>;
  getTopic(topicId: number): Promise<Topic | undefined>;
  createTopic(input: NewTopic): Promise<number>;
  /** Insert or overwrite a topic wholesale, keeping the id it carries. */
  putTopic(topic: Topic): Promise<number>;
  updateTopic(topicId: number, patch: Partial<Topic>): Promise<void>;
  /** Delete a topic and cascade to its messages and word index entries. */
  deleteTopic(topicId: number): Promise<DeleteTopicResult>;
  /** Delete a topic only if it holds exactly zero messages. Returns whether it was deleted. */
  deleteTopicIfEmpty(topicId: number): Promise<boolean>;
  /** Topic count for one user, or across all users when `userId` is omitted. */
  countTopics(userId?: string): Promise<number>;
  /**
   * Recompute a topic's cached message counters from the messages actually stored.
   * Deletes the topic if it turns out to hold no messages.
   */
  recountTopic(topicId: number): Promise<boolean>;

  // --- messages ------------------------------------------------------------

  /** A topic's messages in timestamp order, oldest first unless `order` says otherwise. */
  listMessages(topicId: number, opts?: ListMessagesOptions): Promise<Message[]>;
  /** Every message belonging to the given user, across all their topics. */
  listUserMessages(userId: string): Promise<Message[]>;
  getMessage(messageId: number): Promise<Message | undefined>;
  /**
   * Append a message to a topic and roll the topic's counters forward.
   * Falls back to lower-level writes if the primary path fails.
   */
  appendMessage(topicId: number, msg: NewMessage): Promise<number>;
  /** Insert or overwrite a message wholesale, keeping the id it carries. */
  putMessage(msg: Message): Promise<number>;
  updateMessage(messageId: number, patch: Partial<Message>): Promise<void>;
  /** Delete a message. Returns whether it is gone afterwards. */
  deleteMessage(messageId: number): Promise<boolean>;
  /** Delete every message in a topic and zero the topic's counters. The topic itself stays. */
  clearTopicMessages(topicId: number): Promise<void>;
  /** Message count for one topic, or across all topics when `topicId` is omitted. */
  countMessages(topicId?: number, opts?: CountMessagesOptions): Promise<number>;
  /** An arbitrary slice of messages. Intended for benchmarks and diagnostics. */
  sampleMessages(limit: number): Promise<Message[]>;

  // --- search --------------------------------------------------------------

  searchMessages(userId: string, query: string, opts?: SearchMessagesOptions): Promise<MessageHit[]>;
  /** Search within a single topic, newest match first. */
  searchMessagesInTopic(topicId: number, query: string): Promise<Message[]>;
  /** Rebuild the index for every message in a topic. */
  reindexTopic(topicId: number): Promise<boolean>;
  /** Rebuild the index for every topic belonging to a user. */
  reindexUser(userId: string): Promise<boolean>;
  getSearchIndexStats(): Promise<SearchIndexStats>;

  // --- maintenance ---------------------------------------------------------

  getStorageEstimate(): Promise<StorageEstimate>;
  isStorageCritical(): Promise<boolean>;
  getDatabaseStats(): Promise<DatabaseStats>;
  /** Remove empty topics, messages with no topic, and index entries with no message. */
  cleanupOrphanedData(): Promise<CleanupResult>;
  /** Drop a user's oldest topics, keeping the `keepCount` most recently active. */
  deleteOldestTopics(userId: string, keepCount: number): Promise<number>;
  /** Trim a user's history to the newest `keepLastN` topics, but only if storage is critical. */
  cleanupOldData(userId: string, keepLastN?: number): Promise<void>;
  exportUserData(userId: string): Promise<ExportBundle>;
  /** Import a bundle under `userId`, reassigning ids. Topics belonging to other users are skipped. */
  importUserData(bundle: ExportBundle, userId: string): Promise<boolean>;
  clearUserData(userId: string): Promise<boolean>;
}
