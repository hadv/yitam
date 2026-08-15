import { describe, expect, it } from 'vitest';
import type { Topic } from '../../db';
import { buildTopicDraft, type TopicFormValues } from '../topicDraft';

const form = (overrides: Partial<TopicFormValues> = {}): TopicFormValues => ({
  title: 'Châm cứu cơ bản',
  systemPrompt: '',
  isPinned: false,
  model: '',
  ...overrides,
});

const existing = (overrides: Partial<Topic> = {}): Topic => ({
  id: 7,
  userId: 'alice@example.com',
  title: 'Tiêu đề cũ',
  createdAt: 1_000,
  lastActive: 1_000,
  messageCnt: 4,
  userMessageCnt: 2,
  assistantMessageCnt: 2,
  totalTokens: 120,
  ...overrides,
});

describe('buildTopicDraft', () => {
  const base = { userId: 'alice@example.com', personaId: 'yitam', now: 5_000 };

  describe('creating a topic', () => {
    it('binds the new topic to the active persona', () => {
      const draft = buildTopicDraft({ ...base, form: form() });

      expect(draft.personaId).toBe('yitam');
    });

    it('starts the counters at zero and stamps both timestamps', () => {
      const draft = buildTopicDraft({ ...base, form: form() });

      expect(draft).toMatchObject({
        userId: 'alice@example.com',
        title: 'Châm cứu cơ bản',
        createdAt: 5_000,
        lastActive: 5_000,
        messageCnt: 0,
        userMessageCnt: 0,
        assistantMessageCnt: 0,
        totalTokens: 0,
      });
      expect(draft.id).toBeUndefined();
    });

    it('trims the title and drops blank optional fields', () => {
      const draft = buildTopicDraft({
        ...base,
        form: form({ title: '  Bấm huyệt  ', systemPrompt: '   ', model: '' }),
      });

      expect(draft.title).toBe('Bấm huyệt');
      expect(draft.systemPrompt).toBeUndefined();
      expect(draft.model).toBeUndefined();
    });

    it('keeps the optional fields it is given', () => {
      const draft = buildTopicDraft({
        ...base,
        form: form({ systemPrompt: '  Trả lời ngắn gọn  ', model: 'claude-opus-5', isPinned: true }),
      });

      expect(draft).toMatchObject({
        systemPrompt: 'Trả lời ngắn gọn',
        model: 'claude-opus-5',
        pinnedState: true,
      });
    });
  });

  describe('editing a topic', () => {
    it('never reassigns a topic that already has a persona', () => {
      const draft = buildTopicDraft({
        ...base,
        personaId: 'traditional-medicine',
        topicToEdit: existing({ personaId: 'yitam' }),
        form: form({ title: 'Tiêu đề mới' }),
      });

      expect(draft.personaId).toBe('yitam');
      expect(draft.title).toBe('Tiêu đề mới');
    });

    it('adopts the active persona for a topic that predates persona tracking', () => {
      const draft = buildTopicDraft({
        ...base,
        personaId: 'traditional-medicine',
        topicToEdit: existing({ personaId: undefined }),
        form: form(),
      });

      expect(draft.personaId).toBe('traditional-medicine');
    });

    it('preserves identity and counters while refreshing lastActive', () => {
      const draft = buildTopicDraft({
        ...base,
        topicToEdit: existing(),
        form: form({ title: 'Tiêu đề mới' }),
      });

      expect(draft).toMatchObject({
        id: 7,
        createdAt: 1_000,
        messageCnt: 4,
        userMessageCnt: 2,
        assistantMessageCnt: 2,
        totalTokens: 120,
        lastActive: 5_000,
      });
    });

    it('does not mutate the topic it was given', () => {
      const topicToEdit = existing({ personaId: 'yitam' });

      buildTopicDraft({ ...base, topicToEdit, form: form({ title: 'Tiêu đề mới' }) });

      expect(topicToEdit.title).toBe('Tiêu đề cũ');
      expect(topicToEdit.lastActive).toBe(1_000);
    });
  });
});
