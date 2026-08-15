/**
 * A bot response arriving over the socket, chunk by chunk.
 *
 * `useMessages` assembles the streamed reply into a single message, and the same
 * buffer that assembly writes to is the one every other writer uses. These cases
 * are the safety net for changing how that buffer works: they describe what the
 * user ends up seeing, not how it is stored.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PersonaProvider } from '../../contexts/PersonaContext';
import { ChatHistoryProvider } from '../../contexts/ChatHistoryContext';
import { InMemoryChatHistoryStore } from '../../db';
import { useMessages } from '../useMessages';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const user = { email: 'a@b.c', name: 'Tester' };

/** The socket, from the hook's side: it listens, and it sends. Tests push events in. */
const createFakeSocket = () => {
  const handlers = new Map<string, Set<(payload: any) => void>>();

  return {
    emit: vi.fn(),
    on(event: string, handler: (payload: any) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event: string, handler?: (payload: any) => void) {
      if (!handlers.has(event)) return;
      if (handler) handlers.get(event)!.delete(handler);
      else handlers.get(event)!.clear();
    },
    /** Test-only: deliver a server event. */
    deliver(event: string, payload: any) {
      handlers.get(event)?.forEach(handler => handler(payload));
    },
  };
};

type FakeSocket = ReturnType<typeof createFakeSocket>;

let harness: { messages: ReturnType<typeof useMessages>['messages'] };
let socket: FakeSocket;
let store: InMemoryChatHistoryStore;
let container: HTMLDivElement;
let root: Root;

const Probe: React.FC = () => {
  const { messages } = useMessages(socket as any, user);
  harness = { messages };
  return null;
};

/** Let the 50ms coalescing window in `updateMessages` land. */
const settle = async (ms = 200) => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
};

const deliver = async (event: string, payload: any) => {
  await act(async () => {
    socket.deliver(event, payload);
  });
  await settle();
};

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  socket = createFakeSocket();
  store = new InMemoryChatHistoryStore();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

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
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const bot = () => harness.messages.find(message => message.isBot);

describe('a streamed bot response', () => {
  it('assembles its chunks into one message', async () => {
    await deliver('bot-response-start', { id: 'r1' });
    await deliver('bot-response-chunk', { id: 'r1', text: 'Huyệt ' });
    await deliver('bot-response-chunk', { id: 'r1', text: 'đạo ' });
    await deliver('bot-response-chunk', { id: 'r1', text: 'kinh lạc' });

    expect(harness.messages).toHaveLength(1);
    expect(bot()?.text).toBe('Huyệt đạo kinh lạc');
    expect(bot()?.isStreaming).toBe(true);
  });

  it('keeps every chunk that arrives inside one coalescing window', async () => {
    await deliver('bot-response-start', { id: 'r1' });

    // No settle between these: they all land before the buffer is flushed once.
    await act(async () => {
      socket.deliver('bot-response-chunk', { id: 'r1', text: 'a' });
      socket.deliver('bot-response-chunk', { id: 'r1', text: 'b' });
      socket.deliver('bot-response-chunk', { id: 'r1', text: 'c' });
    });
    await settle();

    expect(bot()?.text).toBe('abc');
  });

  it('stops streaming when the response ends', async () => {
    await deliver('bot-response-start', { id: 'r1' });
    await deliver('bot-response-chunk', { id: 'r1', text: 'xong' });
    await deliver('bot-response-end', { id: 'r1' });

    expect(bot()?.text).toBe('xong');
    expect(bot()?.isStreaming).toBe(false);
  });

  it('ignores chunks belonging to another response', async () => {
    await deliver('bot-response-start', { id: 'r1' });
    await deliver('bot-response-chunk', { id: 'r1', text: 'của tôi' });
    await deliver('bot-response-chunk', { id: 'r2', text: ' của người khác' });

    expect(bot()?.text).toBe('của tôi');
  });
});

describe('a bot response that fails', () => {
  it('shows the error reported mid-stream', async () => {
    await deliver('bot-response-start', { id: 'r1' });
    await deliver('bot-response-chunk', { id: 'r1', text: 'đang trả lời' });
    await deliver('bot-response-error', {
      id: 'r1',
      error: { error: { message: 'Số dư tín dụng quá thấp' }, type: 'credit_balance' },
    });

    expect(bot()?.isStreaming).toBe(false);
    expect(bot()?.error?.type).toBe('credit_balance');
  });

  it('shows the error reported when the response ends', async () => {
    await deliver('bot-response-start', { id: 'r1' });
    await deliver('bot-response-chunk', { id: 'r1', text: 'đang trả lời' });
    await deliver('bot-response-end', { id: 'r1', error: true, errorMessage: 'Máy chủ quá tải' });

    expect(bot()?.isStreaming).toBe(false);
    expect(bot()?.error?.message).toBe('Máy chủ quá tải');
  });
});
