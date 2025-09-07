# Weaviate Embedded Setup Guide

## Overview

Weaviate Embedded allows you to run a vector database directly within your application without requiring a separate server. This is perfect for development and production deployments where you want to minimize infrastructure complexity.

## Benefits of Weaviate Embedded

✅ **No External Server Required** - Runs embedded in your Node.js application  
✅ **Zero Configuration** - No Docker or separate installation needed  
✅ **Automatic Management** - Starts and stops with your application  
✅ **Persistent Storage** - Data is stored locally and persists between restarts  
✅ **Full Weaviate Features** - Access to all Weaviate capabilities including hybrid search  
✅ **Production Ready** - Suitable for production deployments  

## Quick Setup

### 1. Install Dependencies

```bash
cd server
npm install weaviate-ts-embedded uuid
```

### 2. Configure Environment

Add to your `.env` file:

```env
# Vector Store Configuration
VECTOR_STORE_PROVIDER=weaviate-embedded
VECTOR_STORE_COLLECTION=yitam_context
VECTOR_STORE_DIMENSION=768
VECTOR_STORE_DATA_PATH=./data/weaviate
EMBEDDING_MODEL=gemini-embedding-001

# Google Cloud API Key (for embeddings)
GOOGLE_CLOUD_API_KEY=your_google_cloud_api_key_here
```

### 3. Update Your Context Engine

Your existing context engine will automatically use Weaviate Embedded:

```typescript
import { ContextEngine } from './services/ContextEngine';

const contextEngine = new ContextEngine({
  maxRecentMessages: 10,
  maxContextTokens: 8000,
  summarizationThreshold: 20,
  importanceThreshold: 0.3,
  vectorSearchLimit: 5,
  cacheExpiration: 30
});

// The context engine will automatically use Weaviate Embedded
// based on your VECTOR_STORE_PROVIDER environment variable
```

## Testing

Run the test to verify everything works:

```bash
cd server
npm run test:weaviate
```

## Data Storage

Weaviate Embedded stores data in the directory specified by `VECTOR_STORE_DATA_PATH` (default: `./data/weaviate`).

**Important:** Make sure to backup this directory in production!

## Performance

- **Startup Time**: ~2-3 seconds for initial startup
- **Memory Usage**: ~50-100MB base memory
- **Storage**: Efficient binary storage format
- **Search Speed**: Sub-100ms for most queries

## Migration from ChromaDB/Qdrant

To migrate from ChromaDB or Qdrant to Weaviate Embedded:

1. **Stop your application**
2. **Update environment variables**:
   ```env
   VECTOR_STORE_PROVIDER=weaviate-embedded
   ```
3. **Restart your application**
4. **Your existing embeddings will be recreated automatically**

## Production Considerations

### Backup Strategy
```bash
# Backup Weaviate data
tar -czf weaviate-backup-$(date +%Y%m%d).tar.gz ./data/weaviate/
```

### Monitoring
- Monitor the `./data/weaviate/` directory size
- Watch application memory usage
- Set up log monitoring for Weaviate startup/shutdown

### Scaling
- For high-traffic applications, consider using external Weaviate cluster
- Weaviate Embedded is suitable for most production workloads
- Can handle millions of vectors efficiently

## Troubleshooting

### Common Issues

**Port conflicts:**
- Weaviate Embedded uses port 6666 internally
- This is handled automatically and shouldn't conflict with your application

**Startup failures:**
- Check disk space in the data directory
- Ensure write permissions for the data directory
- Check logs for specific error messages

**Performance issues:**
- Increase memory allocation if handling large datasets
- Consider SSD storage for better performance
- Monitor vector cache hit rates

### Debug Mode

Enable debug logging:

```env
LOG_LEVEL=debug
```

## Advanced Configuration

### Custom Embedding Models

You can use different embedding models:

```env
# OpenAI embeddings
EMBEDDING_MODEL=text-embedding-ada-002

# Cohere embeddings  
EMBEDDING_MODEL=embed-english-v2.0

# Google Gemini embeddings (default)
EMBEDDING_MODEL=gemini-embedding-001
```

### Vector Dimensions

Adjust based on your embedding model:

```env
# OpenAI ada-002: 1536 dimensions
VECTOR_STORE_DIMENSION=1536

# Google Gemini: 768 dimensions (default)
VECTOR_STORE_DIMENSION=768
```

## Support

For issues specific to Weaviate Embedded:
1. Check the [Weaviate documentation](https://docs.weaviate.io/)
2. Review application logs
3. Test with the provided test script
4. Check GitHub issues for known problems

## Next Steps

- ✅ **You're ready to use Weaviate Embedded!**
- Consider exploring Weaviate's hybrid search capabilities
- Set up monitoring and backup procedures
- Optimize embedding models for your use case
