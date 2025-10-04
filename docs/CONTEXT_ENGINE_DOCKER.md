# Yitam Context Engine Docker Setup

This document explains how to deploy the Yitam Context Engine using Docker Compose.

## Overview

The Yitam Context Engine provides intelligent conversation context management with:
- **Bayesian Memory Management**: Probabilistic relevance scoring
- **Vector Storage**: Semantic similarity search using embeddings
- **Intelligent Compression**: Hierarchical summarization and context optimization
- **MCP Integration**: Model Context Protocol for enhanced AI capabilities

## Production Deployment

### Prerequisites

1. **Google Gemini API**: For embeddings
   - Update `prod.env` with your Gemini API key:
     ```env
     GEMINI_API_KEY=your-gemini-api-key
     ```

2. **Weaviate Embedded**: No external setup required
   - Runs embedded within the Docker container
   - Data persisted in Docker volume

### Production Setup

```bash
# Build and start production services
docker-compose up --build -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f server

# Stop services
docker-compose down
```

### Configuration Files

- `docker-compose.yml`: Production configuration
- `prod.env`: Production API keys, database settings, and context engine configuration

### Key Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CONTEXT_ENGINE_ENABLED` | Enable/disable context engine | `true` |
| `CONTEXT_MAX_TOKENS` | Maximum context window size | `12000` |
| `CONTEXT_USE_BAYESIAN_MEMORY` | Use Bayesian memory management | `true` |
| `VECTOR_STORE_PROVIDER` | Vector store provider | `weaviate-embedded` |
| `CACHE_TYPE` | Cache type (memory/redis) | `memory` |

## Development Deployment

### Prerequisites

1. **Local Development**: Uses Weaviate Embedded and Redis
2. **No external vector database** required

### Development Setup

```bash
# Build and start development services
docker-compose -f docker-compose.dev.yml up --build -d

# Check status
docker-compose -f docker-compose.dev.yml ps

# View logs
docker-compose -f docker-compose.dev.yml logs -f server

# Stop services
docker-compose -f docker-compose.dev.yml down
```

### Development Services

- **Weaviate Embedded**: Vector database embedded in server container
- **Redis**: Local cache at `redis://localhost:6379`
- **Server**: Development server with hot reload
- **Client**: Development client with hot reload

### Development Features

- **Debug Mode**: Verbose logging and debugging
- **Hot Reload**: Code changes reflected immediately
- **Local Storage**: All data stored locally
- **Faster Testing**: Reduced cache TTL and smaller limits

## Optional Redis Enhancement

For production environments with high load, you can enable Redis caching:

1. **Uncomment Redis service** in `docker-compose.yml`:
   ```yaml
   redis:
     image: redis:7-alpine
     ports:
       - "6379:6379"
     volumes:
       - redis-data:/data
     restart: unless-stopped
   ```

2. **Update environment variables**:
   ```env
   CACHE_TYPE=redis
   REDIS_URL=redis://redis:6379
   ```

3. **Add Redis dependency** to server service:
   ```yaml
   depends_on:
     - yitam-mcp
     - redis
   ```

## Monitoring and Debugging

### Health Checks

```bash
# Check server health
curl http://localhost:3000/health

# Check context engine status
curl http://localhost:3000/api/context/status
```

### Logs

```bash
# Server logs
docker-compose logs -f server

# Context engine specific logs
docker-compose logs -f server | grep "Context"

# Vector store logs
docker-compose logs -f server | grep "Vector"
```

### Performance Monitoring

The context engine includes built-in analytics:
- Context retrieval performance
- Cache hit rates
- Vector search metrics
- Memory usage statistics

## Troubleshooting

### Common Issues

1. **Vector Store Connection Failed**
   - Check Weaviate data directory permissions
   - Verify `VECTOR_STORE_DATA_PATH` is writable

2. **High Memory Usage**
   - Reduce `CACHE_MAX_SIZE` in environment
   - Enable Redis for external caching

3. **Slow Context Retrieval**
   - Increase `CONTEXT_CACHE_EXPIRATION`
   - Optimize `CONTEXT_VECTOR_SEARCH_LIMIT`

4. **Embedding Generation Errors**
   - Verify `GEMINI_API_KEY` is valid
   - Check API quota limits

### Debug Mode

Enable debug mode for detailed logging:

```env
CONTEXT_DEBUG_MODE=true
CONTEXT_VERBOSE_LOGGING=true
```

## Migration from Legacy System

If migrating from the existing conversation system:

1. **Backup existing data**
2. **Enable context engine** with `CONTEXT_ENGINE_ENABLED=true`
3. **Monitor performance** during transition
4. **Gradually increase** context limits as needed

The context engine is designed to work alongside the existing system and can be enabled incrementally.
