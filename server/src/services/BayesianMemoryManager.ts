/**
 * BayesianMemoryManager - Quản lý bộ nhớ sử dụng Bayesian inference
 * Tính toán P(Thông tin cũ quan trọng | Nội dung thông tin cũ, Câu hỏi hiện tại)
 */

import { 
  BayesianEvidence,
  BayesianPrior,
  BayesianPosterior,
  BayesianMemoryConfig,
  BayesianAnalysisResult,
  HistoricalMessage,
  QueryAnalysis,
  BayesianContextWindow
} from '../types/BayesianTypes';
import { ConversationHistoryVectorizer } from './ConversationHistoryVectorizer';
import { VectorStoreManager } from './VectorStore';
import { getContextQuery, runContextQuery } from '../db/contextDatabase';

export class BayesianMemoryManager {
  private vectorizer: ConversationHistoryVectorizer;
  private config: BayesianMemoryConfig;

  constructor(vectorStore: VectorStoreManager, config?: Partial<BayesianMemoryConfig>) {
    this.vectorizer = new ConversationHistoryVectorizer(vectorStore);
    this.config = this.mergeWithDefaultConfig(config);
  }

  /**
   * Phương thức chính: Phân tích Bayesian để chọn thông tin quan trọng
   */
  async analyzeBayesianRelevance(
    chatId: string,
    currentQuery: string
  ): Promise<BayesianAnalysisResult> {
    const startTime = Date.now();

    // 1. Phân tích query hiện tại
    const queryAnalysis = await this.vectorizer.analyzeCurrentQuery(currentQuery);

    // 2. Tìm messages tương tự semantic
    const similarMessages = await this.vectorizer.findSimilarMessages(
      chatId, 
      queryAnalysis, 
      this.config.maxHistorySize
    );

    // 3. Tính toán Bayesian probability cho từng message
    const bayesianResults: Array<{
      message: HistoricalMessage;
      bayesianScore: BayesianPosterior;
      rank: number;
    }> = [];

    for (const { message, similarity } of similarMessages) {
      // Tính evidence (bằng chứng)
      const evidence = await this.calculateEvidence(message, queryAnalysis, similarity);
      
      // Tính prior (xác suất tiên nghiệm)
      const prior = this.calculatePrior(message);
      
      // Tính posterior (xác suất hậu nghiệm) sử dụng Bayes
      const posterior = this.calculatePosterior(evidence, prior);

      // Chỉ giữ lại messages có probability đủ cao
      if (posterior.relevanceProbability >= this.config.thresholds.minRelevanceProbability) {
        bayesianResults.push({
          message,
          bayesianScore: posterior,
          rank: 0 // Sẽ được cập nhật sau khi sort
        });
      }
    }

    // 4. Sắp xếp theo Bayesian probability và chọn top K
    bayesianResults.sort((a, b) => b.bayesianScore.relevanceProbability - a.bayesianScore.relevanceProbability);
    
    // Cập nhật rank
    bayesianResults.forEach((result, index) => {
      result.rank = index + 1;
    });

    const selectedMessages = bayesianResults.slice(0, this.config.topKSelection);

    // 5. Tạo context note cho LLM
    const contextNote = this.generateContextNote(selectedMessages, queryAnalysis);

    // 6. Cập nhật statistics
    await this.updateMessageStatistics(selectedMessages);

    const processingTime = Date.now() - startTime;

    return {
      selectedMessages,
      analysisSummary: {
        totalMessagesAnalyzed: similarMessages.length,
        averageRelevanceProbability: bayesianResults.length > 0 
          ? bayesianResults.reduce((sum, r) => sum + r.bayesianScore.relevanceProbability, 0) / bayesianResults.length
          : 0,
        topRelevanceProbability: selectedMessages.length > 0 
          ? selectedMessages[0].bayesianScore.relevanceProbability 
          : 0,
        processingTimeMs: processingTime
      },
      contextNote
    };
  }

  /**
   * Tạo Bayesian Context Window cho LLM
   */
  async createBayesianContextWindow(
    chatId: string,
    currentQuery: string,
    recentMessageCount: number = 10
  ): Promise<BayesianContextWindow> {
    // Phân tích Bayesian
    const bayesianAnalysis = await this.analyzeBayesianRelevance(chatId, currentQuery);

    // Lấy recent messages (luôn bao gồm)
    const recentMessages = await this.getRecentMessages(chatId, recentMessageCount);

    // Tạo context window
    const contextWindow: BayesianContextWindow = {
      bayesianSelectedMessages: bayesianAnalysis.selectedMessages.map(result => ({
        message: result.message,
        relevanceProbability: result.bayesianScore.relevanceProbability,
        evidenceBreakdown: this.extractEvidenceFromPosterior(result.bayesianScore),
        contextNote: `Relevant (P=${result.bayesianScore.relevanceProbability.toFixed(3)})`
      })),
      recentMessages,
      summaries: [], // TODO: Implement summaries
      keyFacts: [], // TODO: Implement key facts extraction
      statistics: {
        totalTokens: this.calculateTotalTokens(bayesianAnalysis.selectedMessages, recentMessages),
        compressionRatio: this.calculateCompressionRatio(bayesianAnalysis.selectedMessages.length, recentMessages.length),
        bayesianSelectionRatio: bayesianAnalysis.selectedMessages.length / (bayesianAnalysis.selectedMessages.length + recentMessages.length),
        averageRelevanceProbability: bayesianAnalysis.analysisSummary.averageRelevanceProbability
      },
      contextExplanation: bayesianAnalysis.contextNote
    };

    return contextWindow;
  }

  /**
   * Tính toán Evidence (bằng chứng) cho Bayesian inference
   */
  private async calculateEvidence(
    message: HistoricalMessage,
    queryAnalysis: QueryAnalysis,
    semanticSimilarity: number
  ): Promise<BayesianEvidence> {
    // 1. Semantic similarity (đã có từ vector search)
    const semantic = Math.max(0, Math.min(1, semanticSimilarity));

    // 2. Temporal relevance (độ liên quan thời gian)
    const temporal = this.calculateTemporalRelevance(message.timestamp);

    // 3. Entity overlap
    const entityOverlap = this.vectorizer.calculateEntityOverlap(
      queryAnalysis.queryEntities,
      message.entities || []
    );

    // 4. Topic similarity
    const topicSimilarity = this.vectorizer.calculateTopicSimilarity(
      queryAnalysis.queryTopics,
      message.topics || []
    );

    // 5. User interaction score
    const userInteractionScore = this.calculateUserInteractionScore(message);

    // 6. Context continuity
    const contextContinuity = await this.calculateContextContinuity(message, queryAnalysis);

    return {
      semanticSimilarity: semantic,
      temporalRelevance: temporal,
      entityOverlap,
      topicSimilarity,
      userInteractionScore,
      contextContinuity
    };
  }

  /**
   * Tính toán Prior (xác suất tiên nghiệm)
   */
  private calculatePrior(message: HistoricalMessage): BayesianPrior {
    // 1. Base importance từ hệ thống hiện tại
    const baseImportance = message.currentImportanceScore;

    // 2. Message type prior
    const messageTypePrior = message.role === 'user' ? 0.6 : 0.4; // User messages thường quan trọng hơn

    // 3. Length-based prior
    const lengthPrior = Math.min(1, message.tokenCount / 100); // Normalize by 100 tokens

    // 4. Position in conversation
    const positionPrior = this.calculatePositionPrior(message);

    // 5. User-marked importance
    const userMarkedPrior = message.userMarked ? 0.9 : 0.5;

    return {
      baseImportance,
      messageTypePrior,
      lengthPrior,
      positionPrior,
      userMarkedPrior
    };
  }

  /**
   * Tính toán Posterior (xác suất hậu nghiệm) sử dụng Bayes' theorem
   * P(relevant|evidence) = P(evidence|relevant) * P(relevant) / P(evidence)
   */
  private calculatePosterior(evidence: BayesianEvidence, prior: BayesianPrior): BayesianPosterior {
    const weights = this.config.evidenceWeights;
    const priorWeights = this.config.priorWeights;

    // Tính likelihood P(evidence|relevant)
    const likelihood = 
      weights.semantic * evidence.semanticSimilarity +
      weights.temporal * evidence.temporalRelevance +
      weights.entity * evidence.entityOverlap +
      weights.topic * evidence.topicSimilarity +
      weights.interaction * evidence.userInteractionScore +
      weights.continuity * evidence.contextContinuity;

    // Tính prior probability P(relevant)
    const priorProbability = 
      priorWeights.baseImportance * prior.baseImportance +
      priorWeights.messageType * prior.messageTypePrior +
      priorWeights.length * prior.lengthPrior +
      priorWeights.position * prior.positionPrior +
      priorWeights.userMarked * prior.userMarkedPrior;

    // Simplified Bayesian calculation (assuming P(evidence) is constant)
    const relevanceProbability = likelihood * priorProbability;

    // Normalize to [0, 1]
    const normalizedProbability = Math.max(0, Math.min(1, relevanceProbability));

    // Calculate confidence based on evidence strength
    const evidenceStrength = Object.values(evidence).reduce((sum, val) => sum + val, 0) / Object.keys(evidence).length;
    const confidence = Math.min(1, evidenceStrength * 1.2);

    return {
      relevanceProbability: normalizedProbability,
      confidence,
      evidenceContribution: {
        semantic: weights.semantic * evidence.semanticSimilarity,
        temporal: weights.temporal * evidence.temporalRelevance,
        entity: weights.entity * evidence.entityOverlap,
        topic: weights.topic * evidence.topicSimilarity,
        interaction: weights.interaction * evidence.userInteractionScore,
        continuity: weights.continuity * evidence.contextContinuity
      },
      priorContribution: priorProbability
    };
  }

  /**
   * Tính toán temporal relevance với exponential decay
   */
  private calculateTemporalRelevance(messageTimestamp: Date): number {
    const now = new Date();
    const hoursAgo = (now.getTime() - messageTimestamp.getTime()) / (1000 * 60 * 60);
    
    // Exponential decay với half-life
    const halfLife = this.config.temporalDecay.halfLife;
    const decay = Math.exp(-0.693 * hoursAgo / halfLife);
    
    return Math.max(this.config.temporalDecay.minRelevance, decay);
  }

  /**
   * Tính toán user interaction score
   */
  private calculateUserInteractionScore(message: HistoricalMessage): number {
    let score = 0.5; // Base score

    if (message.userMarked) score += 0.3;
    if (message.timesReferenced > 0) score += Math.min(0.2, message.timesReferenced * 0.05);
    
    return Math.min(1, score);
  }

  /**
   * Tính toán context continuity
   */
  private async calculateContextContinuity(
    message: HistoricalMessage,
    queryAnalysis: QueryAnalysis
  ): Promise<number> {
    // Simplified implementation - could be enhanced with conversation flow analysis
    return 0.5; // Placeholder
  }

  /**
   * Tính toán position prior
   */
  private calculatePositionPrior(message: HistoricalMessage): number {
    // Messages ở đầu và cuối conversation thường quan trọng hơn
    // This would need conversation position information
    return 0.5; // Placeholder
  }

  /**
   * Tạo context note cho LLM
   */
  private generateContextNote(
    selectedMessages: Array<{ message: HistoricalMessage; bayesianScore: BayesianPosterior; rank: number }>,
    queryAnalysis: QueryAnalysis
  ): string {
    if (selectedMessages.length === 0) {
      return "Lưu ý: Không tìm thấy thông tin liên quan từ lịch sử trò chuyện.";
    }

    const topMessage = selectedMessages[0];
    const avgProbability = selectedMessages.reduce((sum, m) => sum + m.bayesianScore.relevanceProbability, 0) / selectedMessages.length;

    let note = `Lưu ý: Dựa trên phân tích Bayesian, tôi đã chọn ${selectedMessages.length} thông tin quan trọng nhất từ lịch sử trò chuyện `;
    note += `(xác suất liên quan trung bình: ${(avgProbability * 100).toFixed(1)}%). `;

    if (queryAnalysis.queryIntent === 'question') {
      note += "Các thông tin này có thể giúp trả lời câu hỏi của bạn. ";
    } else if (queryAnalysis.queryIntent === 'clarification') {
      note += "Các thông tin này liên quan đến chủ đề bạn muốn làm rõ. ";
    }

    // Thêm thông tin về top message
    if (topMessage.bayesianScore.relevanceProbability > 0.8) {
      note += `Đặc biệt, có một thông tin rất liên quan (${(topMessage.bayesianScore.relevanceProbability * 100).toFixed(1)}% xác suất).`;
    }

    return note;
  }

  /**
   * Cập nhật statistics cho messages được chọn
   */
  private async updateMessageStatistics(
    selectedMessages: Array<{ message: HistoricalMessage; bayesianScore: BayesianPosterior; rank: number }>
  ): Promise<void> {
    for (const { message } of selectedMessages) {
      const sql = `
        UPDATE message_metadata
        SET
          user_marked = CASE WHEN user_marked THEN user_marked ELSE ? END,
          updated_at = CURRENT_TIMESTAMP
        WHERE message_id = ?
      `;

      // Tăng importance nếu được chọn bởi Bayesian analysis
      const shouldMark = message.bayesianScore?.relevanceProbability > 0.7;
      await runContextQuery(sql, [shouldMark, message.messageId]);
    }
  }

  /**
   * Lấy recent messages
   */
  private async getRecentMessages(chatId: string, count: number): Promise<HistoricalMessage[]> {
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
      ORDER BY mm.message_id DESC
      LIMIT ?
    `;

    const rows = await getContextQuery(sql, [chatId, count]);

    return rows.map((row: any) => ({
      messageId: row.message_id,
      chatId: row.chat_id,
      content: '', // Would need to fetch from main message store
      role: 'user' as const, // Would need to determine from message data
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

  /**
   * Extract evidence từ posterior để hiển thị
   */
  private extractEvidenceFromPosterior(posterior: BayesianPosterior): BayesianEvidence {
    const contrib = posterior.evidenceContribution;
    const weights = this.config.evidenceWeights;

    return {
      semanticSimilarity: contrib.semantic / weights.semantic,
      temporalRelevance: contrib.temporal / weights.temporal,
      entityOverlap: contrib.entity / weights.entity,
      topicSimilarity: contrib.topic / weights.topic,
      userInteractionScore: contrib.interaction / weights.interaction,
      contextContinuity: contrib.continuity / weights.continuity
    };
  }

  /**
   * Tính tổng tokens
   */
  private calculateTotalTokens(
    bayesianMessages: Array<{ message: HistoricalMessage; bayesianScore: BayesianPosterior; rank: number }>,
    recentMessages: HistoricalMessage[]
  ): number {
    const bayesianTokens = bayesianMessages.reduce((sum, m) => sum + m.message.tokenCount, 0);
    const recentTokens = recentMessages.reduce((sum, m) => sum + m.tokenCount, 0);
    return bayesianTokens + recentTokens;
  }

  /**
   * Tính compression ratio
   */
  private calculateCompressionRatio(bayesianCount: number, recentCount: number): number {
    const totalSelected = bayesianCount + recentCount;
    const estimatedFullHistory = totalSelected * 3; // Rough estimate
    return totalSelected / estimatedFullHistory;
  }

  /**
   * Merge với default config
   */
  private mergeWithDefaultConfig(config?: Partial<BayesianMemoryConfig>): BayesianMemoryConfig {
    const defaultConfig: BayesianMemoryConfig = {
      evidenceWeights: {
        semantic: 0.3,
        temporal: 0.15,
        entity: 0.2,
        topic: 0.15,
        interaction: 0.1,
        continuity: 0.1
      },
      priorWeights: {
        baseImportance: 0.3,
        messageType: 0.2,
        length: 0.15,
        position: 0.15,
        userMarked: 0.2
      },
      temporalDecay: {
        halfLife: 24, // 24 hours
        minRelevance: 0.1
      },
      thresholds: {
        minSemanticSimilarity: 0.3,
        minEntityOverlap: 0.1,
        minTopicSimilarity: 0.1,
        minRelevanceProbability: 0.4
      },
      maxHistorySize: 50,
      topKSelection: 5
    };

    return { ...defaultConfig, ...config };
  }
}
