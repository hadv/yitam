# Cache Setup for Yitam

This document explains the in-memory caching system for shared conversations. Redis has been removed in favor of a simpler memory-based cache.

## 🚀 Quick Start

### Development Environment

```bash
cd server
npm run dev
```
The server uses in-memory cache - no setup required!

### Production Environment

The application uses in-memory cache in all environments. No external cache service is required.

## 🔧 Configuration

### Environment Variables

- `NODE_ENV`: Set to `production` for production optimizations

### Memory Cache Configuration

The memory cache is configured with:
- **Memory Limit**: 1000 entries (configurable)
- **Eviction Policy**: LRU (Least Recently Used)
- **Default TTL**: 1 hour
- **Cleanup**: Automatic cleanup every 5 minutes

## 📊 Cache Behavior

### What Gets Cached

- **Shared Conversations**: Full conversation data including messages
- **Cache Duration**: 1 hour default, or until conversation expiration
- **Automatic Cleanup**: Expired conversations are automatically removed

### Cache Storage

- **In-Memory Map**: Conversations stored in JavaScript Map object
- **LRU Tracking**: Access order maintained for eviction
- **TTL Management**: Automatic expiration handling

### Cache Invalidation

Conversations are automatically removed from cache when:
- Conversation is unshared by owner
- Conversation expires
- Manual cache clear is triggered

## 🛠️ Management Tools

### Debug Panel (Application)

Press `Ctrl+Shift+C` in the application to open the cache debug panel:

- **Server Cache Stats**: Memory usage, hit rates, entry counts
- **Client Cache Stats**: Local browser cache statistics
- **Health Monitoring**: Cache status and performance
- **Cache Management**: Clear server or client cache

## 📈 Performance Benefits

### Server-Side Caching

- **Global Sharing**: All users benefit from cached conversations
- **Reduced Database Load**: 90%+ reduction in database queries
- **Fast Response Times**: Sub-millisecond cache hits
- **Memory Efficiency**: LRU eviction prevents memory bloat

### Reliability

The memory cache provides reliable operation:
- **Always Available**: No external dependencies to fail
- **Automatic Cleanup**: Expired entries are automatically removed
- **Graceful Degradation**: Falls back to database when cache is full

## 🔍 Monitoring

### Health Checks

```bash
# Check cache health
curl http://localhost:5001/api/conversations/cache/health

# Get cache statistics
curl http://localhost:5001/api/conversations/cache/stats
```

### Key Metrics

- **Hit Rate**: Percentage of requests served from cache
- **Memory Usage**: Current Redis memory consumption
- **Key Count**: Number of cached conversations
- **Latency**: Redis response time

## 🛡️ Security

### Access Control

- Redis is not exposed to the public internet
- Only the application server can access Redis
- No authentication required for local development
- Production should use Redis AUTH if needed

### Data Privacy

- Only public shared conversations are cached
- Private conversations are never cached
- Cache automatically respects conversation expiration
- Manual cache clearing available for privacy compliance

## 🚨 Troubleshooting

### Cache Issues

1. **Check cache health:**
   ```bash
   curl http://localhost:5001/api/conversations/cache/health
   ```

2. **Check cache hit rate:**
   ```bash
   curl http://localhost:5001/api/conversations/cache/stats
   ```

3. **Clear cache if needed:**
   ```bash
   curl -X DELETE http://localhost:5001/api/conversations/cache/clear
   ```

4. **Monitor server logs:**
   ```bash
   # Check for cache-related messages in server output
   npm run dev | grep -i cache
   ```

### Common Solutions

- **High Memory Usage**: Reduce cache TTL or increase max entries limit
- **Low Hit Rate**: Increase cache TTL or check for frequent cache invalidations
- **Performance Issues**: Monitor cache size and cleanup frequency

## 📝 Development Notes

### Local Development

- Memory cache data is lost on server restart
- Debug panel shows real-time cache statistics
- No external dependencies required

### Testing

- Cache behavior can be tested using the debug panel
- Manual cache operations available via API endpoints
- Cache is automatically reset on server restart

### Deployment

- Memory cache scales with available server RAM
- No external services required
- Simple and reliable operation

## 🔄 Migration Notes

### From Redis to Memory Cache

The system now uses:
- **Server-Side**: In-memory cache for simplicity
- **Client-Side**: localStorage for local optimization (secondary)

This provides:
- Simplified deployment (no Redis required)
- Reduced infrastructure complexity
- Better development experience
- Automatic cleanup and memory management
