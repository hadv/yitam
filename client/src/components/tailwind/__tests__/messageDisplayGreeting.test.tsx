/**
 * The greeting for an empty conversation.
 *
 * It used to be a message with the id `welcome`, seeded into the list and rewritten
 * by an effect whenever the persona changed — derived state kept in the same place
 * as real data, which is how a loaded conversation once got overwritten by a
 * greeting. It is drawn here now, from the persona of the moment.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Message } from '../../../types/chat';
import TailwindMessageDisplay from '../TailwindMessageDisplay';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no IntersectionObserver, and the infinite-scroll effect builds one.
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = '';
    thresholds = [];
  } as unknown as typeof IntersectionObserver;

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = async (props: { messages: Message[]; currentPersonaId: string; userName?: string }) => {
  await act(async () => {
    root.render(<TailwindMessageDisplay {...props} />);
  });
};

describe('an empty conversation', () => {
  it('greets the user by name, in the voice of the active persona', async () => {
    await render({ messages: [], currentPersonaId: 'lao-tu', userName: 'Tester' });

    expect(container.textContent).toBe('Xin chào Tester! Lão Tử đang lắng nghe!');
  });

  it('greets without a name when there is none', async () => {
    await render({ messages: [], currentPersonaId: 'yitam' });

    expect(container.textContent).toBe('Xin chào! Yitam đang lắng nghe!');
  });

  it('follows the persona without anything being rewritten', async () => {
    await render({ messages: [], currentPersonaId: 'yitam', userName: 'Tester' });
    expect(container.textContent).toContain('Yitam');

    await render({ messages: [], currentPersonaId: 'vien-minh', userName: 'Tester' });

    expect(container.textContent).toBe('Xin chào Tester! HT. Viên Minh đang lắng nghe!');
  });

  it('falls back to the first persona for an unknown id', async () => {
    await render({ messages: [], currentPersonaId: 'khong-ton-tai', userName: 'Tester' });

    expect(container.textContent).toBe('Xin chào Tester! Yitam đang lắng nghe!');
  });
});

describe('a conversation with messages', () => {
  const messages: Message[] = [
    { id: 'msg-1', text: 'Xin chào', isBot: false, timestamp: 10 },
    { id: 'msg-2', text: 'Chào bạn', isBot: true, timestamp: 20 },
  ];

  it('shows the messages and no greeting', async () => {
    await render({ messages, currentPersonaId: 'yitam', userName: 'Tester' });

    expect(container.textContent).toContain('Xin chào');
    expect(container.textContent).toContain('Chào bạn');
    expect(container.textContent).not.toContain('đang lắng nghe');
  });
});
