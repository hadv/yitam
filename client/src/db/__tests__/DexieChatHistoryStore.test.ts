import 'fake-indexeddb/auto';
import db from '../ChatHistoryDB';
import { DexieChatHistoryStore } from '../DexieChatHistoryStore';
import { describeChatHistoryStoreContract } from './chatHistoryStoreContract';

/**
 * The Dexie store runs against fake-indexeddb, so the same contract that the
 * in-memory store satisfies is checked against the engine the app actually ships.
 */
describeChatHistoryStoreContract('DexieChatHistoryStore', async () => {
  const store = new DexieChatHistoryStore();
  await store.open();

  // A single Dexie singleton is shared across cases, so empty it between them.
  await db.transaction('rw', [db.topics, db.messages, db.wordIndex], async () => {
    await db.topics.clear();
    await db.messages.clear();
    await db.wordIndex.clear();
  });

  return store;
});
