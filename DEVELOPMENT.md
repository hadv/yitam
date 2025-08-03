# Development Guide

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Start Development Server

```bash
# Clone and install dependencies
git clone https://github.com/hadv/yitam
cd yitam

# Install server dependencies
cd server
npm install

# Install client dependencies  
cd ../client
npm install

# Start server (uses in-memory cache - no setup required)
cd ../server
npm run dev

# Start client (in another terminal)
cd ../client
npm run dev
```

That's it! No Redis, no Docker, no external dependencies required for development.

## 🧠 Cache System

### Development (Default)
- **In-Memory Cache**: Automatic, no setup required
- **Performance**: Sub-millisecond access times
- **Capacity**: 1,000 conversations (~2MB RAM)
- **Persistence**: Lost on server restart (fine for development)

### Production
- **Memory Cache**: Simple and reliable caching
- **No Dependencies**: No external services required
- **Setup**: See [CACHE_SETUP.md](CACHE_SETUP.md) for details

## 🛠️ Development Features

### Cache Monitoring
Press `Ctrl+Shift+C` in the application to open the cache debug panel:
- Real-time cache statistics
- Memory usage monitoring
- Cache hit/miss rates
- Cache management tools

### API Endpoints
```bash
# Cache statistics
GET http://localhost:5001/api/conversations/cache/stats

# Cache health check
GET http://localhost:5001/api/conversations/cache/health

# Clear cache
DELETE http://localhost:5001/api/conversations/cache/clear
```

### Environment Variables
```bash
# Force specific cache type (optional)
CACHE_TYPE=memory    # Use in-memory cache
CACHE_TYPE=redis     # Use Redis cache

# Redis connection (optional)
REDIS_URL=redis://localhost:6379

# Environment
NODE_ENV=development
```

## 📁 Project Structure

```
yitam/
├── server/                 # Backend server
│   ├── src/
│   │   ├── cache/         # Cache implementations
│   │   │   ├── MemoryCache.ts      # In-memory cache
│   │   │   └── CacheFactory.ts     # Cache management
│   │   ├── db/            # Database layer
│   │   ├── routes/        # API routes
│   │   └── services/      # Business logic
│   └── package.json
├── client/                # Frontend React app
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── services/      # API services
│   │   └── hooks/         # Custom hooks
│   └── package.json
└── docker-compose.yml     # Production deployment
```

## 🔧 Development Workflow

### 1. Code Changes
- Server: Auto-reloads with nodemon
- Client: Hot reload with Vite
- Cache: Automatically managed

### 2. Testing Cache
```bash
# Test in-memory cache (default)
npm run dev

# Test memory cache (default)
npm run dev
```

### 3. Debugging
- **Server logs**: Cache initialization and operations
- **Debug panel**: `Ctrl+Shift+C` for real-time monitoring
- **API endpoints**: Direct cache statistics and health checks

## 🎯 Key Benefits

### Zero Setup Development
- No external dependencies required
- No Docker dependencies
- Instant development environment
- Works offline

### Smart Cache Selection
- Automatic environment detection
- Graceful fallback mechanisms
- Manual override capabilities
- Production-ready scaling

### Developer Experience
- Real-time monitoring tools
- Comprehensive logging
- Easy debugging
- Performance insights

## 🚀 Deployment

### Development
```bash
npm run dev  # Uses in-memory cache automatically
```

### Production
```bash
docker-compose up -d  # Uses Redis with memory fallback
```

## 📊 Performance

### In-Memory Cache
- **Access Time**: < 1ms
- **Memory Usage**: ~2KB per conversation
- **Capacity**: 1,000 conversations
- **Persistence**: Server session only



## 🔍 Troubleshooting

### Common Issues

**Server won't start:**
- Check if port 5001 is available
- Verify Node.js version (18+)

**Cache not working:**
- Check server logs for cache initialization
- Use debug panel (`Ctrl+Shift+C`) for monitoring
- Verify API endpoints respond

**Memory usage high:**
- In-memory cache uses server RAM
- Default limit: 1,000 conversations
- Automatic LRU eviction

### Getting Help

1. **Check logs**: Server console shows cache operations
2. **Debug panel**: Real-time cache monitoring
3. **API health**: `/cache/health` endpoint
4. **Documentation**: [CACHE_SETUP.md](CACHE_SETUP.md) for detailed setup

---

## 🎉 Summary

Development is now **zero-configuration**:
- ✅ No Redis installation required
- ✅ No Docker dependencies  
- ✅ Instant development setup
- ✅ Production-ready scaling
- ✅ Comprehensive monitoring tools

Just run `npm run dev` and start coding! 🚀
