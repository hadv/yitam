import type { Topic } from '../db';

/** The fields the topic editor form collects. */
export interface TopicFormValues {
  title: string;
  systemPrompt: string;
  isPinned: boolean;
  model: string;
}

export interface TopicDraftInput {
  form: TopicFormValues;
  userId: string;
  /** The persona a newly created topic is bound to. */
  personaId: string;
  /** Present when editing an existing topic, absent when creating one. */
  topicToEdit?: Topic;
  now: number;
}

/**
 * Build the Topic record the editor form should save.
 *
 * A topic is bound to the persona that was active when it was created. That used
 * to happen invisibly: PersonaContext monkey-patched the global `indexedDB.open`
 * and injected `personaId` into every topic write that arrived without one.
 * Setting it here instead means the field survives a change of storage engine,
 * and can be tested without a database.
 */
export function buildTopicDraft({
  form,
  userId,
  personaId,
  topicToEdit,
  now,
}: TopicDraftInput): Topic {
  const edited = {
    title: form.title.trim(),
    systemPrompt: form.systemPrompt.trim() || undefined,
    pinnedState: form.isPinned,
    model: form.model || undefined,
    // Editing a topic's details counts as user activity.
    lastActive: now,
  };

  if (topicToEdit) {
    return {
      ...topicToEdit,
      ...edited,
      // Topics created before persona tracking carry no persona. Adopt the
      // active one rather than saving a topic without it — the same rule the
      // old IndexedDB patch applied, only visible now.
      personaId: topicToEdit.personaId ?? personaId,
    };
  }

  return {
    ...edited,
    userId,
    personaId,
    createdAt: now,
    messageCnt: 0,
    userMessageCnt: 0,
    assistantMessageCnt: 0,
    totalTokens: 0,
  };
}
