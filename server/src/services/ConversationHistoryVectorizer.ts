/**
 * ConversationHistoryVectorizer - Vector hóa lịch sử trò chuyện cho Bayesian Memory Management
 */

// Define MessageParam locally to avoid dependency issues
interface MessageParam {
  role: 'user' | 'assistant' | 'system';
  content: string | any[];
}
import { VectorStoreManager } from './VectorStore';
import { 
  HistoricalMessage, 
  ConversationVector, 
  QueryAnalysis,
  BayesianMessageMetadata 
} from '../types/BayesianTypes';
import { getContextQuery, runContextQuery } from '../db/contextDatabase';

export class ConversationHistoryVectorizer {
  private vectorStore: VectorStoreManager;
  private entityExtractor: EntityExtractor;
  private topicExtractor: TopicExtractor;

  constructor(vectorStore: VectorStoreManager) {
    this.vectorStore = vectorStore;
    this.entityExtractor = new EntityExtractor();
    this.topicExtractor = new TopicExtractor();
  }

  /**
   * Vector hóa một message và lưu vào vector store
   */
  async vectorizeMessage(message: HistoricalMessage): Promise<ConversationVector> {
    // Generate embedding for message content
    const embedding = await this.generateEmbedding(message.content);
    
    // Extract entities and topics
    const entities = await this.entityExtractor.extract(message.content);
    const topics = await this.topicExtractor.extract(message.content);
    
    // Create conversation vector
    const conversationVector: ConversationVector = {
      messageId: message.messageId,
      embedding,
      metadata: {
        timestamp: message.timestamp,
        role: message.role,
        tokenCount: message.tokenCount,
        entities,
        topics
      }
    };

    // Store in vector database
    await this.vectorStore.addMessage(message.messageId, {
      role: message.role,
      content: message.content
    });

    // Update message metadata with extracted information
    await this.updateMessageMetadata(message.messageId, message.chatId, entities, topics);

    return conversationVector;
  }

  /**
   * Vector hóa toàn bộ lịch sử trò chuyện
   */
  async vectorizeConversationHistory(chatId: string): Promise<ConversationVector[]> {
    // Get all messages for this conversation
    const messages = await this.getConversationMessages(chatId);
    const vectors: ConversationVector[] = [];

    console.log(`Vectorizing ${messages.length} messages for chat ${chatId}`);

    for (const message of messages) {
      try {
        const vector = await this.vectorizeMessage(message);
        vectors.push(vector);
        
        // Add small delay to avoid rate limiting
        await this.sleep(100);
      } catch (error) {
        console.error(`Error vectorizing message ${message.messageId}:`, error);
      }
    }

    console.log(`Successfully vectorized ${vectors.length} messages`);
    return vectors;
  }

  /**
   * Phân tích query hiện tại
   */
  async analyzeCurrentQuery(query: string): Promise<QueryAnalysis> {
    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);
    
    // Extract entities and topics from query
    const queryEntities = await this.entityExtractor.extract(query);
    const queryTopics = await this.topicExtractor.extract(query);
    
    // Classify query intent
    const queryIntent = this.classifyQueryIntent(query);
    
    // Extract temporal context if present
    const temporalContext = this.extractTemporalContext(query);

    return {
      query,
      queryEmbedding,
      queryEntities,
      queryTopics,
      queryIntent,
      temporalContext
    };
  }

  /**
   * Tìm messages tương tự semantic với query
   */
  async findSimilarMessages(
    chatId: string, 
    queryAnalysis: QueryAnalysis, 
    limit: number = 20
  ): Promise<Array<{ message: HistoricalMessage; similarity: number }>> {
    // Search vector store for similar messages
    const vectorResults = await this.vectorStore.findRelevantMessages(
      queryAnalysis.query, 
      limit * 2 // Get more results to filter
    );

    // Get full message details
    const similarMessages: Array<{ message: HistoricalMessage; similarity: number }> = [];

    for (const result of vectorResults) {
      const message = await this.getMessageById(result.messageId, chatId);
      if (message) {
        similarMessages.push({
          message,
          similarity: result.similarity
        });
      }
    }

    // Sort by similarity and return top results
    return similarMessages
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * Tính toán entity overlap giữa query và message
   */
  calculateEntityOverlap(queryEntities: string[], messageEntities: string[]): number {
    if (queryEntities.length === 0 || messageEntities.length === 0) {
      return 0;
    }

    const querySet = new Set(queryEntities.map(e => e.toLowerCase()));
    const messageSet = new Set(messageEntities.map(e => e.toLowerCase()));
    
    const intersection = new Set([...querySet].filter(x => messageSet.has(x)));
    const union = new Set([...querySet, ...messageSet]);
    
    return intersection.size / union.size; // Jaccard similarity
  }

  /**
   * Tính toán topic similarity
   */
  calculateTopicSimilarity(queryTopics: string[], messageTopics: string[]): number {
    if (queryTopics.length === 0 || messageTopics.length === 0) {
      return 0;
    }

    const querySet = new Set(queryTopics.map(t => t.toLowerCase()));
    const messageSet = new Set(messageTopics.map(t => t.toLowerCase()));
    
    const intersection = new Set([...querySet].filter(x => messageSet.has(x)));
    
    return intersection.size / Math.max(querySet.size, messageSet.size);
  }

  // Private helper methods

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Use Google Gemini embeddings with @google/generative-ai library
      const { GoogleGenerativeAI } = await import('@google/generative-ai');

      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
      const model = genAI.getGenerativeModel({
        model: 'text-embedding-004'
      });

      const result = await model.embedContent(text);

      if (!result.embedding || !result.embedding.values) {
        throw new Error('Invalid embedding response from Gemini');
      }

      return result.embedding.values;
    } catch (error) {
      console.error('Error generating Gemini embedding in ConversationHistoryVectorizer:', error);
      // Return a dummy embedding for testing (768 dimensions for Gemini)
      return new Array(768).fill(0).map(() => Math.random());
    }
  }

  private async getConversationMessages(chatId: string): Promise<HistoricalMessage[]> {
    const sql = `
      SELECT 
        mm.message_id,
        mm.chat_id,
        mm.importance_score as currentImportanceScore,
        mm.entities,
        mm.topics,
        mm.user_marked,
        mm.token_count,
        mm.created_at as timestamp
      FROM message_metadata mm
      WHERE mm.chat_id = ?
      ORDER BY mm.message_id ASC
    `;

    const rows = await getContextQuery(sql, [chatId]);
    
    // Convert to HistoricalMessage format
    // Note: We need to get actual message content from the main conversation system
    return rows.map((row: any) => ({
      messageId: row.message_id,
      chatId: row.chat_id,
      content: '', // Would need to fetch from main message store
      role: 'user', // Would need to determine from message data
      timestamp: new Date(row.timestamp),
      tokenCount: row.token_count,
      currentImportanceScore: row.importance_score,
      entities: row.entities ? JSON.parse(row.entities) : [],
      topics: row.topics ? JSON.parse(row.topics) : [],
      userMarked: row.user_marked,
      timesReferenced: 0,
      lastReferencedAt: undefined
    }));
  }

  private async getMessageById(messageId: number, chatId: string): Promise<HistoricalMessage | null> {
    const sql = `
      SELECT 
        mm.message_id,
        mm.chat_id,
        mm.importance_score as currentImportanceScore,
        mm.entities,
        mm.topics,
        mm.user_marked,
        mm.token_count,
        mm.created_at as timestamp
      FROM message_metadata mm
      WHERE mm.message_id = ? AND mm.chat_id = ?
    `;

    const row = await getContextQuery(sql, [messageId, chatId]);
    
    if (!row) return null;

    return {
      messageId: row.message_id,
      chatId: row.chat_id,
      content: '', // Would need to fetch from main message store
      role: 'user', // Would need to determine from message data
      timestamp: new Date(row.timestamp),
      tokenCount: row.token_count,
      currentImportanceScore: row.importance_score,
      entities: row.entities ? JSON.parse(row.entities) : [],
      topics: row.topics ? JSON.parse(row.topics) : [],
      userMarked: row.user_marked,
      timesReferenced: 0,
      lastReferencedAt: undefined
    };
  }

  private async updateMessageMetadata(
    messageId: number, 
    chatId: string, 
    entities: string[], 
    topics: string[]
  ): Promise<void> {
    const sql = `
      UPDATE message_metadata 
      SET 
        entities = ?,
        topics = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE message_id = ? AND chat_id = ?
    `;

    await runContextQuery(sql, [
      JSON.stringify(entities),
      JSON.stringify(topics),
      messageId,
      chatId
    ]);
  }

  private classifyQueryIntent(query: string): 'question' | 'request' | 'clarification' | 'continuation' | 'new_topic' {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('?') || lowerQuery.startsWith('what') || lowerQuery.startsWith('how') || 
        lowerQuery.startsWith('why') || lowerQuery.startsWith('when') || lowerQuery.startsWith('where')) {
      return 'question';
    }
    
    if (lowerQuery.includes('can you') || lowerQuery.includes('please') || lowerQuery.includes('help')) {
      return 'request';
    }
    
    if (lowerQuery.includes('clarify') || lowerQuery.includes('explain') || lowerQuery.includes('mean')) {
      return 'clarification';
    }
    
    if (lowerQuery.includes('also') || lowerQuery.includes('and') || lowerQuery.includes('furthermore')) {
      return 'continuation';
    }
    
    return 'new_topic';
  }

  private extractTemporalContext(query: string): any {
    // Simple temporal extraction - could be enhanced with NLP libraries
    const timePatterns = [
      /yesterday/i,
      /today/i,
      /tomorrow/i,
      /last week/i,
      /this week/i,
      /next week/i,
      /(\d+) (minutes?|hours?|days?) ago/i
    ];

    for (const pattern of timePatterns) {
      if (pattern.test(query)) {
        // Return basic temporal context
        return {
          referenceTime: new Date(),
          timeRange: {
            start: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
            end: new Date()
          }
        };
      }
    }

    return undefined;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Simple entity extractor - could be enhanced with NLP libraries
 */
class EntityExtractor {
  async extract(text: string): Promise<string[]> {
    const entities: string[] = [];
    
    // Simple pattern-based entity extraction
    const patterns = [
      /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, // Person names
      /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, // Dates
      /\b\d{1,2}:\d{2}\b/g, // Times
      /\$\d+(?:\.\d{2})?\b/g, // Money
      /\b[A-Z]{2,}\b/g // Acronyms
    ];

    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        entities.push(...matches);
      }
    }

    return [...new Set(entities)]; // Remove duplicates
  }
}

/**
 * Simple topic extractor - could be enhanced with topic modeling
 */
class TopicExtractor {
  private topicKeywords = {
    'technology': ['software', 'computer', 'programming', 'code', 'algorithm', 'data'],
    'business': ['company', 'market', 'sales', 'revenue', 'profit', 'customer'],
    'health': ['doctor', 'medicine', 'treatment', 'symptoms', 'health', 'medical'],
    'education': ['school', 'student', 'teacher', 'learning', 'study', 'course'],
    'travel': ['trip', 'vacation', 'hotel', 'flight', 'destination', 'travel']
  };

  async extract(text: string): Promise<string[]> {
    const lowerText = text.toLowerCase();
    const topics: string[] = [];

    for (const [topic, keywords] of Object.entries(this.topicKeywords)) {
      const matchCount = keywords.filter(keyword => lowerText.includes(keyword)).length;
      if (matchCount > 0) {
        topics.push(topic);
      }
    }

    return topics;
  }
}
