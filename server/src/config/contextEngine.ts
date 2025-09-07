import { ContextEngineConfig } from '../services/ContextEngine';
import { VectorStoreConfig } from '../services/VectorStore';

export interface YitamContextConfig {
  contextEngine: ContextEngineConfig;
  vectorStore: VectorStoreConfig;
  enableMCPServer: boolean;
  mcpServerPort?: number;
  memoryCache: {
    enabled: boolean;
    maxSize: number; // Maximum number of cached items
    ttlMinutes: number; // Time to live in minutes
  };
  analytics: {
    enabled: boolean;
    retentionDays: number;
  };
}

/**
 * Default configuration for Yitam Context Engine
 */
export const defaultContextConfig: YitamContextConfig = {
  contextEngine: {
    maxRecentMessages: parseInt(process.env.CONTEXT_MAX_RECENT_MESSAGES || '10'),
    maxContextTokens: parseInt(process.env.CONTEXT_MAX_TOKENS || '8000'),
    summarizationThreshold: parseInt(process.env.CONTEXT_SUMMARIZATION_THRESHOLD || '20'),
    importanceThreshold: parseFloat(process.env.CONTEXT_IMPORTANCE_THRESHOLD || '0.3'),
    vectorSearchLimit: parseInt(process.env.CONTEXT_VECTOR_SEARCH_LIMIT || '5'),
    cacheExpiration: parseInt(process.env.CONTEXT_CACHE_EXPIRATION || '30'),
    useBayesianMemory: process.env.CONTEXT_USE_BAYESIAN_MEMORY !== 'false', // Default: true
    compressionLevels: {
      medium: parseFloat(process.env.CONTEXT_COMPRESSION_MEDIUM || '0.7'),
      long: parseFloat(process.env.CONTEXT_COMPRESSION_LONG || '0.85'),
      ancient: parseFloat(process.env.CONTEXT_COMPRESSION_ANCIENT || '0.95')
    }
  },
  
  vectorStore: {
    provider: (process.env.VECTOR_STORE_PROVIDER as 'chromadb' | 'qdrant' | 'pinecone' | 'weaviate-embedded') || 'chromadb',
    endpoint: process.env.VECTOR_STORE_ENDPOINT || 'http://localhost:8000',
    apiKey: process.env.VECTOR_STORE_API_KEY,
    collectionName: process.env.VECTOR_STORE_COLLECTION || 'yitam_context',
    dimension: parseInt(process.env.VECTOR_STORE_DIMENSION || '768'),
    embeddingModel: process.env.EMBEDDING_MODEL || 'gemini-embedding-001',
    dataPath: process.env.VECTOR_STORE_DATA_PATH || './data/weaviate'
  },
  
  enableMCPServer: process.env.ENABLE_MCP_CONTEXT_SERVER === 'true',
  mcpServerPort: parseInt(process.env.MCP_CONTEXT_SERVER_PORT || '3001'),
  
  memoryCache: {
    enabled: process.env.MEMORY_CACHE_ENABLED !== 'false',
    maxSize: parseInt(process.env.MEMORY_CACHE_MAX_SIZE || '1000'),
    ttlMinutes: parseInt(process.env.MEMORY_CACHE_TTL_MINUTES || '30')
  },
  
  analytics: {
    enabled: process.env.CONTEXT_ANALYTICS_ENABLED !== 'false',
    retentionDays: parseInt(process.env.CONTEXT_ANALYTICS_RETENTION_DAYS || '30')
  }
};

/**
 * Get context configuration with environment overrides
 */
export function getContextConfig(overrides?: Partial<YitamContextConfig>): YitamContextConfig {
  return {
    ...defaultContextConfig,
    ...overrides,
    contextEngine: {
      ...defaultContextConfig.contextEngine,
      ...overrides?.contextEngine
    },
    vectorStore: {
      ...defaultContextConfig.vectorStore,
      ...overrides?.vectorStore
    },
    memoryCache: {
      ...defaultContextConfig.memoryCache,
      ...overrides?.memoryCache
    },
    analytics: {
      ...defaultContextConfig.analytics,
      ...overrides?.analytics
    }
  };
}

/**
 * Validate context configuration
 */
export function validateContextConfig(config: YitamContextConfig): string[] {
  const errors: string[] = [];
  
  // Validate context engine config
  if (config.contextEngine.maxRecentMessages < 1) {
    errors.push('maxRecentMessages must be at least 1');
  }
  
  if (config.contextEngine.maxContextTokens < 1000) {
    errors.push('maxContextTokens must be at least 1000');
  }
  
  if (config.contextEngine.summarizationThreshold < 5) {
    errors.push('summarizationThreshold must be at least 5');
  }
  
  if (config.contextEngine.importanceThreshold < 0 || config.contextEngine.importanceThreshold > 1) {
    errors.push('importanceThreshold must be between 0 and 1');
  }
  
  // Validate vector store config
  if (!['chromadb', 'qdrant', 'pinecone'].includes(config.vectorStore.provider)) {
    errors.push('vectorStore.provider must be one of: chromadb, qdrant, pinecone');
  }
  
  if (config.vectorStore.dimension < 100) {
    errors.push('vectorStore.dimension must be at least 100');
  }
  
  // Validate compression levels (legacy - only if provided)
  if (config.contextEngine.compressionLevels) {
    const { medium, long, ancient } = config.contextEngine.compressionLevels;
    if (medium < 0 || medium > 1 || long < 0 || long > 1 || ancient < 0 || ancient > 1) {
      errors.push('compression levels must be between 0 and 1');
    }

    if (medium >= long || long >= ancient) {
      errors.push('compression levels must be increasing: medium < long < ancient');
    }
  }
  
  return errors;
}

/**
 * Environment variables documentation
 */
export const environmentVariables = {
  // Context Engine
  CONTEXT_MAX_RECENT_MESSAGES: 'Maximum number of recent messages to include in full (default: 10)',
  CONTEXT_MAX_TOKENS: 'Maximum tokens for context window (default: 8000)',
  CONTEXT_USE_BAYESIAN_MEMORY: 'Enable Bayesian Memory Management (default: true)',
  CONTEXT_SUMMARIZATION_THRESHOLD: 'Number of messages before creating summaries - legacy (default: 20)',
  CONTEXT_IMPORTANCE_THRESHOLD: 'Minimum importance score for message inclusion - legacy (default: 0.3)',
  CONTEXT_VECTOR_SEARCH_LIMIT: 'Maximum relevant messages from vector search - legacy (default: 5)',
  CONTEXT_CACHE_EXPIRATION: 'Context cache expiration in minutes (default: 30)',
  CONTEXT_COMPRESSION_MEDIUM: 'Compression ratio for medium-term messages - legacy (default: 0.7)',
  CONTEXT_COMPRESSION_LONG: 'Compression ratio for long-term messages - legacy (default: 0.85)',
  CONTEXT_COMPRESSION_ANCIENT: 'Compression ratio for ancient messages - legacy (default: 0.95)',
  
  // Vector Store
  VECTOR_STORE_PROVIDER: 'Vector store provider: chromadb, qdrant, pinecone, weaviate-embedded (default: chromadb)',
  VECTOR_STORE_ENDPOINT: 'Vector store endpoint URL (default: http://localhost:8000)',
  VECTOR_STORE_API_KEY: 'API key for vector store (if required)',
  VECTOR_STORE_COLLECTION: 'Collection name for embeddings (default: yitam_context)',
  VECTOR_STORE_DIMENSION: 'Embedding dimension (default: 768)',
  EMBEDDING_MODEL: 'Embedding model name (default: gemini-embedding-001)',
  VECTOR_STORE_DATA_PATH: 'Data path for embedded vector stores (default: ./data/weaviate)',
  
  // MCP Server
  ENABLE_MCP_CONTEXT_SERVER: 'Enable MCP context server (default: false)',
  MCP_CONTEXT_SERVER_PORT: 'Port for MCP context server (default: 3001)',
  
  // Memory Cache
  MEMORY_CACHE_ENABLED: 'Enable in-memory caching (default: true)',
  MEMORY_CACHE_MAX_SIZE: 'Maximum number of cached items (default: 1000)',
  MEMORY_CACHE_TTL_MINUTES: 'Cache TTL in minutes (default: 30)',
  
  // Analytics
  CONTEXT_ANALYTICS_ENABLED: 'Enable context analytics (default: true)',
  CONTEXT_ANALYTICS_RETENTION_DAYS: 'Analytics data retention in days (default: 30)'
};

/**
 * Generate environment file template
 */
export function generateEnvTemplate(): string {
  const lines: string[] = [
    '# Yitam Context Engine Configuration',
    '# Copy this to your .env file and adjust values as needed',
    ''
  ];
  
  Object.entries(environmentVariables).forEach(([key, description]) => {
    lines.push(`# ${description}`);
    lines.push(`${key}=`);
    lines.push('');
  });
  
  return lines.join('\n');
}

/**
 * Development configuration for testing
 */
export const developmentContextConfig: YitamContextConfig = {
  ...defaultContextConfig,
  contextEngine: {
    ...defaultContextConfig.contextEngine,
    maxRecentMessages: 5,
    summarizationThreshold: 10,
    cacheExpiration: 5 // 5 minutes for faster testing
  },
  vectorStore: {
    ...defaultContextConfig.vectorStore,
    provider: 'chromadb', // Use in-memory for development
    endpoint: 'http://localhost:8000'
  },
  enableMCPServer: true,
  memoryCache: {
    ...defaultContextConfig.memoryCache,
    maxSize: 500, // Smaller cache for development
    ttlMinutes: 10 // Shorter TTL for testing
  }
};

/**
 * Production configuration
 */
export const productionContextConfig: YitamContextConfig = {
  ...defaultContextConfig,
  contextEngine: {
    ...defaultContextConfig.contextEngine,
    maxRecentMessages: 15,
    maxContextTokens: 12000,
    summarizationThreshold: 30,
    cacheExpiration: 60 // 1 hour
  },
  memoryCache: {
    ...defaultContextConfig.memoryCache,
    maxSize: 5000, // Larger cache for production
    ttlMinutes: 120 // Longer TTL for production
  },
  analytics: {
    ...defaultContextConfig.analytics,
    retentionDays: 90
  }
};
