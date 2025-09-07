# Yitam Context Engine Design

## Overview
The Yitam Context Engine is designed to solve the problem of inefficient context management in long conversations, reducing LLM API costs while maintaining conversation quality and coherence.

## Current Problem
- Complete chat history sent to LLM API on every message
- Linear cost growth with conversation length
- No intelligent context filtering or compression
- Risk of exceeding LLM context windows

## Architecture Components

### 1. Storage Layer
- **SQLite**: Conversation metadata, summaries, importance scores
- **Vector DB**: Semantic embeddings for context retrieval
- **Redis**: Fast context caching and session management
- **MCP Integration**: LLM-controlled memory management

### 2. Context Compression Strategies

#### Hierarchical Summarization
```
Recent (Last 10 messages)     → Full Context (100% detail)
Medium-term (11-50 messages)  → Detailed Summaries (70% compression)
Long-term (51-100 messages)   → High-level Summaries (85% compression)
Ancient (100+ messages)       → Key Facts Only (95% compression)
```

#### Importance Scoring Algorithm
```typescript
importance_score = (
  recency_weight * recency_score +
  semantic_weight * semantic_relevance +
  entity_weight * entity_importance +
  user_weight * user_marked_importance
)
```

### 3. Database Schema

#### Context Management Tables
```sql
-- Conversation segments with summaries
CREATE TABLE conversation_segments (
  id INTEGER PRIMARY KEY,
  chat_id TEXT NOT NULL,
  start_message_id INTEGER,
  end_message_id INTEGER,
  segment_type TEXT, -- 'recent', 'medium', 'long', 'ancient'
  summary TEXT,
  importance_score REAL,
  token_count INTEGER,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Message importance and metadata
CREATE TABLE message_metadata (
  message_id INTEGER PRIMARY KEY,
  chat_id TEXT NOT NULL,
  importance_score REAL,
  semantic_hash TEXT,
  entities JSON, -- extracted named entities
  topics JSON,   -- identified topics
  user_marked BOOLEAN DEFAULT FALSE,
  compression_level INTEGER, -- 0=full, 1-5=increasing compression
  created_at TIMESTAMP
);

-- Context retrieval cache
CREATE TABLE context_cache (
  cache_key TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  context_data JSON,
  token_count INTEGER,
  expires_at TIMESTAMP,
  created_at TIMESTAMP
);

-- Vector embeddings metadata
CREATE TABLE embeddings_metadata (
  id INTEGER PRIMARY KEY,
  message_id INTEGER,
  segment_id INTEGER,
  embedding_type TEXT, -- 'message', 'segment', 'summary'
  vector_id TEXT, -- reference to vector DB
  created_at TIMESTAMP
);
```

### 4. Context Retrieval Algorithm

#### Smart Context Assembly
1. **Always include**: Last N messages (configurable, default 10)
2. **Semantic search**: Find relevant older messages using vector similarity
3. **Importance filtering**: Include high-importance messages regardless of age
4. **Summary injection**: Add compressed summaries for excluded segments
5. **Token budget management**: Respect LLM context window limits

#### Context Window Management
```typescript
interface ContextWindow {
  recentMessages: Message[];      // Last 10 messages (full)
  relevantHistory: Message[];     // Semantically relevant older messages
  summaries: ConversationSummary[]; // Compressed older segments
  keyFacts: KeyFact[];           // Important extracted facts
  totalTokens: number;           // Total context size
}
```

### 5. MCP Integration

#### Context Management Tools
- `store_memory`: Store important facts/decisions
- `retrieve_context`: Get relevant context for current query
- `summarize_conversation`: Create conversation summaries
- `mark_important`: Mark messages as important
- `forget_context`: Remove irrelevant old context

### 6. Implementation Phases

#### Phase 1: Core Infrastructure
- Database schema setup
- Basic message segmentation
- Simple summarization

#### Phase 2: Vector Integration
- Vector database setup (ChromaDB)
- Embedding generation for messages
- Semantic similarity search

#### Phase 3: Advanced Compression
- Hierarchical summarization
- Importance scoring algorithm
- Context window optimization

#### Phase 4: MCP Integration
- MCP server for context management
- LLM-controlled memory operations
- Self-managing context system

#### Phase 5: Analytics & Optimization
- Context usage analytics
- Compression ratio monitoring
- Performance optimization

### 7. Expected Benefits

#### Cost Reduction
- 60-80% reduction in token usage for long conversations
- Predictable context size regardless of conversation length
- Efficient use of LLM context windows

#### Quality Improvement
- Relevant context retrieval
- Maintained conversation coherence
- Important information preservation

#### Scalability
- Support for very long conversations (1000+ messages)
- Efficient storage and retrieval
- Real-time context assembly

### 8. Configuration Options

```typescript
interface ContextEngineConfig {
  maxRecentMessages: number;        // Default: 10
  maxContextTokens: number;         // Default: 8000
  summarizationThreshold: number;   // Messages before summarization
  importanceThreshold: number;      // Minimum importance score
  vectorSearchLimit: number;        // Max relevant messages to retrieve
  cacheExpiration: number;          // Context cache TTL
  compressionLevels: {
    medium: number;    // 70% compression
    long: number;      // 85% compression  
    ancient: number;   // 95% compression
  };
}
```

## Next Steps
1. Implement core database schema
2. Create basic message segmentation
3. Add vector database integration
4. Develop context retrieval algorithm
5. Create MCP server integration
6. Test with long conversations
7. Optimize based on performance metrics
