# Yitam Context Engine

## Overview

The Yitam Context Engine is an intelligent conversation memory management system designed to solve the problem of escalating LLM API costs and context window limitations in long conversations. Instead of sending the complete chat history with every request, the Context Engine provides optimized, relevant context that maintains conversation quality while dramatically reducing token usage.

## Key Features

### 🧠 Intelligent Context Management
- **Hierarchical Summarization**: Automatic compression of older messages with configurable compression ratios
- **Importance Scoring**: AI-driven importance assessment for message prioritization
- **Semantic Search**: Vector-based retrieval of relevant historical context
- **Key Facts Extraction**: Persistent storage of important decisions, preferences, and facts

### 💰 Cost Optimization
- **60-80% Token Reduction**: Significant cost savings for long conversations
- **Predictable Context Size**: Consistent token usage regardless of conversation length
- **Smart Caching**: Efficient context caching with configurable expiration

### 🔧 Technical Architecture
- **SQLite Database**: Structured storage for conversation metadata and summaries
- **Vector Database**: Semantic embeddings for intelligent context retrieval
- **MCP Integration**: Model Context Protocol server for LLM-controlled memory
- **In-Memory Caching**: Built-in high-performance caching with no external dependencies

## Quick Start

### 1. Installation

```bash
# Install dependencies
npm install chromadb sqlite3

# Optional: Install vector database
docker run -p 8000:8000 chromadb/chroma
```

### 2. Configuration

Create a `.env` file with your configuration:

```env
# Context Engine Settings
CONTEXT_MAX_RECENT_MESSAGES=10
CONTEXT_MAX_TOKENS=8000
CONTEXT_SUMMARIZATION_THRESHOLD=20

# Vector Store Configuration
VECTOR_STORE_PROVIDER=chromadb
VECTOR_STORE_ENDPOINT=http://localhost:8000
VECTOR_STORE_COLLECTION=yitam_context

# Enable MCP Server
ENABLE_MCP_CONTEXT_SERVER=true
```

### 3. Basic Usage

```typescript
import { EnhancedConversation } from './services/EnhancedConversation';
import { getContextConfig } from './config/contextEngine';

// Initialize enhanced conversation with context engine
const conversation = new EnhancedConversation({
  enableContextEngine: true,
  maxContextTokens: 8000,
  vectorStoreConfig: getContextConfig().vectorStore
});

// Start a new chat
const chatId = await conversation.startNewChat();

// Add messages (automatically managed by context engine)
await conversation.addUserMessage("What's the weather like?");
await conversation.addAssistantMessage("It's sunny and 75°F today.");

// Get optimized context for LLM API call
const optimizedHistory = await conversation.getConversationHistory("Tell me about yesterday's weather");

// The optimized history contains only relevant context, not the full conversation
console.log(`Optimized context: ${optimizedHistory.length} messages`);
```

## Architecture Components

### 1. Context Engine (`ContextEngine.ts`)
The core service that manages conversation segmentation, summarization, and context optimization.

**Key Methods:**
- `getOptimizedContext()`: Returns compressed, relevant context
- `addMessage()`: Stores messages with importance scoring
- `markMessageImportant()`: Manual importance marking
- `addKeyFact()`: Store persistent facts

### 2. Vector Store (`VectorStore.ts`)
Handles semantic embeddings and similarity search for context retrieval.

**Supported Providers:**
- **ChromaDB**: Open-source vector database
- **In-Memory**: For development and testing
- **Qdrant/Pinecone**: (Coming soon)

### 3. Enhanced Conversation (`EnhancedConversation.ts`)
Drop-in replacement for the original Conversation service with context engine integration.

### 4. MCP Context Server (`ContextMCPServer.ts`)
Model Context Protocol server that allows LLMs to manage their own memory.

**Available Tools:**
- `store_memory`: Store important facts
- `retrieve_context`: Get relevant context
- `mark_important`: Mark messages as important
- `search_memory`: Semantic search in conversation
- `get_conversation_stats`: Analytics and metrics

## Database Schema

### Core Tables

```sql
-- Conversation segments with summaries
conversation_segments (
  id, chat_id, start_message_id, end_message_id,
  segment_type, summary, importance_score, token_count
)

-- Message metadata and importance
message_metadata (
  message_id, chat_id, importance_score, semantic_hash,
  entities, topics, user_marked, compression_level
)

-- Context retrieval cache
context_cache (
  cache_key, chat_id, context_data, token_count, expires_at
)

-- Key facts and decisions
key_facts (
  id, chat_id, fact_text, fact_type, importance_score, source_message_id
)
```

## Configuration Options

### Context Engine Settings

```typescript
interface ContextEngineConfig {
  maxRecentMessages: number;        // Always include last N messages (default: 10)
  maxContextTokens: number;         // Maximum context window size (default: 8000)
  summarizationThreshold: number;   // Messages before summarization (default: 20)
  importanceThreshold: number;      // Minimum importance for inclusion (default: 0.3)
  vectorSearchLimit: number;        // Max relevant messages from search (default: 5)
  cacheExpiration: number;          // Cache TTL in minutes (default: 30)
  compressionLevels: {
    medium: number;    // 70% compression for medium-term messages
    long: number;      // 85% compression for long-term messages
    ancient: number;   // 95% compression for ancient messages
  };
}
```

### Vector Store Configuration

```typescript
interface VectorStoreConfig {
  provider: 'chromadb' | 'qdrant' | 'pinecone';
  endpoint?: string;              // Vector DB endpoint
  apiKey?: string;               // API key if required
  collectionName: string;        // Collection for embeddings
  dimension: number;             // Embedding dimension (default: 1536)
  embeddingModel: string;        // Model for generating embeddings
}
```

## Performance Metrics

### Expected Improvements

| Conversation Length | Traditional Tokens | Context Engine Tokens | Savings |
|-------------------|-------------------|---------------------|---------|
| 50 messages       | ~12,000          | ~8,000             | 33%     |
| 100 messages      | ~25,000          | ~8,000             | 68%     |
| 200 messages      | ~50,000          | ~8,000             | 84%     |
| 500+ messages     | ~125,000+        | ~8,000             | 94%+    |

### Context Quality Metrics
- **Relevance Score**: Semantic similarity of retrieved context
- **Compression Ratio**: Percentage of original content preserved
- **Cache Hit Rate**: Efficiency of context caching
- **Processing Time**: Context assembly performance

## MCP Integration

### Starting the MCP Server

```bash
# Start the context MCP server
node dist/mcp/ContextMCPServer.js
```

### Using MCP Tools in LLM Conversations

The LLM can now use context management tools directly:

```
User: "Remember that I prefer morning meetings"
LLM: I'll store that preference for you.
[Uses store_memory tool: factText="User prefers morning meetings", factType="preference"]

User: "What did we discuss about scheduling?"
LLM: Let me search our conversation history.
[Uses search_memory tool: query="scheduling meetings"]
Based on our previous discussion, you mentioned preferring morning meetings...
```

## Development and Testing

### Running Tests

```bash
# Unit tests
npm test

# Integration tests with real vector DB
npm run test:integration

# Performance benchmarks
npm run benchmark
```

### Development Mode

```typescript
import { developmentContextConfig } from './config/contextEngine';

const conversation = new EnhancedConversation({
  ...developmentContextConfig,
  enableContextEngine: true
});
```

## Production Deployment

### Docker Compose Setup

```yaml
version: '3.8'
services:
  yitam-app:
    build: .
    environment:
      - CONTEXT_MAX_TOKENS=12000
      - REDIS_ENABLED=true
      - VECTOR_STORE_PROVIDER=chromadb
    depends_on:
      - chromadb
      - redis

  chromadb:
    image: chromadb/chroma
    ports:
      - "8000:8000"

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
```

### Environment Variables

See `server/src/config/contextEngine.ts` for complete environment variable documentation.

## Monitoring and Analytics

### Built-in Analytics

The Context Engine tracks:
- Token usage and compression ratios
- Context retrieval performance
- Cache hit rates
- Message importance distributions

### Accessing Analytics

```typescript
const stats = await conversation.getConversationStats();
console.log(`Average compression: ${stats.avgCompression}%`);
console.log(`Total segments: ${stats.segmentCount}`);
console.log(`Key facts stored: ${stats.factCount}`);
```

## Troubleshooting

### Common Issues

1. **High Memory Usage**: Reduce `maxContextTokens` or increase `summarizationThreshold`
2. **Poor Context Quality**: Lower `importanceThreshold` or increase `vectorSearchLimit`
3. **Slow Performance**: Enable Redis caching and optimize vector DB configuration

### Debug Mode

```env
DEBUG=yitam:context
CONTEXT_ANALYTICS_ENABLED=true
```

## Roadmap

### Phase 1 ✅
- Core context management
- SQLite database schema
- Basic summarization

### Phase 2 🚧
- Vector database integration
- MCP server implementation
- Enhanced conversation service

### Phase 3 📋
- Advanced compression algorithms
- Multi-language support
- Real-time context streaming

### Phase 4 📋
- Graph-based context relationships
- Federated context sharing
- Advanced analytics dashboard

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT License - see LICENSE file for details.
