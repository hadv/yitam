import { beforeEach, describe, expect, it } from 'vitest';
import type { ChatHistoryStore, NewTopic } from '../ChatHistoryStore';

/**
 * The behaviour every ChatHistoryStore must exhibit.
 *
 * Call this from an implementation's test file with a factory that returns a
 * freshly emptied store. Anything asserted here is part of the contract: if a new
 * implementation cannot satisfy it, either the implementation is wrong or the
 * contract needs renegotiating — deciding which is the point of having this file.
 *
 * Deliberately out of scope: getStorageEstimate/isStorageCritical, which report on
 * the host environment rather than on the data, and recovery behaviour, which is
 * destructive by design and differs per engine.
 */
export function describeChatHistoryStoreContract(
  name: string,
  createStore: () => Promise<ChatHistoryStore>
): void {
  describe(`${name} — ChatHistoryStore contract`, () => {
    const USER = 'alice@example.com';
    const OTHER_USER = 'bob@example.com';

    let store: ChatHistoryStore;

    const topicInput = (overrides: Partial<NewTopic> = {}): NewTopic => ({
      userId: USER,
      title: 'Chủ đề thử nghiệm',
      createdAt: 1_000,
      lastActive: 1_000,
      messageCnt: 0,
      userMessageCnt: 0,
      assistantMessageCnt: 0,
      totalTokens: 0,
      ...overrides,
    });

    beforeEach(async () => {
      store = await createStore();
    });

    // --- topics ------------------------------------------------------------

    describe('topics', () => {
      it('round-trips a created topic', async () => {
        const id = await store.createTopic(topicInput({ title: 'Kinh mạch' }));

        const topic = await store.getTopic(id);
        expect(topic).toMatchObject({ id, userId: USER, title: 'Kinh mạch' });
      });

      it('returns undefined for a topic that does not exist', async () => {
        expect(await store.getTopic(9999)).toBeUndefined();
      });

      it('lists a user\'s topics most recently active first', async () => {
        await store.createTopic(topicInput({ title: 'old', lastActive: 100 }));
        await store.createTopic(topicInput({ title: 'newest', lastActive: 300 }));
        await store.createTopic(topicInput({ title: 'middle', lastActive: 200 }));

        const titles = (await store.listTopics(USER)).map(t => t.title);
        expect(titles).toEqual(['newest', 'middle', 'old']);
      });

      it('lists oldest first when asked', async () => {
        await store.createTopic(topicInput({ title: 'old', lastActive: 100 }));
        await store.createTopic(topicInput({ title: 'new', lastActive: 300 }));

        const titles = (await store.listTopics(USER, { order: 'asc' })).map(t => t.title);
        expect(titles).toEqual(['old', 'new']);
      });

      it('paginates the topic list', async () => {
        for (const lastActive of [100, 200, 300, 400]) {
          await store.createTopic(topicInput({ title: `t${lastActive}`, lastActive }));
        }

        const page = await store.listTopics(USER, { offset: 1, limit: 2 });
        expect(page.map(t => t.title)).toEqual(['t300', 't200']);
      });

      it('does not leak topics between users', async () => {
        await store.createTopic(topicInput());
        await store.createTopic(topicInput({ userId: OTHER_USER }));

        expect(await store.listTopics(USER)).toHaveLength(1);
        expect(await store.countTopics(USER)).toBe(1);
        expect(await store.countTopics()).toBe(2);
      });

      it('applies a partial update without disturbing other fields', async () => {
        const id = await store.createTopic(topicInput({ title: 'before', personaId: 'yitam' }));

        await store.updateTopic(id, { title: 'after' });

        expect(await store.getTopic(id)).toMatchObject({ title: 'after', personaId: 'yitam' });
      });

      it('does not mutate stored state through a returned object', async () => {
        const id = await store.createTopic(topicInput({ title: 'original' }));

        const topic = await store.getTopic(id);
        topic!.title = 'tampered';

        expect((await store.getTopic(id))!.title).toBe('original');
      });

      it('deletes a topic together with its messages and index entries', async () => {
        const id = await store.createTopic(topicInput());
        await store.appendMessage(id, { timestamp: 1, role: 'user', content: 'châm cứu huyệt đạo' });
        await store.appendMessage(id, { timestamp: 2, role: 'assistant', content: 'trả lời' });

        const result = await store.deleteTopic(id);

        expect(result.success).toBe(true);
        expect(result.deletedMessages).toBe(2);
        expect(await store.getTopic(id)).toBeUndefined();
        expect(await store.countMessages(id)).toBe(0);
        expect((await store.getSearchIndexStats()).totalWords).toBe(0);
      });

      it('reports failure when deleting a topic that does not exist', async () => {
        expect(await store.deleteTopic(4242)).toMatchObject({ success: false });
      });

      it('deletes an empty topic but spares one holding messages', async () => {
        const empty = await store.createTopic(topicInput());
        const populated = await store.createTopic(topicInput());
        await store.appendMessage(populated, { timestamp: 1, role: 'user', content: 'xin chào' });

        expect(await store.deleteTopicIfEmpty(empty)).toBe(true);
        expect(await store.deleteTopicIfEmpty(populated)).toBe(false);
        expect(await store.getTopic(populated)).toBeDefined();
      });
    });

    // --- messages ----------------------------------------------------------

    describe('messages', () => {
      let topicId: number;

      beforeEach(async () => {
        topicId = await store.createTopic(topicInput());
      });

      it('appends a message and reads it back', async () => {
        const id = await store.appendMessage(topicId, {
          timestamp: 10,
          role: 'user',
          content: 'nội dung tin nhắn',
        });

        expect(await store.getMessage(id)).toMatchObject({
          id,
          topicId,
          role: 'user',
          content: 'nội dung tin nhắn',
        });
      });

      it('rolls the topic counters forward on append', async () => {
        await store.appendMessage(topicId, { timestamp: 10, role: 'user', content: 'hỏi', tokens: 3 });
        await store.appendMessage(topicId, { timestamp: 20, role: 'assistant', content: 'đáp', tokens: 7 });

        expect(await store.getTopic(topicId)).toMatchObject({
          messageCnt: 2,
          userMessageCnt: 1,
          assistantMessageCnt: 1,
          totalTokens: 10,
          lastActive: 20,
        });
      });

      it('refuses to append to a topic that does not exist', async () => {
        await expect(
          store.appendMessage(9999, { timestamp: 1, role: 'user', content: 'mồ côi' })
        ).rejects.toThrow();
      });

      it('lists messages oldest first', async () => {
        await store.appendMessage(topicId, { timestamp: 30, role: 'user', content: 'third' });
        await store.appendMessage(topicId, { timestamp: 10, role: 'user', content: 'first' });
        await store.appendMessage(topicId, { timestamp: 20, role: 'user', content: 'second' });

        const contents = (await store.listMessages(topicId)).map(m => m.content);
        expect(contents).toEqual(['first', 'second', 'third']);
      });

      it('paginates messages in a stable order', async () => {
        for (const timestamp of [10, 20, 30, 40, 50]) {
          await store.appendMessage(topicId, { timestamp, role: 'user', content: `m${timestamp}` });
        }

        const page = await store.listMessages(topicId, { offset: 1, limit: 2 });
        expect(page.map(m => m.content)).toEqual(['m20', 'm30']);
      });

      it('counts messages, optionally by role', async () => {
        await store.appendMessage(topicId, { timestamp: 10, role: 'user', content: 'a' });
        await store.appendMessage(topicId, { timestamp: 20, role: 'assistant', content: 'b' });
        await store.appendMessage(topicId, { timestamp: 30, role: 'assistant', content: 'c' });

        expect(await store.countMessages(topicId)).toBe(3);
        expect(await store.countMessages(topicId, { role: 'assistant' })).toBe(2);
        expect(await store.countMessages()).toBe(3);
      });

      it('deletes a message and reports it gone', async () => {
        const id = await store.appendMessage(topicId, { timestamp: 10, role: 'user', content: 'tạm biệt' });

        expect(await store.deleteMessage(id)).toBe(true);
        expect(await store.getMessage(id)).toBeUndefined();
        expect(await store.countMessages(topicId)).toBe(0);
      });

      it('updates a message in place', async () => {
        const id = await store.appendMessage(topicId, { timestamp: 10, role: 'user', content: 'nội dung' });

        await store.updateMessage(id, { metadata: { compressed: true } });

        const message = await store.getMessage(id);
        expect(message!.metadata).toEqual({ compressed: true });
        expect(message!.content).toBe('nội dung');
      });

      it('clears a topic\'s messages, zeroes its counters, and keeps the topic', async () => {
        await store.appendMessage(topicId, { timestamp: 10, role: 'user', content: 'một' });
        await store.appendMessage(topicId, { timestamp: 20, role: 'assistant', content: 'hai' });

        await store.clearTopicMessages(topicId);

        expect(await store.countMessages(topicId)).toBe(0);
        expect(await store.getTopic(topicId)).toMatchObject({
          messageCnt: 0,
          userMessageCnt: 0,
          assistantMessageCnt: 0,
          totalTokens: 0,
        });
      });

      it('collects every message belonging to a user', async () => {
        const second = await store.createTopic(topicInput());
        const otherUsers = await store.createTopic(topicInput({ userId: OTHER_USER }));

        await store.appendMessage(topicId, { timestamp: 10, role: 'user', content: 'a' });
        await store.appendMessage(second, { timestamp: 20, role: 'user', content: 'b' });
        await store.appendMessage(otherUsers, { timestamp: 30, role: 'user', content: 'c' });

        const contents = (await store.listUserMessages(USER)).map(m => m.content).sort();
        expect(contents).toEqual(['a', 'b']);
      });

      it('recomputes stale counters from the messages actually stored', async () => {
        await store.appendMessage(topicId, { timestamp: 10, role: 'user', content: 'a' });
        await store.updateTopic(topicId, { messageCnt: 99, userMessageCnt: 99 });

        expect(await store.recountTopic(topicId)).toBe(true);
        expect(await store.getTopic(topicId)).toMatchObject({ messageCnt: 1, userMessageCnt: 1 });
      });

      it('drops a topic that turns out to hold no messages when recounted', async () => {
        await store.recountTopic(topicId);
        expect(await store.getTopic(topicId)).toBeUndefined();
      });
    });

    // --- search ------------------------------------------------------------

    describe('search', () => {
      let topicId: number;

      beforeEach(async () => {
        topicId = await store.createTopic(topicInput({ title: 'Châm cứu cơ bản' }));
      });

      it('finds a message through the word index', async () => {
        await store.appendMessage(topicId, { timestamp: 10, role: 'user', content: 'huyệt hợp cốc nằm ở đâu' });
        await store.appendMessage(topicId, { timestamp: 20, role: 'assistant', content: 'nội dung khác hẳn' });

        const hits = await store.searchMessages(USER, 'hợp cốc');

        expect(hits).toHaveLength(1);
        expect(hits[0].message.content).toContain('hợp cốc');
        expect(hits[0].topic.id).toBe(topicId);
      });

      it('matches a literal phrase when asked for an exact search', async () => {
        await store.appendMessage(topicId, { timestamp: 10, role: 'user', content: 'khí huyết lưu thông' });
        await store.appendMessage(topicId, { timestamp: 20, role: 'user', content: 'lưu thông khí huyết' });

        const hits = await store.searchMessages(USER, 'khí huyết lưu', { filters: { exact: true } });

        expect(hits).toHaveLength(1);
        expect(hits[0].message.content).toBe('khí huyết lưu thông');
      });

      it('honours the role filter', async () => {
        await store.appendMessage(topicId, { timestamp: 10, role: 'user', content: 'kinh lạc' });
        await store.appendMessage(topicId, { timestamp: 20, role: 'assistant', content: 'kinh lạc' });

        const hits = await store.searchMessages(USER, 'kinh lạc', { filters: { role: 'assistant' } });

        expect(hits).toHaveLength(1);
        expect(hits[0].message.role).toBe('assistant');
      });

      it('returns newest matches first and respects the limit', async () => {
        for (const timestamp of [10, 20, 30]) {
          await store.appendMessage(topicId, { timestamp, role: 'user', content: `kinh lạc ${timestamp}` });
        }

        const hits = await store.searchMessages(USER, 'kinh lạc', { limit: 2 });

        expect(hits.map(h => h.message.timestamp)).toEqual([30, 20]);
      });

      it('never returns another user\'s messages', async () => {
        const otherTopic = await store.createTopic(topicInput({ userId: OTHER_USER }));
        await store.appendMessage(otherTopic, { timestamp: 10, role: 'user', content: 'kinh lạc bí mật' });

        expect(await store.searchMessages(USER, 'kinh lạc')).toHaveLength(0);
      });

      it('returns nothing for an empty query', async () => {
        await store.appendMessage(topicId, { timestamp: 10, role: 'user', content: 'kinh lạc' });
        expect(await store.searchMessages(USER, '   ')).toEqual([]);
      });

      it('searches within a single topic', async () => {
        const other = await store.createTopic(topicInput());
        await store.appendMessage(topicId, { timestamp: 10, role: 'user', content: 'phương thuốc gia truyền' });
        await store.appendMessage(other, { timestamp: 20, role: 'user', content: 'phương thuốc gia truyền' });

        const found = await store.searchMessagesInTopic(topicId, 'phương');

        expect(found).toHaveLength(1);
        expect(found[0].topicId).toBe(topicId);
      });

      it('matches topics by title', async () => {
        await store.createTopic(topicInput({ title: 'Bấm huyệt' }));

        const found = await store.searchTopics(USER, 'châm');

        expect(found.map(t => t.title)).toEqual(['Châm cứu cơ bản']);
      });

      it('reports index coverage', async () => {
        await store.appendMessage(topicId, { timestamp: 10, role: 'user', content: 'huyệt đạo kinh lạc' });

        const stats = await store.getSearchIndexStats();

        expect(stats.messagesCovered).toBe(1);
        expect(stats.topicsCovered).toBe(1);
        expect(stats.uniqueWords).toBeGreaterThan(0);
        expect(await store.isTopicIndexed(topicId)).toBe(true);
      });

      it('treats a topic with no messages as indexed', async () => {
        expect(await store.isTopicIndexed(topicId)).toBe(true);
      });

      it('rebuilds a topic\'s index without duplicating entries', async () => {
        await store.appendMessage(topicId, { timestamp: 10, role: 'user', content: 'huyệt đạo kinh lạc' });
        const before = await store.getSearchIndexStats();

        expect(await store.reindexTopic(topicId)).toBe(true);

        expect(await store.getSearchIndexStats()).toEqual(before);
      });

      it('rebuilds the index for a single message', async () => {
        const id = await store.appendMessage(topicId, { timestamp: 10, role: 'user', content: 'huyệt đạo' });

        expect(await store.reindexMessage(id)).toBe(true);
        expect(await store.reindexMessage(9999)).toBe(false);
      });

      it('rebuilds the index for a whole user', async () => {
        await store.appendMessage(topicId, { timestamp: 10, role: 'user', content: 'huyệt đạo' });

        expect(await store.reindexUser(USER)).toBe(true);
        expect((await store.getSearchIndexStats()).messagesCovered).toBe(1);
      });
    });

    // --- maintenance -------------------------------------------------------

    describe('maintenance', () => {
      it('reports database stats', async () => {
        const populated = await store.createTopic(topicInput());
        await store.createTopic(topicInput()); // stays empty
        await store.appendMessage(populated, { timestamp: 10, role: 'user', content: 'huyệt đạo' });

        const stats = await store.getDatabaseStats();

        expect(stats.topicCount).toBe(2);
        expect(stats.messageCount).toBe(1);
        expect(stats.emptyTopicCount).toBe(1);
        expect(stats.wordIndexCount).toBeGreaterThan(0);
      });

      it('cleans up empty topics', async () => {
        const populated = await store.createTopic(topicInput());
        await store.createTopic(topicInput());
        await store.appendMessage(populated, { timestamp: 10, role: 'user', content: 'còn lại' });

        const result = await store.cleanupOrphanedData();

        expect(result.deletedTopics).toBe(1);
        expect(await store.countTopics()).toBe(1);
        expect(await store.getTopic(populated)).toBeDefined();
      });

      it('keeps the most recently active topics when trimming the oldest', async () => {
        for (const lastActive of [100, 200, 300]) {
          const id = await store.createTopic(topicInput({ title: `t${lastActive}`, lastActive }));
          await store.appendMessage(id, { timestamp: lastActive, role: 'user', content: `nội dung ${lastActive}` });
        }

        expect(await store.deleteOldestTopics(USER, 2)).toBe(1);

        const remaining = (await store.listTopics(USER)).map(t => t.title);
        expect(remaining).toEqual(['t300', 't200']);
      });

      it('deletes nothing when already under the keep count', async () => {
        await store.createTopic(topicInput());
        expect(await store.deleteOldestTopics(USER, 5)).toBe(0);
      });

      it('exports only the requested user\'s data', async () => {
        const mine = await store.createTopic(topicInput());
        const theirs = await store.createTopic(topicInput({ userId: OTHER_USER }));
        await store.appendMessage(mine, { timestamp: 10, role: 'user', content: 'của tôi' });
        await store.appendMessage(theirs, { timestamp: 20, role: 'user', content: 'của họ' });

        const bundle = await store.exportUserData(USER);

        expect(bundle.topics).toHaveLength(1);
        expect(bundle.messages.map(m => m.content)).toEqual(['của tôi']);
      });

      it('round-trips an export through import', async () => {
        const source = await store.createTopic(topicInput({ title: 'Gốc' }));
        await store.appendMessage(source, { timestamp: 10, role: 'user', content: 'câu hỏi' });
        await store.appendMessage(source, { timestamp: 20, role: 'assistant', content: 'câu trả lời' });

        const bundle = await store.exportUserData(USER);
        await store.clearUserData(USER);
        expect(await store.countTopics(USER)).toBe(0);

        expect(await store.importUserData(bundle, USER)).toBe(true);

        const [restored] = await store.listTopics(USER);
        expect(restored.title).toBe('Gốc');
        const messages = await store.listMessages(restored.id!);
        expect(messages.map(m => m.content)).toEqual(['câu hỏi', 'câu trả lời']);
      });

      it('refuses an import whose topics belong to someone else', async () => {
        const bundle = { topics: [{ ...topicInput({ userId: OTHER_USER }), id: 1 }], messages: [] };
        expect(await store.importUserData(bundle, USER)).toBe(false);
      });

      it('clears one user\'s data and leaves the other\'s alone', async () => {
        const mine = await store.createTopic(topicInput());
        const theirs = await store.createTopic(topicInput({ userId: OTHER_USER }));
        await store.appendMessage(mine, { timestamp: 10, role: 'user', content: 'của tôi' });
        await store.appendMessage(theirs, { timestamp: 20, role: 'user', content: 'của họ' });

        expect(await store.clearUserData(USER)).toBe(true);

        expect(await store.countTopics(USER)).toBe(0);
        expect(await store.countTopics(OTHER_USER)).toBe(1);
        expect(await store.listUserMessages(OTHER_USER)).toHaveLength(1);
      });
    });

    // --- lifecycle ---------------------------------------------------------

    describe('lifecycle', () => {
      it('is open and readable after being created', async () => {
        expect(store.isOpen()).toBe(true);
        expect(await store.checkConnection()).toBe(true);
      });

      it('is open again after a reinitialize', async () => {
        expect(await store.reinitialize()).toBe(true);
        expect(await store.checkConnection()).toBe(true);
      });

      it('tells a new listener the store is already ready', async () => {
        const seen: string[] = [];
        const unsubscribe = store.onStatusChange(status => seen.push(status));

        expect(seen).toEqual(['ready']);
        unsubscribe();
      });

      it('stops notifying a listener once it unsubscribes', async () => {
        const seen: string[] = [];
        const unsubscribe = store.onStatusChange(status => seen.push(status));

        unsubscribe();
        seen.length = 0;

        await store.close();
        await store.open();

        expect(seen).toEqual([]);
      });
    });
  });
}
