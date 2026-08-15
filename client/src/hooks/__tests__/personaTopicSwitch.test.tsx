/**
 * Loading a topic from history while a different persona is selected.
 *
 * The topic carries its own persona, so opening it changes the active one. That
 * change used to race the debounced message buffer in `useMessages`: the effect
 * that keeps the welcome greeting in step with the persona decided from the
 * rendered `messages`, which still held the welcome message, and overwrote the
 * conversation that had just been read from the store. The chat came up showing
 * the greeting instead of the conversation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PersonaProvider, usePersona } from '../../contexts/PersonaContext';
import { ChatHistoryProvider } from '../../contexts/ChatHistoryContext';
import { InMemoryChatHistoryStore } from '../../db';
import { useMessages } from '../useMessages';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const user = { email: 'a@b.c', name: 'Tester' };

interface Harness {
  messages: ReturnType<typeof useMessages>['messages'];
  handleTopicSelect: (id: number) => Promise<void>;
  setCurrentPersonaId: (id: string) => void;
  currentPersonaId: string;
}

let harness: Harness;
let renderCount = 0;

const Probe: React.FC = () => {
  const { currentPersonaId, setCurrentPersonaId } = usePersona();
  const { messages, handleTopicSelect } = useMessages(null as any, user);
  renderCount++;
  harness = { messages, handleTopicSelect, setCurrentPersonaId, currentPersonaId };
  return null;
};

let container: HTMLDivElement;
let root: Root;
let store: InMemoryChatHistoryStore;

/** Let the debounce in `updateMessages` (50ms) and any follow-up effects settle. */
const settle = async (ms = 200) => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
};

const mount = async () => {
  await act(async () => {
    root.render(
      <ChatHistoryProvider store={store}>
        <PersonaProvider>
          <Probe />
        </PersonaProvider>
      </ChatHistoryProvider>
    );
  });
  await settle();
};

const seedTopic = async (personaId: string) => {
  const topicId = await store.createTopic({
    userId: user.email,
    title: 'Cuộc trò chuyện cũ',
    createdAt: Date.now() - 10000,
    lastActive: Date.now() - 10000,
    personaId,
  });
  await store.appendMessage(topicId, { timestamp: Date.now() - 9000, role: 'user', content: 'Xin chào' });
  await store.appendMessage(topicId, { timestamp: Date.now() - 8000, role: 'assistant', content: 'Chào bạn' });
  return topicId;
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  renderCount = 0;
  localStorage.clear();
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  store = new InMemoryChatHistoryStore();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('opening a topic whose persona differs from the selected one', () => {
  it('shows the conversation, not the welcome greeting', async () => {
    const topicId = await seedTopic('yitam');
    await mount();

    // The user picks another persona in the selector and does nothing else.
    await act(async () => {
      harness.setCurrentPersonaId('lao-tu');
    });
    await settle();
    expect(harness.currentPersonaId).toBe('lao-tu');

    await act(async () => {
      await harness.handleTopicSelect(topicId);
    });
    await settle();

    expect(harness.messages.map(m => m.text)).toEqual(['Xin chào', 'Chào bạn']);
    expect(harness.currentPersonaId).toBe('yitam');
  });

  it('keeps the persona the user picked as the default for new chats', async () => {
    const topicId = await seedTopic('yitam');
    await mount();

    await act(async () => {
      harness.setCurrentPersonaId('lao-tu');
    });
    await settle();

    await act(async () => {
      await harness.handleTopicSelect(topicId);
    });
    await settle();

    // Following the topic's persona is a display concern; it must not overwrite
    // the preference the selector wrote.
    expect(localStorage.getItem('selectedPersonaId')).toBe('lao-tu');
  });

  it('leaves the message list alone once loaded', async () => {
    const topicId = await seedTopic('yitam');
    await mount();
    await act(async () => {
      harness.setCurrentPersonaId('lao-tu');
    });
    await settle();
    await act(async () => {
      await harness.handleTopicSelect(topicId);
    });
    await settle();

    const settledRenders = renderCount;
    await settle(500);
    expect(renderCount - settledRenders).toBe(0);
  });
});

describe('loading a topic', () => {
  it('does not close the store out from under the rest of the app', async () => {
    const topicId = await seedTopic('yitam');
    const close = vi.spyOn(store, 'close');
    await mount();

    await act(async () => {
      await harness.handleTopicSelect(topicId);
    });
    await settle();

    // The history modal that triggered this is querying the same handle.
    expect(close).not.toHaveBeenCalled();
    expect(store.isOpen()).toBe(true);
    expect(harness.messages.map(m => m.text)).toEqual(['Xin chào', 'Chào bạn']);
  });
});

describe('a conversation with nothing in it', () => {
  // The greeting is not a message. It is drawn from the persona where it is shown
  // (see TailwindMessageDisplay), so the list stays empty and nothing has to keep
  // a fake message in step with the persona.
  it('holds no messages at all', async () => {
    await mount();
    expect(harness.messages).toEqual([]);
  });

  it('stays empty when the persona changes', async () => {
    await mount();

    await act(async () => {
      harness.setCurrentPersonaId('lao-tu');
    });
    await settle();

    expect(harness.messages).toEqual([]);
  });

  it('does not churn on every render', async () => {
    await mount();
    const settledRenders = renderCount;
    await settle(500);
    expect(renderCount - settledRenders).toBe(0);
  });
});
