# Chat History Database Implementation

## Overview

This document describes the implementation of the chat history database for the YITAM application. The database is designed to store and efficiently query chat conversations, including topics and individual messages, using Dexie.js as a wrapper for the browser's IndexedDB.

## Core Files

- `ChatHistoryDB.ts`: Defines the database schema, tables, indices, and core database functions
- `ChatHistoryDBUtil.ts`: Implements utility functions for database operations
- `ChatHistoryContext.tsx`: Provides a React context for database access
- `useTopicManagement.ts`: Custom hook for topic CRUD operations
- `useMessageManagement.ts`: Custom hook for message CRUD operations

## Database Schema

### Tables

1. **topics**
   - Primary storage for conversation metadata
   - Contains information about each conversation thread
   - Includes counts and metrics for analytics

2. **messages**
   - Stores individual chat messages
   - Linked to topics via topicId foreign key
   - Contains message content and metadata

3. **wordIndex**
   - Enables full-text search capabilities
   - Maps words to messages for efficient querying
   - Filters common stop words to reduce index size

### Indices

- **topics**: `++id, userId, title, lastActive`
  - Auto-incrementing primary key
  - Fast lookup by user
  - Search by title
  - Sort by activity time

- **messages**: `++id, topicId, timestamp, role, [topicId+timestamp]`
  - Auto-incrementing primary key
  - Fast lookup by topic
  - Chronological ordering
  - Filtering by role (user/assistant)
  - Compound index for topic+time queries

- **wordIndex**: `[word+topicId], word`
  - Compound index for word search within topics
  - General word search across all topics

## Message Storage

Messages are stored with the following fields:

```typescript
export interface Message {
  id?: number;            // Auto-generated ID
  topicId: number;        // Foreign key to parent topic
  timestamp: number;      // Creation time (unix timestamp)
  role: 'user' | 'assistant'; // Message sender role
  content: string;        // Message text content
  type?: string;          // Optional message type
  metadata?: any;         // Optional additional data
  tokens?: number;        // Token count for billing/limits
  modelVersion?: string;  // AI model version used
}
```

Each message is associated with a topic and includes metadata such as token count and model version. The `role` field distinguishes between user and assistant messages, allowing for easy filtering and separate styling.

## Topic Metadata

Topics include metadata to support conversation management:

```typescript
export interface Topic {
  id?: number;            // Auto-generated ID
  userId: string;         // Owner of the conversation
  title: string;          // Topic title
  createdAt: number;      // Creation timestamp
  lastActive: number;     // Last activity timestamp
  messageCnt?: number;    // Total message count
  userMessageCnt?: number; // User message count
  assistantMessageCnt?: number; // Assistant message count
  totalTokens?: number;   // Total token usage
  model?: string;         // AI model used
  systemPrompt?: string;  // System prompt for the topic
  pinnedState?: boolean;  // Whether topic is pinned
}
```

This design allows for:
- Efficient listing of user conversations
- Sorting by recent activity
- Usage tracking
- Model selection persistence

## Search Indexing

Search functionality is implemented using a custom word-based indexing system:

```typescript
export interface WordIndex {
  id?: number;            // Auto-generated ID
  word: string;           // Individual word
  topicId: number;        // Related topic
  messageId: number;      // Message containing the word
}
```

The indexing process:
1. Tokenizes message content into individual words
2. Filters out common stop words (including Vietnamese)
3. Creates entries linking words to messages
4. Supports both general search and topic-specific search

## Transaction Handling

Database operations that affect multiple tables use individual operations instead of transactions due to compatibility issues. However, each set of related operations is carefully structured to maintain data consistency.

## Storage Management

The system includes features to manage browser storage constraints:

1. Storage quota monitoring
2. Automatic cleanup of old conversations when storage is critical
3. Export/import capabilities for data backup

## Error Handling

Error handling is implemented at multiple levels:

1. Database connection and recovery mechanisms
2. Graceful degradation when storage limits are reached
3. Detailed error logging
4. User-friendly error states in the UI components

## Extension Points

The schema is designed with future extensions in mind:

1. Versioning for schema migrations
2. Support for additional message types
3. Extensible metadata for integration with other features

## Performance Considerations

To maintain good performance:

1. Compound indices are used for common query patterns
2. Denormalized data (e.g., message counts in topics) reduces query complexity
3. Pagination is implemented for large result sets
4. Indices are selectively used to balance performance and storage usage 