import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
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

/**
 * A word index that has fallen behind is the state the search UI used to detect
 * and repair by hand: messages written before indexing existed are invisible to
 * search until their topics are rebuilt. The store owns that repair now, so it is
 * checked here — the contract suite cannot reach this state, because nothing on
 * the interface can leave the index behind.
 */
describe('DexieChatHistoryStore — a search index left behind', () => {
  const USER = 'nguoi-dung@example.com';

  beforeEach(async () => {
    await db.transaction('rw', [db.topics, db.messages, db.wordIndex], async () => {
      await db.topics.clear();
      await db.messages.clear();
      await db.wordIndex.clear();
    });
  });

  const seed = async () => {
    const store = new DexieChatHistoryStore();
    await store.open();
    const topicId = await store.createTopic({
      userId: USER,
      title: 'Châm cứu cơ bản',
      createdAt: 1,
      lastActive: 1,
    });
    await store.appendMessage(topicId, { timestamp: 10, role: 'user', content: 'huyệt đạo kinh lạc' });
    return topicId;
  };

  it('rebuilds itself on the next search', async () => {
    await seed();
    await db.wordIndex.clear();

    // A fresh instance: the repair is attempted once per store instance.
    const store = new DexieChatHistoryStore();
    await store.open();

    const found = await store.searchMessages(USER, 'huyệt đạo');

    expect(found).toHaveLength(1);
    expect(found[0].message.content).toBe('huyệt đạo kinh lạc');
    // Without the rebuild the hit would still arrive, from a full content scan.
    // The point of the repair is that it stops being a scan.
    expect(await db.wordIndex.count()).toBeGreaterThan(0);
  });

  it('rebuilds itself on the next search within a topic', async () => {
    const topicId = await seed();
    await db.wordIndex.clear();

    const store = new DexieChatHistoryStore();
    await store.open();

    const found = await store.searchMessagesInTopic(topicId, 'kinh lạc');

    expect(found).toHaveLength(1);
    expect(found[0].content).toBe('huyệt đạo kinh lạc');
  });

  it('does not rebuild again once it has looked', async () => {
    await seed();
    const store = new DexieChatHistoryStore();
    await store.open();
    await store.searchMessages(USER, 'huyệt đạo');

    // Wiping after the first search leaves the index empty: a store that checked
    // on every call would silently make searches cost a full rebuild each time.
    await db.wordIndex.clear();
    await store.searchMessages(USER, 'huyệt đạo');

    expect(await db.wordIndex.count()).toBe(0);
  });

  it('judges each user by their own topics', async () => {
    await seed();
    const other = 'nguoi-khac@example.com';
    const store = new DexieChatHistoryStore();
    await store.open();
    const otherTopic = await store.createTopic({
      userId: other,
      title: 'Kinh dịch',
      createdAt: 1,
      lastActive: 1,
    });
    await store.appendMessage(otherTopic, { timestamp: 10, role: 'user', content: 'bát quái càn khôn' });

    // Only the second user's postings go missing. A store that looked at the
    // index as a whole would see the first user's entries and call it indexed.
    await db.wordIndex.where('topicId').equals(otherTopic).delete();

    const fresh = new DexieChatHistoryStore();
    await fresh.open();
    await fresh.searchMessages(other, 'bát quái');

    // The result is not the tell — `advancedSearch` answers from a content scan
    // when the index comes up empty. What must happen is the rebuild.
    expect(await db.wordIndex.where('topicId').equals(otherTopic).count()).toBeGreaterThan(0);
  });
});
