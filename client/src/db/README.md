# Data Schema & Basic Operations Implementation

This directory contains the implementation of the data schema and basic operations for the YITAM chat application (Issue #73).

## Overview

We've built a comprehensive local database system using Dexie.js to manage chat history, providing persistent storage and advanced query capabilities in the browser. The system includes:

1. Core schema definitions (ChatHistoryDB.ts)
2. Utility functions for data operations (ChatHistoryDBUtil.ts)
3. React integration with contexts and hooks
4. Comprehensive documentation (SCHEMA.md, DBSchema.md)

## Advanced Query Features

We've implemented several advanced query capabilities:

### 1. User Activity Statistics

`getUserActivityStats()` provides insights into:
- Message activity by day
- Topic creation patterns
- Active usage hours

```typescript
const stats = await getUserActivityStats(userId, 30); // Last 30 days
console.log(stats.messagesPerDay); // Activity by day
console.log(stats.activeHours); // Most active hours
```

### 2. Message Distribution Analysis

`getMessageDistribution()` provides conversation metrics:
- User vs. assistant message counts
- Average message lengths
- Token usage distribution

```typescript
const metrics = await getMessageDistribution(topicId);
console.log(`User messages: ${metrics.userMessageCount}`);
console.log(`Average user message length: ${metrics.averageUserMessageLength}`);
```

### 3. Related Topics Discovery

`findRelatedTopics()` identifies related conversations:
- Uses word occurrence similarity
- Helps users discover connected topics
- Prioritizes highest similarity matches

```typescript
const related = await findRelatedTopics(currentTopicId, userId, 5);
// Returns top 5 most related topics
```

### 4. Advanced Search

`advancedSearch()` provides fine-grained search capabilities:
- Filter by time range
- Filter by message role
- Exact phrase matching
- Word-based indexing

```typescript
const results = await advancedSearch(query, userId, {
  startDate: oneWeekAgo,
  endDate: now,
  role: 'assistant',
  exact: true
});
```

### 5. Index Management

`reindexTopic()` allows for maintenance of the search index:
- Rebuilds indices for any topic
- Fixes search issues
- Updates indices after schema changes

```typescript
await reindexTopic(topicId); // Rebuilds search indices
```

## Storage Management

We've implemented robust storage management:

1. **Quota Detection**: Monitors browser storage limits
2. **Automatic Cleanup**: Removes oldest conversations when storage is critical
3. **Export/Import**: Allows users to backup and restore conversations

## Error Handling

The implementation includes comprehensive error handling:

1. **Connection Recovery**: Attempts to recover from database errors
2. **Transaction Safety**: Ensures data consistency across operations
3. **Graceful Degradation**: Provides fallbacks when storage is limited

## Usage Examples

### Managing Topics

```typescript
// In a React component
const { topics, createTopic, deleteTopic } = useTopicManagement({ userId });

// Create a new topic
const newTopicId = await createTopic("New Conversation", "System prompt here");

// Delete a topic
await deleteTopic(topicId);
```

### Managing Messages

```typescript
// In a React component
const { messages, addMessage, searchMessages } = useMessageManagement({ topicId });

// Add a new message
await addMessage({
  role: 'user',
  content: 'Hello, world!',
  tokens: 5
});

// Search within current topic
const matches = await searchMessages('world');
```

## Next Steps

The implementation fulfills all requirements for issue #73 and provides a foundation for upcoming issues:

- Topic & Conversation UI Components (#74)
- Message Threading & History Display (#75)
- Word Indexing Implementation (#77)
- Search UI & Functionality (#78)

For detailed schema information, see [SCHEMA.md](./SCHEMA.md). 