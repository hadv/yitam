# Cache Setup Guide

This application supports both **in-memory RAM cache** and **Redis cache** with automatic selection based on environment.

## 🚀 Quick Start (Development)

### Option 1: In-Memory Cache (Recommended for Development)
**No setup required!** Just start the server:

```bash
cd server
npm run dev
```

The server will automatically use in-memory RAM cache. Perfect for development - no Redis installation needed!

### Option 2: Redis Cache (Optional for Development)
If you want to test Redis functionality:

```bash
# Start Redis using Docker (you can use any Redis setup)
docker run -d --name redis-dev -p 6379:6379 redis:7-alpine

# Set Redis URL and start the server
REDIS_URL=redis://localhost:6379 npm run dev
```

## 🎯 Cache Selection Logic

The application automatically chooses the best cache based on your environment:

### Development Environment (`NODE_ENV=development`)
- **Default**: In-memory RAM cache (no setup required)
- **With Redis URL**: Uses Redis if `REDIS_URL` is provided
- **Fallback**: Always falls back to memory cache if Redis fails

### Production Environment (`NODE_ENV=production`)
- **Preferred**: Redis cache for scalability
- **Fallback**: In-memory cache if Redis unavailable
- **Auto-detection**: Uses Redis if `REDIS_URL` is provided

### Manual Override
Set `CACHE_TYPE` environment variable:
```bash
CACHE_TYPE=memory    # Force in-memory cache
CACHE_TYPE=redis     # Force Redis cache
```

## 📊 Cache Comparison

| Feature | In-Memory Cache | Redis Cache |
|---------|----------------|-------------|
| **Setup** | ✅ None required | ⚙️ Redis installation |
| **Performance** | ⚡ Fastest (RAM) | ⚡ Very fast |
| **Persistence** | ❌ Lost on restart | ✅ Persistent |
| **Scalability** | ❌ Single server | ✅ Multi-server |
| **Memory Usage** | 📊 Server RAM | 📊 Redis memory |
| **Development** | ✅ Perfect | ✅ Good for testing |
| **Production** | ⚠️ Limited | ✅ Recommended |

## 🛠️ Configuration

### Environment Variables

```bash
# Cache type (optional)
CACHE_TYPE=memory|redis

# Redis connection (optional)
REDIS_URL=redis://localhost:6379

# Environment
NODE_ENV=development|production
```

### In-Memory Cache Settings

The memory cache is automatically configured with:
- **Max Entries**: 1,000 conversations
- **Default TTL**: 1 hour
- **LRU Eviction**: Automatic cleanup
- **Memory Monitoring**: Built-in usage tracking

### Redis Cache Settings

Redis is configured with:
- **Memory Limit**: 100MB
- **Eviction Policy**: `allkeys-lru`
- **Persistence**: AOF enabled
- **Health Checks**: Automatic monitoring

## 🔍 Monitoring

### Debug Panel (Ctrl+Shift+C)
- **Cache Type**: Shows current cache (memory/redis)
- **Statistics**: Hit rates, memory usage, key counts
- **Health Status**: Connection and performance metrics
- **Management**: Clear cache, view entries

### API Endpoints
```bash
# Get cache info and statistics
GET /api/conversations/cache/stats

# Check cache health
GET /api/conversations/cache/health

# Clear cache
DELETE /api/conversations/cache/clear
```

### Console Logs
The server logs show cache initialization:
```
[CacheFactory] Development environment - using memory cache (no Redis required)
[MemoryCache] In-memory cache initialized
Cache type: memory (development environment)
Cache status: Available (memory)
```

## 🚀 Performance

### In-Memory Cache Performance
- **Access Time**: < 1ms (direct RAM access)
- **Memory Usage**: ~2KB per conversation
- **Capacity**: 1,000 conversations ≈ 2MB RAM
- **Hit Rate**: 90%+ for active conversations

### Redis Cache Performance
- **Access Time**: 1-5ms (network + Redis)
- **Memory Usage**: Configurable (default 100MB)
- **Capacity**: Thousands of conversations
- **Hit Rate**: 95%+ with persistence

## 🔄 Migration Between Cache Types

The application seamlessly switches between cache types:

1. **Memory → Redis**: Start Redis, restart server
2. **Redis → Memory**: Stop Redis, server auto-falls back
3. **No Data Loss**: Database always has the source of truth

## 🧪 Testing

### Test In-Memory Cache
```bash
# Start server (uses memory cache by default)
npm run dev

# Check cache type
curl http://localhost:5001/api/conversations/cache/health
```

### Test Redis Cache
```bash
# Start Redis (simple Docker command)
docker run -d --name redis-dev -p 6379:6379 redis:7-alpine

# Set Redis URL and start server
REDIS_URL=redis://localhost:6379 npm run dev

# Verify Redis is being used
curl http://localhost:5001/api/conversations/cache/health
```

### Test Fallback
```bash
# Start with Redis
REDIS_URL=redis://localhost:6379 npm run dev

# Stop Redis while server is running
docker stop redis-dev

# Server continues with memory cache fallback
```

## 🎯 Recommendations

### For Development
- **Use in-memory cache** (default) - no setup required
- **Fast development cycle** with instant cache
- **Easy debugging** with built-in monitoring

### For Production
- **Use Redis cache** for scalability
- **Persistent cache** survives server restarts
- **Multi-server support** for load balancing

### For Testing
- **Memory cache** for unit tests (fast, isolated)
- **Redis cache** for integration tests (realistic)

## 🔧 Troubleshooting

### Memory Cache Issues
- **High Memory Usage**: Reduce max entries or TTL
- **Cache Misses**: Check if conversations are expiring
- **Performance**: Memory cache should be fastest

### Redis Connection Issues
- **Connection Failed**: Check if Redis is running
- **Timeout**: Verify network connectivity
- **Fallback**: Server automatically uses memory cache

### General Issues
- **Check Logs**: Server logs show cache initialization
- **Debug Panel**: Use Ctrl+Shift+C for real-time monitoring
- **API Health**: Use `/cache/health` endpoint for diagnostics

---

## 🎉 Summary

- **Development**: In-memory cache (no setup) ✅
- **Production**: Redis cache (scalable) ✅
- **Automatic**: Smart cache selection ✅
- **Fallback**: Always works ✅

The cache system is designed to be **zero-configuration for development** while providing **production-grade performance** when needed!
