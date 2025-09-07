# Yitam Context Engine Integration Guide

## Overview

This guide explains how to integrate the Yitam Context Engine into your existing Yitam application to reduce LLM API costs and improve conversation management.

## Integration Steps

### 1. Install Dependencies

```bash
cd server
npm install chromadb
```

### 2. Environment Configuration

Add these variables to your `.env` file:

```env
# Context Engine Configuration
CONTEXT_MAX_RECENT_MESSAGES=10
CONTEXT_MAX_TOKENS=8000
CONTEXT_SUMMARIZATION_THRESHOLD=20
CONTEXT_IMPORTANCE_THRESHOLD=0.3
CONTEXT_VECTOR_SEARCH_LIMIT=5
CONTEXT_CACHE_EXPIRATION=30

# Vector Store Configuration
VECTOR_STORE_PROVIDER=chromadb
VECTOR_STORE_ENDPOINT=http://localhost:8000
VECTOR_STORE_COLLECTION=yitam_context
VECTOR_STORE_DIMENSION=768
EMBEDDING_MODEL=gemini-embedding-001

# Memory Cache Configuration
MEMORY_CACHE_ENABLED=true
MEMORY_CACHE_MAX_SIZE=1000
MEMORY_CACHE_TTL_MINUTES=30

# Optional: MCP Context Server
ENABLE_MCP_CONTEXT_SERVER=true
MCP_CONTEXT_SERVER_PORT=3001
```

### 3. Database Setup

The Context Engine will automatically create its database tables on first run. The database file will be created at:
- `server/data/context_engine.db`

### 4. Replace Conversation Service

#### Option A: Drop-in Replacement (Recommended)

Replace the existing `Conversation` service with `EnhancedConversation`:

```typescript
// Before (in Query.ts or MCPClient.ts)
import { Conversation } from './services/Conversation';

// After
import { EnhancedConversation } from './services/EnhancedConversation';
import { getContextConfig } from './config/contextEngine';

// Initialize with context engine
const conversation = new EnhancedConversation({
  enableContextEngine: true,
  maxContextTokens: 8000,
  vectorStoreConfig: getContextConfig().vectorStore
});
```

#### Option B: Gradual Migration

Keep both services and gradually migrate:

```typescript
import { Conversation } from './services/Conversation';
import { EnhancedConversation } from './services/EnhancedConversation';

class QueryService {
  private conversation: Conversation;
  private enhancedConversation: EnhancedConversation;
  private useContextEngine: boolean;

  constructor() {
    this.conversation = new Conversation();
    this.enhancedConversation = new EnhancedConversation({
      enableContextEngine: process.env.ENABLE_CONTEXT_ENGINE === 'true'
    });
    this.useContextEngine = process.env.ENABLE_CONTEXT_ENGINE === 'true';
  }

  async getConversationHistory(query?: string) {
    if (this.useContextEngine) {
      return await this.enhancedConversation.getConversationHistory(query);
    } else {
      return this.conversation.getConversationHistory();
    }
  }
}
```

### 5. Update Query Service

Modify your `Query.ts` to use optimized context:

```typescript
// In processQuery method, replace:
const messages = this.conversation.getConversationHistory();

// With:
const messages = await this.conversation.getConversationHistory(query);
```

This single change enables context optimization based on the current query.

### 6. Optional: Vector Database Setup

#### ChromaDB (Recommended for development)

```bash
# Using Docker
docker run -p 8000:8000 chromadb/chroma

# Or install locally
pip install chromadb
chroma run --host localhost --port 8000
```

#### In-Memory Cache (Built-in)

The Context Engine uses an efficient in-memory cache by default - no external dependencies required! The cache automatically:
- Manages memory usage with configurable limits
- Expires old entries automatically
- Provides LRU eviction when full
- Tracks hit/miss statistics

### 7. Enable MCP Context Server (Optional)

The MCP Context Server allows LLMs to manage their own memory:

```typescript
// In your main server file
import { ContextMCPServer } from './mcp/ContextMCPServer';

const contextMCPServer = new ContextMCPServer();
await contextMCPServer.start();
```

## Testing the Integration

### 1. Run the Test Script

```bash
cd server
npm run build
node dist/scripts/testContextEngine.js
```

### 2. Monitor Context Usage

Add logging to see context optimization in action:

```typescript
const optimizedHistory = await conversation.getConversationHistory(query);
console.log(`Context optimized: ${optimizedHistory.length} messages`);

const stats = await conversation.getConversationStats();
console.log(`Compression ratio: ${(stats.avgCompression * 100).toFixed(1)}%`);
```

### 3. Test Long Conversations

Create a conversation with 50+ messages and observe:
- Token usage reduction
- Response quality maintenance
- Context relevance

## Configuration Options

### Context Engine Tuning

```typescript
// Conservative (higher quality, less compression)
const conservativeConfig = {
  maxRecentMessages: 15,
  maxContextTokens: 12000,
  summarizationThreshold: 30,
  importanceThreshold: 0.2
};

// Aggressive (higher compression, lower costs)
const aggressiveConfig = {
  maxRecentMessages: 5,
  maxContextTokens: 4000,
  summarizationThreshold: 10,
  importanceThreshold: 0.5
};
```

### Vector Store Options

```typescript
// In-memory (development)
vectorStoreConfig: {
  provider: 'chromadb',
  collectionName: 'yitam_dev',
  dimension: 768  // Google Gemini embedding dimension
}

// Production
vectorStoreConfig: {
  provider: 'chromadb',
  endpoint: 'https://your-chromadb-instance.com',
  collectionName: 'yitam_prod',
  dimension: 768,  // Google Gemini embedding dimension
  apiKey: process.env.CHROMADB_API_KEY
}
```

## Monitoring and Analytics

### Built-in Metrics

```typescript
// Get conversation statistics
const stats = await conversation.getConversationStats();
console.log({
  totalMessages: stats.totalMessages,
  totalTokens: stats.totalTokens,
  segmentCount: stats.segmentCount,
  factCount: stats.factCount,
  avgCompression: stats.avgCompression
});
```

### Custom Analytics

```typescript
// Track token savings
const fullHistory = await conversation.getConversationHistory();
const optimizedHistory = await conversation.getConversationHistory(query);

const savings = ((fullHistory.length - optimizedHistory.length) / fullHistory.length * 100);
console.log(`Message reduction: ${savings.toFixed(1)}%`);
```

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Reduce `maxContextTokens`
   - Increase `summarizationThreshold`
   - Enable Redis caching

2. **Poor Context Quality**
   - Lower `importanceThreshold`
   - Increase `vectorSearchLimit`
   - Use conservative configuration

3. **Slow Performance**
   - Enable Redis caching
   - Use in-memory vector store for development
   - Optimize vector database configuration

### Debug Mode

```env
DEBUG=yitam:context
CONTEXT_ANALYTICS_ENABLED=true
```

### Health Checks

```typescript
// Check if context engine is working
const isWorking = await conversation.getConversationStats();
if (!isWorking.totalMessages) {
  console.warn('Context engine may not be initialized');
}
```

## Migration Checklist

- [ ] Install dependencies (`chromadb`)
- [ ] Add environment variables
- [ ] Start vector database (ChromaDB)
- [ ] Replace Conversation with EnhancedConversation
- [ ] Update Query service to use optimized context
- [ ] Test with long conversations
- [ ] Monitor token usage and compression ratios
- [ ] Optional: Enable MCP Context Server

## Performance Expectations

### Token Reduction

| Conversation Length | Expected Savings |
|-------------------|------------------|
| 20-50 messages    | 30-50%          |
| 50-100 messages   | 60-75%          |
| 100+ messages     | 80-90%          |

### Response Time

- Context retrieval: < 100ms (with caching)
- Vector search: < 200ms (ChromaDB local)
- Compression: < 50ms per segment

## Production Deployment

### Docker Compose

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
    volumes:
      - chromadb_data:/chroma/chroma

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  chromadb_data:
  redis_data:
```

### Scaling Considerations

- **Vector Database**: Use managed ChromaDB or Qdrant for production
- **Memory Management**: Monitor cache hit rates and adjust cache size
- **Database Sharding**: Split context data by user/tenant
- **Monitoring**: Set up alerts for compression ratios and performance

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the test script output
3. Enable debug logging
4. Check database connectivity
5. Verify environment configuration
