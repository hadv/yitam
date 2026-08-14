# Chat history persistence

Everything the app persists about conversations lives behind one interface:
`ChatHistoryStore`. This directory owns the implementation; the rest of the client
knows only the interface.

## The boundary

```
client/src/db/
├── ChatHistoryStore.ts          the interface + domain types (no Dexie anywhere)
├── DexieChatHistoryStore.ts     the implementation the app ships
├── InMemoryChatHistoryStore.ts  the implementation tests use
├── searchTokenizer.ts           shared tokenisation, so both search alike
├── index.ts                     the barrel — the only entry point from outside
├── ChatHistoryDB.ts             Dexie schema (private)
└── ChatHistoryDBUtil.ts         Dexie helpers (private)
```

**Nothing outside this directory imports `ChatHistoryDB` or any other module in
here.** Import the barrel instead:

```typescript
import type { Topic, Message } from '../db';
```

`scripts/check-db-boundary.sh` enforces this in CI. If it fails, the fix is to add
what you need to `ChatHistoryStore`, not to reach past the barrel.

## Getting a store

In React, take it from the context:

```typescript
import { useChatHistoryStore } from '../contexts/ChatHistoryContext';

const store = useChatHistoryStore();
const topics = await store.listTopics(userId);
```

Outside React, accept a `ChatHistoryStore` as an argument — that keeps the caller
testable. `chatHistoryStore` (the Dexie-backed singleton) is exported from the
barrel for the rare case that has nowhere to inject one.

`ChatHistoryProvider` takes an optional `store` prop, which is how a test or a
future storage engine swaps the implementation for the whole tree.

## What the store does for you

The defensive machinery that used to be spread across call sites now lives in one
place, so callers get it without asking:

- `appendMessage()` writes the message, rolls the topic's counters forward, and
  indexes the content for search. If the Dexie write fails it retries through a raw
  IndexedDB transaction rather than losing the message.
- `deleteMessage()` tries several deletion strategies and verifies the message is
  actually gone before reporting success.
- `deleteTopic()` cascades to the topic's messages and word index entries.
- `searchMessages()` uses the word index and falls back to a content scan when the
  index cannot answer — callers do not need their own fallback.
- `recountTopic()` rebuilds a topic's cached counters from the messages actually
  stored, and drops the topic if there are none.

## Search

The word index is a hand-rolled inverted index over `wordIndex`. Tokenisation lives
in `searchTokenizer.ts` and is tuned for Vietnamese: a two-character minimum, a
forty-character maximum for compound words, and a Vietnamese stop-word list.

`searchMessages(userId, query, { filters, limit })` supports date ranges, a role
filter, and `exact: true` for literal phrase matching.

## Tests

`__tests__/chatHistoryStoreContract.ts` holds the behaviour every implementation
must exhibit. Both `DexieChatHistoryStore` (against `fake-indexeddb`) and
`InMemoryChatHistoryStore` run it:

```bash
cd client && npm test
```

A new implementation is finished when it passes that suite. If it cannot, either
the implementation is wrong or the contract needs renegotiating — deciding which is
the point of having the file.

## Schema

For table definitions, indices, and migration history, see [SCHEMA.md](./SCHEMA.md).
