# Chat History Database Schema Documentation

## Overview

The chat history database is implemented using Dexie.js, a wrapper for IndexedDB that provides a more developer-friendly API. The database is designed to store and efficiently query chat conversations, including topics and individual messages.

## Schema Structure

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

## Design Decisions

### 1. Client-Side Storage

We chose IndexedDB (via Dexie.js) for client-side storage for several reasons:
- Reduces server load and bandwidth usage
- Provides offline capabilities
- Enhances privacy by keeping conversations local
- Allows fast access to conversation history

### 2. Denormalized Schema

The schema includes some denormalized data (message counts in topics) to:
- Improve read performance for common operations
- Reduce the need for aggregate queries
- Enable faster UI updates

### 3. Full-Text Search Implementation

Rather than using built-in full-text search (which has limited browser support):
- We tokenize message content into individual words
- Filter out common stop words to reduce index size
- Create a many-to-many relationship between words and messages
- Use compound indices for efficient filtering

### 4. Transactions

All operations that affect multiple tables use transactions to:
- Ensure data consistency
- Prevent partial updates
- Atomically update related records

## Limitations

### 1. Storage Constraints

IndexedDB is subject to browser storage limits:
- Storage quotas vary by browser and device
- May require cleanup of old conversations
- No built-in compression for large message content

### 2. Search Capabilities

The custom word indexing has limitations:
- No stemming or fuzzy matching
- Limited to exact word matches
- Performance degrades with very large conversations
- No ranking or relevance scoring

### 3. Performance Considerations

Potential performance issues:
- Large result sets can cause UI lag
- Complex queries across multiple tables may be slow
- Index maintenance adds overhead to message storage

### 4. Browser Compatibility

While IndexedDB is widely supported:
- Older browsers may have limited or no support
- Mobile browsers may have stricter storage limits
- Private browsing modes often have separate storage quotas

## Future Improvements

Potential enhancements for the schema:
- Implement data compression for message content
- Add message attachments support
- Implement more sophisticated search algorithms
- Add data partitioning for very active users
- Implement time-based data archiving 