// import { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages.mjs";

// Define MessageParam locally to avoid dependency issues
export interface MessageParam {
  role: 'user' | 'assistant' | 'system';
  content: string | any[];
}
import {
  initializeContextDatabase,
  runContextQuery,
  getContextQuery,
  allContextQuery
} from '../db/contextDatabase';
import { ContextMemoryCache } from './MemoryCache';
import { BayesianMemoryManager } from './BayesianMemoryManager';
import { VectorStoreManager } from './VectorStore';
import { BayesianContextWindow } from '../types/BayesianTypes';

export interface ContextEngineConfig {
  maxRecentMessages: number;        // Default: 10
  maxContextTokens: number;         // Default: 8000
  summarizationThreshold: number;   // Messages before summarization (legacy)
  importanceThreshold: number;      // Minimum importance score (legacy)
  vectorSearchLimit: number;        // Max relevant messages to retrieve (legacy)
  cacheExpiration: number;          // Context cache TTL in minutes
  // Legacy compression levels - replaced by Bayesian Memory Management
  compressionLevels?: {
    medium: number;    // 70% compression (deprecated)
    long: number;      // 85% compression (deprecated)
    ancient: number;   // 95% compression (deprecated)
  };
  // Bayesian Memory Management is now the primary approach
  useBayesianMemory: boolean;       // Default: true
}

export interface ConversationSegment {
  id: number;
  chatId: string;
  startMessageId: number;
  endMessageId: number;
  segmentType: 'recent' | 'medium' | 'long' | 'ancient';
  summary?: string;
  importanceScore: number;
  tokenCount: number;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageMetadata {
  messageId: number;
  chatId: string;
  importanceScore: number;
  semanticHash?: string;
  entities?: string[];
  topics?: string[];
  userMarked: boolean;
  compressionLevel: number;
  tokenCount: number;
}

export interface ContextWindow {
  recentMessages: MessageParam[];
  relevantHistory: MessageParam[];
  summaries: ConversationSegment[];
  keyFacts: KeyFact[];
  totalTokens: number;
  compressionRatio: number;
}

export interface KeyFact {
  id: number;
  chatId: string;
  factText: string;
  factType: 'decision' | 'preference' | 'fact' | 'goal';
  importanceScore: number;
  sourceMessageId?: number;
  extractedAt: Date;
  expiresAt?: Date;
}

export class ContextEngine {
  private config: ContextEngineConfig;
  private dbInitialized: boolean = false;
  private memoryCache: ContextMemoryCache;
  private bayesianManager?: BayesianMemoryManager;
  private vectorStore?: VectorStoreManager;

  constructor(config?: Partial<ContextEngineConfig>) {
    this.config = {
      maxRecentMessages: 10,
      maxContextTokens: 8000,
      summarizationThreshold: 20,  // Legacy - kept for fallback
      importanceThreshold: 0.3,    // Legacy - kept for fallback
      vectorSearchLimit: 5,        // Legacy - kept for fallback
      cacheExpiration: 30, // 30 minutes
      useBayesianMemory: true,     // Primary approach
      // Legacy compression levels - kept for fallback only
      compressionLevels: {
        medium: 0.7,  // 70% compression (deprecated)
        long: 0.85,   // 85% compression (deprecated)
        ancient: 0.95 // 95% compression (deprecated)
      },
      ...config
    };

    // Initialize in-memory cache
    this.memoryCache = new ContextMemoryCache({
      maxSize: 1000,
      ttlMinutes: this.config.cacheExpiration,
      cleanupIntervalMinutes: 5,
      enableStats: true
    });
  }

  async initialize(): Promise<void> {
    if (this.dbInitialized) return;

    try {
      await initializeContextDatabase();

      // Initialize vector store and Bayesian manager using configuration
      const { getContextConfig } = await import('../config/contextEngine.js');
      const contextConfig = getContextConfig();

      this.vectorStore = new VectorStoreManager(contextConfig.vectorStore);

      await this.vectorStore.initialize();

      this.bayesianManager = new BayesianMemoryManager(this.vectorStore);

      this.dbInitialized = true;
      console.log('Context Engine with Bayesian Memory Management initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Context Engine:', error);
      throw error;
    }
  }

  /**
   * Store a new conversation in the context engine
   */
  async createConversation(chatId: string, userId?: string, title?: string): Promise<void> {
    await this.ensureInitialized();
    
    const sql = `
      INSERT OR REPLACE INTO conversations 
      (chat_id, user_id, title, total_messages, total_tokens, last_activity)
      VALUES (?, ?, ?, 0, 0, CURRENT_TIMESTAMP)
    `;
    
    await runContextQuery(sql, [chatId, userId || null, title || null]);
  }

  /**
   * Add a message to the context engine
   */
  async addMessage(
    chatId: string, 
    messageId: number, 
    message: MessageParam,
    importance?: number
  ): Promise<void> {
    await this.ensureInitialized();
    
    const tokenCount = this.estimateTokenCount(message.content);
    const importanceScore = importance || this.calculateImportanceScore(message);
    
    // Store message metadata
    const sql = `
      INSERT OR REPLACE INTO message_metadata 
      (message_id, chat_id, importance_score, token_count, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    
    await runContextQuery(sql, [messageId, chatId, importanceScore, tokenCount]);
    
    // Update conversation stats
    await this.updateConversationStats(chatId, 1, tokenCount);
    
    // Check if we need to create new segments
    await this.checkAndCreateSegments(chatId);
  }

  /**
   * Get optimized context for a conversation
   */
  async getOptimizedContext(chatId: string, currentQuery?: string): Promise<ContextWindow> {
    await this.ensureInitialized();
    
    // Check cache first
    const cacheKey = this.generateCacheKey(chatId, currentQuery);
    const cached = await this.getCachedContext(cacheKey);
    if (cached) {
      return cached;
    }

    // Build context window
    const contextWindow = await this.buildContextWindow(chatId, currentQuery);
    
    // Cache the result
    await this.cacheContext(cacheKey, chatId, contextWindow);
    
    // Record analytics
    await this.recordAnalytics(chatId, 'retrieve', contextWindow);
    
    return contextWindow;
  }

  /**
   * Mark a message as important
   */
  async markMessageImportant(messageId: number, important: boolean = true): Promise<void> {
    await this.ensureInitialized();
    
    const sql = `
      UPDATE message_metadata 
      SET user_marked = ?, importance_score = CASE 
        WHEN ? THEN MAX(importance_score, 0.8)
        ELSE importance_score * 0.5
      END
      WHERE message_id = ?
    `;
    
    await runContextQuery(sql, [important, important, messageId]);
  }

  /**
   * Add a key fact to the conversation
   */
  async addKeyFact(
    chatId: string, 
    factText: string, 
    factType: 'decision' | 'preference' | 'fact' | 'goal' = 'fact',
    sourceMessageId?: number,
    importance: number = 1.0
  ): Promise<void> {
    await this.ensureInitialized();
    
    const sql = `
      INSERT INTO key_facts 
      (chat_id, fact_text, fact_type, importance_score, source_message_id)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    await runContextQuery(sql, [chatId, factText, factType, importance, sourceMessageId || null]);
  }

  /**
   * Get conversation statistics
   */
  async getConversationStats(chatId: string): Promise<any> {
    await this.ensureInitialized();
    
    const sql = `
      SELECT 
        total_messages,
        total_tokens,
        (SELECT COUNT(*) FROM conversation_segments WHERE chat_id = ?) as segment_count,
        (SELECT COUNT(*) FROM key_facts WHERE chat_id = ?) as fact_count,
        (SELECT AVG(compression_ratio) FROM context_analytics WHERE chat_id = ? AND compression_ratio IS NOT NULL) as avg_compression
      FROM conversations 
      WHERE chat_id = ?
    `;
    
    return await getContextQuery(sql, [chatId, chatId, chatId, chatId]);
  }

  // Private helper methods

  private async ensureInitialized(): Promise<void> {
    if (!this.dbInitialized) {
      await this.initialize();
    }
  }

  private estimateTokenCount(content: string | any[]): number {
    if (typeof content === 'string') {
      return Math.ceil(content.length / 4); // Rough estimation
    }
    return Math.ceil(JSON.stringify(content).length / 4);
  }

  private calculateImportanceScore(message: MessageParam): number {
    let score = 0.5; // Base score
    
    const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    
    // Boost for questions
    if (content.includes('?')) score += 0.1;
    
    // Boost for decisions/commitments
    if (/\b(decide|commit|agree|promise|will do|let's)\b/i.test(content)) score += 0.2;
    
    // Boost for important keywords
    if (/\b(important|critical|urgent|remember|note)\b/i.test(content)) score += 0.15;
    
    // Boost for user role
    if (message.role === 'user') score += 0.1;
    
    return Math.min(score, 1.0);
  }

  private async updateConversationStats(chatId: string, messageIncrement: number, tokenIncrement: number): Promise<void> {
    const sql = `
      UPDATE conversations 
      SET total_messages = total_messages + ?,
          total_tokens = total_tokens + ?,
          last_activity = CURRENT_TIMESTAMP
      WHERE chat_id = ?
    `;
    
    await runContextQuery(sql, [messageIncrement, tokenIncrement, chatId]);
  }

  private async checkAndCreateSegments(chatId: string): Promise<void> {
    // Get current message count
    const stats = await getContextQuery(
      'SELECT total_messages FROM conversations WHERE chat_id = ?',
      [chatId]
    );
    
    if (!stats || stats.total_messages < this.config.summarizationThreshold) {
      return;
    }

    // Check if we need to create a new segment
    const lastSegment = await getContextQuery(
      'SELECT * FROM conversation_segments WHERE chat_id = ? ORDER BY id DESC LIMIT 1',
      [chatId]
    );

    const messagesSinceLastSegment = lastSegment 
      ? stats.total_messages - lastSegment.end_message_id
      : stats.total_messages;

    if (messagesSinceLastSegment >= this.config.summarizationThreshold) {
      await this.createNewSegment(chatId, lastSegment);
    }
  }

  private async createNewSegment(chatId: string, lastSegment?: any): Promise<void> {
    const startMessageId = lastSegment ? lastSegment.end_message_id + 1 : 1;
    const stats = await getContextQuery(
      'SELECT total_messages FROM conversations WHERE chat_id = ?',
      [chatId]
    );
    
    const endMessageId = stats.total_messages;
    const messageCount = endMessageId - startMessageId + 1;
    
    // Determine segment type based on age
    let segmentType: 'recent' | 'medium' | 'long' | 'ancient' = 'recent';
    if (lastSegment) {
      const segmentCount = await getContextQuery(
        'SELECT COUNT(*) as count FROM conversation_segments WHERE chat_id = ?',
        [chatId]
      );
      
      if (segmentCount.count >= 3) segmentType = 'ancient';
      else if (segmentCount.count >= 2) segmentType = 'long';
      else segmentType = 'medium';
    }

    const sql = `
      INSERT INTO conversation_segments 
      (chat_id, start_message_id, end_message_id, segment_type, message_count)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    await runContextQuery(sql, [chatId, startMessageId, endMessageId, segmentType, messageCount]);
  }

  private generateCacheKey(chatId: string, query?: string): string {
    const queryHash = query ? Buffer.from(query, 'utf8').toString('base64').slice(0, 8) : 'noquery';
    return `context_${chatId}_${queryHash}`;
  }

  private async getCachedContext(cacheKey: string): Promise<ContextWindow | null> {
    // Try memory cache first
    const cached = this.memoryCache.get<ContextWindow>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fallback to database cache
    const dbCached = await getContextQuery(
      'SELECT context_data FROM context_cache WHERE cache_key = ? AND expires_at > CURRENT_TIMESTAMP',
      [cacheKey]
    );

    if (dbCached) {
      await runContextQuery(
        'UPDATE context_cache SET hit_count = hit_count + 1 WHERE cache_key = ?',
        [cacheKey]
      );
      const contextWindow = JSON.parse(dbCached.context_data);

      // Store in memory cache for faster access
      this.memoryCache.set(cacheKey, contextWindow, this.config.cacheExpiration);

      return contextWindow;
    }

    return null;
  }

  private async cacheContext(cacheKey: string, chatId: string, context: ContextWindow): Promise<void> {
    // Store in memory cache for fast access
    this.memoryCache.set(cacheKey, context, this.config.cacheExpiration);

    // Also store in database for persistence
    const expiresAt = new Date(Date.now() + this.config.cacheExpiration * 60 * 1000);

    const sql = `
      INSERT OR REPLACE INTO context_cache
      (cache_key, chat_id, context_data, token_count, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `;

    await runContextQuery(sql, [
      cacheKey,
      chatId,
      JSON.stringify(context),
      context.totalTokens,
      expiresAt.toISOString()
    ]);
  }

  private async buildContextWindow(chatId: string, currentQuery?: string): Promise<ContextWindow> {
    // PRIMARY APPROACH: Bayesian Memory Management
    // This is the intelligent, probabilistic approach that replaces traditional compression
    if (this.config.useBayesianMemory && this.bayesianManager && currentQuery) {
      try {
        console.log('Using Bayesian Memory Management for intelligent context selection');
        const bayesianContext = await this.bayesianManager.createBayesianContextWindow(
          chatId,
          currentQuery,
          this.config.maxRecentMessages
        );

        // Convert Bayesian context to standard ContextWindow format
        return this.convertBayesianToStandardContext(bayesianContext);
      } catch (error) {
        console.error('Error using Bayesian memory management, falling back to legacy approach:', error);
      }
    }

    // FALLBACK: Legacy hierarchical compression approach
    // Only used when Bayesian is disabled or fails
    console.log('Using legacy compression approach (consider enabling Bayesian Memory Management)');
    return await this.buildStandardContextWindow(chatId, currentQuery);
  }

  /**
   * Convert BayesianContextWindow to standard ContextWindow format
   */
  private convertBayesianToStandardContext(bayesianContext: BayesianContextWindow): ContextWindow {
    // Convert historical messages to MessageParam format, filtering out null values
    const recentMessages = bayesianContext.recentMessages
      .map(msg => this.convertToMessageParam(msg))
      .filter(msg => msg !== null);
    const relevantHistory = bayesianContext.bayesianSelectedMessages
      .map(item => this.convertToMessageParam(item.message))
      .filter(msg => msg !== null);

    // Convert summaries
    const summaries = bayesianContext.summaries.map(summary => ({
      id: summary.segmentId,
      chatId: bayesianContext.recentMessages[0]?.chatId || '',
      startMessageId: 0, // Would need to be populated
      endMessageId: 0,   // Would need to be populated
      segmentType: 'medium' as const,
      summary: summary.summary,
      importanceScore: 0.7,
      tokenCount: Math.ceil(summary.summary.length / 4),
      messageCount: summary.messageCount,
      createdAt: summary.timeRange.start,
      updatedAt: summary.timeRange.end
    }));

    // Convert key facts
    const keyFacts = bayesianContext.keyFacts.map(fact => ({
      id: 0, // Would need to be generated
      chatId: bayesianContext.recentMessages[0]?.chatId || '',
      factText: fact.fact,
      factType: 'fact' as const,
      importanceScore: fact.confidence,
      sourceMessageId: fact.sourceMessageIds[0],
      extractedAt: new Date(),
      expiresAt: undefined,
      createdAt: new Date()
    }));

    return {
      recentMessages,
      relevantHistory,
      summaries,
      keyFacts,
      totalTokens: bayesianContext.statistics.totalTokens,
      compressionRatio: bayesianContext.statistics.compressionRatio
    };
  }

  /**
   * Standard context building (fallback)
   */
  private async buildStandardContextWindow(chatId: string, currentQuery?: string): Promise<ContextWindow> {
    // Get recent messages
    const recentMessages = await this.getRecentMessagesAsMessageParams(chatId, this.config.maxRecentMessages);

    // Get high importance messages
    const importantMessages = await this.getImportantMessages(chatId, this.config.vectorSearchLimit);

    // Get summaries and key facts
    const summaries = await this.getConversationSummaries(chatId);
    const keyFacts = await this.getKeyFacts(chatId);

    const totalTokens = this.calculateTotalTokens(recentMessages, importantMessages);

    return {
      recentMessages,
      relevantHistory: importantMessages,
      summaries,
      keyFacts,
      totalTokens,
      compressionRatio: this.calculateCompressionRatio(totalTokens)
    };
  }

  /**
   * Convert HistoricalMessage to MessageParam
   */
  private convertToMessageParam(historicalMessage: any): MessageParam | null {
    // Ensure we have valid content - skip messages with empty content
    const content = historicalMessage.content || '';
    if (!content.trim()) {
      console.warn('Skipping message with empty content:', historicalMessage);
      return null;
    }

    return {
      role: historicalMessage.role || 'user',
      content: content
    };
  }

  private async recordAnalytics(chatId: string, operation: string, context: ContextWindow): Promise<void> {
    const sql = `
      INSERT INTO context_analytics
      (chat_id, operation_type, output_tokens, compression_ratio)
      VALUES (?, ?, ?, ?)
    `;

    await runContextQuery(sql, [chatId, operation, context.totalTokens, context.compressionRatio]);
  }

  /**
   * Get memory cache statistics
   */
  getMemoryCacheStats() {
    return this.memoryCache.getStats();
  }

  /**
   * Get cache statistics for a specific chat
   */
  getChatCacheStats(chatId: string) {
    return this.memoryCache.getChatCacheStats(chatId);
  }

  /**
   * Clear memory cache
   */
  clearMemoryCache(): void {
    this.memoryCache.clear();
  }

  /**
   * Helper methods for standard context building
   */
  private async getRecentMessagesAsMessageParams(chatId: string, count: number): Promise<MessageParam[]> {
    const sql = `
      SELECT
        mm.message_id,
        mm.chat_id,
        mm.created_at
      FROM message_metadata mm
      WHERE mm.chat_id = ?
      ORDER BY mm.message_id DESC
      LIMIT ?
    `;

    const rows = await allContextQuery(sql, [chatId, count]);

    // Convert to MessageParam format (simplified)
    return rows.map((row: any) => ({
      role: 'user' as const, // Would need to determine actual role
      content: `Message ${row.message_id}` // Would need to fetch actual content
    }));
  }

  private async getImportantMessages(chatId: string, limit: number): Promise<MessageParam[]> {
    const sql = `
      SELECT
        mm.message_id,
        mm.importance_score
      FROM message_metadata mm
      WHERE mm.chat_id = ? AND mm.importance_score > ?
      ORDER BY mm.importance_score DESC
      LIMIT ?
    `;

    const rows = await allContextQuery(sql, [chatId, this.config.importanceThreshold, limit]);

    return rows.map((row: any) => ({
      role: 'user' as const,
      content: `Important message ${row.message_id}`
    }));
  }

  private async getConversationSummaries(chatId: string): Promise<ConversationSegment[]> {
    const sql = `
      SELECT * FROM conversation_segments
      WHERE chat_id = ?
      ORDER BY start_message_id ASC
    `;

    const rows = await allContextQuery(sql, [chatId]);

    return rows.map((row: any) => ({
      id: row.id,
      chatId: row.chat_id,
      startMessageId: row.start_message_id,
      endMessageId: row.end_message_id,
      segmentType: row.segment_type,
      summary: row.summary,
      importanceScore: row.importance_score,
      tokenCount: row.token_count,
      messageCount: row.message_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  private async getKeyFacts(chatId: string): Promise<KeyFact[]> {
    const sql = `
      SELECT * FROM key_facts
      WHERE chat_id = ?
      ORDER BY importance_score DESC
    `;

    const rows = await allContextQuery(sql, [chatId]);

    return rows.map((row: any) => ({
      id: row.id,
      chatId: row.chat_id,
      factText: row.fact_text,
      factType: (row.fact_type || 'fact') as 'decision' | 'preference' | 'fact' | 'goal',
      importanceScore: row.importance_score,
      sourceMessageId: row.source_message_id,
      extractedAt: new Date(row.extracted_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      createdAt: new Date(row.created_at)
    }));
  }

  private calculateTotalTokens(recentMessages: MessageParam[], relevantHistory: MessageParam[]): number {
    const recentTokens = recentMessages.reduce((sum, msg) => sum + this.estimateTokenCount(msg.content), 0);
    const historyTokens = relevantHistory.reduce((sum, msg) => sum + this.estimateTokenCount(msg.content), 0);
    return recentTokens + historyTokens;
  }

  private calculateCompressionRatio(totalTokens: number): number {
    const estimatedFullTokens = totalTokens * 2; // Rough estimate
    return totalTokens / estimatedFullTokens;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.memoryCache.destroy();
    if (this.vectorStore) {
      await this.vectorStore.close();
    }
  }
}
