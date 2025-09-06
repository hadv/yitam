// Define MessageParam locally to avoid dependency issues
export interface MessageParam {
  role: 'user' | 'assistant' | 'system';
  content: string | any[];
}
import { ContextMemoryCache } from './MemoryCache';

export interface VectorSearchResult {
  messageId: number;
  similarity: number;
  content: string;
  metadata: any;
}

export interface EmbeddingRequest {
  text: string;
  messageId?: number;
  segmentId?: number;
  type: 'message' | 'segment' | 'summary';
}

export interface VectorStoreConfig {
  provider: 'chromadb' | 'qdrant' | 'pinecone';
  apiKey?: string;
  endpoint?: string;
  collectionName: string;
  dimension: number;
  embeddingModel: string;
}

/**
 * Abstract base class for vector store implementations
 */
export abstract class VectorStore {
  protected config: VectorStoreConfig;

  constructor(config: VectorStoreConfig) {
    this.config = config;
  }

  abstract initialize(): Promise<void>;
  abstract addEmbedding(request: EmbeddingRequest): Promise<string>;
  abstract searchSimilar(query: string, limit: number, threshold?: number): Promise<VectorSearchResult[]>;
  abstract deleteEmbedding(vectorId: string): Promise<void>;
  abstract getEmbedding(vectorId: string): Promise<any>;
  abstract close(): Promise<void>;
}

/**
 * Qdrant implementation for vector storage
 */
export class QdrantStore extends VectorStore {
  private client: any;

  async initialize(): Promise<void> {
    try {
      // Dynamic import for Qdrant client
      const { QdrantClient } = await import('@qdrant/js-client-rest');

      this.client = new QdrantClient({
        url: this.config.endpoint || process.env.QDRANT_URL || 'http://localhost:6333',
        apiKey: process.env.QDRANT_API_KEY
      });

      // Check if collection exists, create if not
      try {
        await this.client.getCollection(this.config.collectionName);
      } catch (error) {
        // Collection doesn't exist, create it
        await this.client.createCollection(this.config.collectionName, {
          vectors: {
            size: this.config.dimension,
            distance: 'Cosine'
          }
        });
      }

      console.log(`Qdrant collection '${this.config.collectionName}' initialized`);
    } catch (error) {
      console.error('Failed to initialize Qdrant:', error);
      throw error;
    }
  }

  async addEmbedding(request: EmbeddingRequest): Promise<string> {
    if (!this.client) {
      throw new Error('Qdrant client not initialized');
    }

    try {
      const embedding = await this.generateEmbedding(request.text);
      const vectorId = `${request.type}_${request.messageId || request.segmentId}_${Date.now()}`;

      await this.client.upsert(this.config.collectionName, {
        wait: true,
        points: [{
          id: vectorId,
          vector: embedding,
          payload: {
            text: request.text,
            messageId: request.messageId,
            segmentId: request.segmentId,
            type: request.type,
            timestamp: new Date().toISOString()
          }
        }]
      });

      return vectorId;
    } catch (error) {
      console.error('Error adding embedding to Qdrant:', error);
      throw error;
    }
  }

  async searchSimilar(query: string, limit: number = 10, filter?: any): Promise<SearchResult[]> {
    if (!this.client) {
      throw new Error('Qdrant client not initialized');
    }

    try {
      const queryEmbedding = await this.generateEmbedding(query);

      const searchResult = await this.client.search(this.config.collectionName, {
        vector: queryEmbedding,
        limit,
        with_payload: true,
        filter: filter
      });

      return searchResult.map((result: any) => ({
        vectorId: result.id,
        similarity: result.score,
        text: result.payload.text,
        messageId: result.payload.messageId,
        segmentId: result.payload.segmentId,
        metadata: {
          type: result.payload.type,
          timestamp: result.payload.timestamp
        }
      }));
    } catch (error) {
      console.error('Error searching in Qdrant:', error);
      return [];
    }
  }

  async deleteEmbedding(vectorId: string): Promise<void> {
    if (!this.client) {
      throw new Error('Qdrant client not initialized');
    }

    try {
      await this.client.delete(this.config.collectionName, {
        points: [vectorId]
      });
    } catch (error) {
      console.error('Error deleting embedding from Qdrant:', error);
      throw error;
    }
  }

  async getEmbedding(vectorId: string): Promise<any> {
    if (!this.client) {
      throw new Error('Qdrant client not initialized');
    }

    try {
      const result = await this.client.retrieve(this.config.collectionName, {
        ids: [vectorId],
        with_payload: true,
        with_vector: true
      });

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error('Error getting embedding from Qdrant:', error);
      return null;
    }
  }

  async close(): Promise<void> {
    // Qdrant client doesn't need explicit closing
    this.client = null;
  }
}

/**
 * ChromaDB implementation for vector storage
 */
export class ChromaDBStore extends VectorStore {
  private client: any;
  private collection: any;

  async initialize(): Promise<void> {
    try {
      // Dynamic import for ChromaDB client
      const { ChromaApi, Configuration } = await import('chromadb');
      
      this.client = new ChromaApi(new Configuration({
        basePath: this.config.endpoint || 'http://localhost:8000'
      }));

      // Create or get collection
      try {
        this.collection = await this.client.getCollection({
          name: this.config.collectionName
        });
      } catch (error) {
        // Collection doesn't exist, create it
        this.collection = await this.client.createCollection({
          name: this.config.collectionName,
          metadata: {
            description: 'Yitam Context Engine embeddings',
            dimension: this.config.dimension
          }
        });
      }

      console.log(`ChromaDB collection '${this.config.collectionName}' initialized`);
    } catch (error) {
      console.error('Failed to initialize ChromaDB:', error);
      throw error;
    }
  }

  async addEmbedding(request: EmbeddingRequest): Promise<string> {
    const embedding = await this.generateEmbedding(request.text);
    const vectorId = `${request.type}_${request.messageId || request.segmentId}_${Date.now()}`;
    
    await this.collection.add({
      ids: [vectorId],
      embeddings: [embedding],
      documents: [request.text],
      metadatas: [{
        messageId: request.messageId,
        segmentId: request.segmentId,
        type: request.type,
        timestamp: new Date().toISOString()
      }]
    });

    return vectorId;
  }

  async searchSimilar(query: string, limit: number = 5, threshold: number = 0.7): Promise<VectorSearchResult[]> {
    const queryEmbedding = await this.generateEmbedding(query);
    
    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit,
      include: ['documents', 'metadatas', 'distances']
    });

    return results.ids[0].map((id: string, index: number) => ({
      messageId: results.metadatas[0][index].messageId,
      similarity: 1 - results.distances[0][index], // Convert distance to similarity
      content: results.documents[0][index],
      metadata: results.metadatas[0][index]
    })).filter((result: VectorSearchResult) => result.similarity >= threshold);
  }

  async deleteEmbedding(vectorId: string): Promise<void> {
    await this.collection.delete({
      ids: [vectorId]
    });
  }

  async getEmbedding(vectorId: string): Promise<any> {
    const results = await this.collection.get({
      ids: [vectorId],
      include: ['embeddings', 'documents', 'metadatas']
    });

    if (results.ids.length === 0) {
      return null;
    }

    return {
      id: results.ids[0],
      embedding: results.embeddings[0],
      document: results.documents[0],
      metadata: results.metadatas[0]
    };
  }

  async close(): Promise<void> {
    // ChromaDB doesn't require explicit connection closing
    console.log('ChromaDB connection closed');
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    // This would typically use OpenAI's embedding API or another embedding service
    // For now, return a mock embedding
    console.warn('Using mock embedding - implement actual embedding generation');
    return new Array(this.config.dimension).fill(0).map(() => Math.random() - 0.5);
  }
}

/**
 * In-memory vector store for development/testing
 */
export class InMemoryVectorStore extends VectorStore {
  private embeddings: Map<string, {
    vector: number[];
    content: string;
    metadata: any;
  }> = new Map();

  async initialize(): Promise<void> {
    console.log('In-memory vector store initialized');
  }

  async addEmbedding(request: EmbeddingRequest): Promise<string> {
    const vectorId = `${request.type}_${request.messageId || request.segmentId}_${Date.now()}`;
    const embedding = await this.generateEmbedding(request.text);
    
    this.embeddings.set(vectorId, {
      vector: embedding,
      content: request.text,
      metadata: {
        messageId: request.messageId,
        segmentId: request.segmentId,
        type: request.type,
        timestamp: new Date().toISOString()
      }
    });

    return vectorId;
  }

  async searchSimilar(query: string, limit: number = 5, threshold: number = 0.7): Promise<VectorSearchResult[]> {
    const queryEmbedding = await this.generateEmbedding(query);
    const results: VectorSearchResult[] = [];

    for (const [vectorId, data] of this.embeddings.entries()) {
      const similarity = this.cosineSimilarity(queryEmbedding, data.vector);
      
      if (similarity >= threshold) {
        results.push({
          messageId: data.metadata.messageId,
          similarity,
          content: data.content,
          metadata: data.metadata
        });
      }
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async deleteEmbedding(vectorId: string): Promise<void> {
    this.embeddings.delete(vectorId);
  }

  async getEmbedding(vectorId: string): Promise<any> {
    const data = this.embeddings.get(vectorId);
    if (!data) return null;

    return {
      id: vectorId,
      embedding: data.vector,
      document: data.content,
      metadata: data.metadata
    };
  }

  async close(): Promise<void> {
    this.embeddings.clear();
    console.log('In-memory vector store cleared');
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    // Simple hash-based embedding for testing
    const hash = this.simpleHash(text);
    return new Array(this.config.dimension).fill(0).map((_, i) => 
      Math.sin(hash + i) * 0.5
    );
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

/**
 * Factory function to create vector store instances
 */
export function createVectorStore(config: VectorStoreConfig): VectorStore {
  switch (config.provider) {
    case 'qdrant':
      return new QdrantStore(config);
    case 'chromadb':
      return new ChromaDBStore(config);
    case 'pinecone':
      throw new Error('Pinecone implementation not yet available');
    default:
      return new InMemoryVectorStore(config);
  }
}

/**
 * Vector store manager for the context engine
 */
export class VectorStoreManager {
  private store: VectorStore;
  private initialized: boolean = false;
  private cache: ContextMemoryCache;

  constructor(config: VectorStoreConfig) {
    this.store = createVectorStore(config);
    this.cache = new ContextMemoryCache({
      maxSize: 500,
      ttlMinutes: 15, // Cache vector search results for 15 minutes
      cleanupIntervalMinutes: 5,
      enableStats: true
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await this.store.initialize();
    this.initialized = true;
    console.log('Vector store manager initialized');
  }

  async addMessage(messageId: number, message: MessageParam): Promise<string> {
    await this.ensureInitialized();
    
    const content = typeof message.content === 'string' 
      ? message.content 
      : JSON.stringify(message.content);

    return await this.store.addEmbedding({
      text: content,
      messageId,
      type: 'message'
    });
  }

  async addSegmentSummary(segmentId: number, summary: string): Promise<string> {
    await this.ensureInitialized();
    
    return await this.store.addEmbedding({
      text: summary,
      segmentId,
      type: 'summary'
    });
  }

  async findRelevantMessages(query: string, limit: number = 5): Promise<VectorSearchResult[]> {
    await this.ensureInitialized();

    // Check cache first
    const cached = this.cache.getCachedVectorSearch(query);
    if (cached && cached.length >= limit) {
      return cached.slice(0, limit);
    }

    // Search vector store
    const results = await this.store.searchSimilar(query, limit);

    // Cache results
    this.cache.cacheVectorSearch(query, results, 15); // Cache for 15 minutes

    return results;
  }

  async close(): Promise<void> {
    if (this.initialized) {
      await this.store.close();
      this.cache.destroy();
      this.initialized = false;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}
