/**
 * The public face of `client/src/db`.
 *
 * Everything the rest of the app is allowed to know about chat-history
 * persistence is exported here: the store interface, its domain types, and the
 * singleton instance the provider hands out. The Dexie handle itself
 * (`./ChatHistoryDB`) and its helpers stay private to this directory.
 */

export type {
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
  MessageRole,
  NewMessage,
  NewTopic,
  Page,
  SearchFilters,
  SearchMessagesOptions,
  StorageEstimate,
  StoreStatus,
  Topic,
  Unsubscribe,
} from './ChatHistoryStore';

export { DexieChatHistoryStore, chatHistoryStore } from './DexieChatHistoryStore';
export { InMemoryChatHistoryStore } from './InMemoryChatHistoryStore';
