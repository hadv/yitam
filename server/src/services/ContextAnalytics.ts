import { runContextQuery, getContextQuery, allContextQuery } from '../db/contextDatabase';

export interface ContextMetrics {
  totalConversations: number;
  totalMessages: number;
  totalTokens: number;
  averageCompressionRatio: number;
  cacheHitRate: number;
  averageProcessingTime: number;
  tokensSaved: number;
  costSavings: number;
}

export interface ConversationMetrics {
  chatId: string;
  messageCount: number;
  tokenCount: number;
  segmentCount: number;
  factCount: number;
  averageCompression: number;
  lastActivity: Date;
  totalSavings: number;
}

export interface PerformanceMetrics {
  operation: string;
  averageTime: number;
  totalOperations: number;
  cacheHitRate: number;
  errorRate: number;
}

export class ContextAnalytics {
  private costPerToken: number = 0.00001; // $0.01 per 1K tokens (rough estimate)

  /**
   * Get overall system metrics
   */
  async getSystemMetrics(): Promise<ContextMetrics> {
    const [
      conversationStats,
      compressionStats,
      cacheStats,
      performanceStats
    ] = await Promise.all([
      this.getConversationStats(),
      this.getCompressionStats(),
      this.getCacheStats(),
      this.getPerformanceStats()
    ]);

    const tokensSaved = compressionStats.originalTokens - compressionStats.compressedTokens;
    const costSavings = tokensSaved * this.costPerToken;

    return {
      totalConversations: conversationStats.totalConversations,
      totalMessages: conversationStats.totalMessages,
      totalTokens: conversationStats.totalTokens,
      averageCompressionRatio: compressionStats.averageRatio,
      cacheHitRate: cacheStats.hitRate,
      averageProcessingTime: performanceStats.averageTime,
      tokensSaved,
      costSavings
    };
  }

  /**
   * Get metrics for a specific conversation
   */
  async getConversationMetrics(chatId: string): Promise<ConversationMetrics> {
    const sql = `
      SELECT 
        c.chat_id,
        c.total_messages as message_count,
        c.total_tokens as token_count,
        (SELECT COUNT(*) FROM conversation_segments WHERE chat_id = c.chat_id) as segment_count,
        (SELECT COUNT(*) FROM key_facts WHERE chat_id = c.chat_id) as fact_count,
        c.last_activity,
        (SELECT AVG(compression_ratio) FROM context_analytics WHERE chat_id = c.chat_id AND compression_ratio IS NOT NULL) as average_compression
      FROM conversations c
      WHERE c.chat_id = ?
    `;

    const result = await getContextQuery(sql, [chatId]);
    
    if (!result) {
      throw new Error(`Conversation ${chatId} not found`);
    }

    // Calculate estimated savings
    const originalTokens = result.token_count / (result.average_compression || 1);
    const tokensSaved = originalTokens - result.token_count;
    const totalSavings = tokensSaved * this.costPerToken;

    return {
      chatId: result.chat_id,
      messageCount: result.message_count || 0,
      tokenCount: result.token_count || 0,
      segmentCount: result.segment_count || 0,
      factCount: result.fact_count || 0,
      averageCompression: result.average_compression || 1.0,
      lastActivity: new Date(result.last_activity),
      totalSavings
    };
  }

  /**
   * Get performance metrics by operation type
   */
  async getPerformanceMetricsByOperation(): Promise<PerformanceMetrics[]> {
    const sql = `
      SELECT 
        operation_type as operation,
        AVG(processing_time_ms) as average_time,
        COUNT(*) as total_operations,
        AVG(CASE WHEN cache_hit THEN 1.0 ELSE 0.0 END) as cache_hit_rate,
        0 as error_rate
      FROM context_analytics
      WHERE processing_time_ms IS NOT NULL
      GROUP BY operation_type
      ORDER BY total_operations DESC
    `;

    const results = await allContextQuery(sql);
    
    return results.map(row => ({
      operation: row.operation,
      averageTime: row.average_time || 0,
      totalOperations: row.total_operations || 0,
      cacheHitRate: row.cache_hit_rate || 0,
      errorRate: row.error_rate || 0
    }));
  }

  /**
   * Get compression efficiency over time
   */
  async getCompressionTrends(days: number = 7): Promise<Array<{date: string, compressionRatio: number, operations: number}>> {
    const sql = `
      SELECT 
        DATE(created_at) as date,
        AVG(compression_ratio) as compression_ratio,
        COUNT(*) as operations
      FROM context_analytics
      WHERE compression_ratio IS NOT NULL
        AND created_at >= datetime('now', '-${days} days')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    const results = await allContextQuery(sql);
    
    return results.map(row => ({
      date: row.date,
      compressionRatio: row.compression_ratio || 1.0,
      operations: row.operations || 0
    }));
  }

  /**
   * Get top conversations by activity
   */
  async getTopConversations(limit: number = 10): Promise<ConversationMetrics[]> {
    const sql = `
      SELECT 
        c.chat_id,
        c.total_messages as message_count,
        c.total_tokens as token_count,
        (SELECT COUNT(*) FROM conversation_segments WHERE chat_id = c.chat_id) as segment_count,
        (SELECT COUNT(*) FROM key_facts WHERE chat_id = c.chat_id) as fact_count,
        c.last_activity,
        (SELECT AVG(compression_ratio) FROM context_analytics WHERE chat_id = c.chat_id AND compression_ratio IS NOT NULL) as average_compression
      FROM conversations c
      ORDER BY c.total_messages DESC, c.last_activity DESC
      LIMIT ?
    `;

    const results = await allContextQuery(sql, [limit]);
    
    return results.map(row => {
      const originalTokens = row.token_count / (row.average_compression || 1);
      const tokensSaved = originalTokens - row.token_count;
      const totalSavings = tokensSaved * this.costPerToken;

      return {
        chatId: row.chat_id,
        messageCount: row.message_count || 0,
        tokenCount: row.token_count || 0,
        segmentCount: row.segment_count || 0,
        factCount: row.fact_count || 0,
        averageCompression: row.average_compression || 1.0,
        lastActivity: new Date(row.last_activity),
        totalSavings
      };
    });
  }

  /**
   * Record a context operation for analytics
   */
  async recordOperation(
    chatId: string,
    operation: string,
    inputTokens: number = 0,
    outputTokens: number = 0,
    processingTimeMs: number = 0,
    compressionRatio?: number,
    cacheHit: boolean = false
  ): Promise<void> {
    const sql = `
      INSERT INTO context_analytics 
      (chat_id, operation_type, input_tokens, output_tokens, processing_time_ms, compression_ratio, cache_hit)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    await runContextQuery(sql, [
      chatId,
      operation,
      inputTokens,
      outputTokens,
      processingTimeMs,
      compressionRatio || null,
      cacheHit
    ]);
  }

  /**
   * Clean up old analytics data
   */
  async cleanupOldData(retentionDays: number = 30): Promise<number> {
    const sql = `
      DELETE FROM context_analytics 
      WHERE created_at < datetime('now', '-${retentionDays} days')
    `;

    const result = await runContextQuery(sql);
    return result.changes || 0;
  }

  /**
   * Generate analytics report
   */
  async generateReport(): Promise<string> {
    const metrics = await this.getSystemMetrics();
    const performanceMetrics = await this.getPerformanceMetricsByOperation();
    const topConversations = await this.getTopConversations(5);
    const trends = await getCompressionTrends(7);

    const report = `
# Yitam Context Engine Analytics Report
Generated: ${new Date().toISOString()}

## System Overview
- Total Conversations: ${metrics.totalConversations}
- Total Messages: ${metrics.totalMessages.toLocaleString()}
- Total Tokens: ${metrics.totalTokens.toLocaleString()}
- Average Compression: ${(metrics.averageCompressionRatio * 100).toFixed(1)}%
- Cache Hit Rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%
- Tokens Saved: ${metrics.tokensSaved.toLocaleString()}
- Estimated Cost Savings: $${metrics.costSavings.toFixed(2)}

## Performance Metrics
${performanceMetrics.map(p => 
  `- ${p.operation}: ${p.averageTime.toFixed(1)}ms avg, ${p.totalOperations} ops, ${(p.cacheHitRate * 100).toFixed(1)}% cache hit`
).join('\n')}

## Top Conversations
${topConversations.map((c, i) => 
  `${i + 1}. ${c.chatId}: ${c.messageCount} messages, ${(c.averageCompression * 100).toFixed(1)}% compression, $${c.totalSavings.toFixed(2)} saved`
).join('\n')}

## Compression Trends (Last 7 Days)
${trends.map(t => 
  `- ${t.date}: ${(t.compressionRatio * 100).toFixed(1)}% compression (${t.operations} operations)`
).join('\n')}
    `.trim();

    return report;
  }

  // Private helper methods

  private async getConversationStats(): Promise<{totalConversations: number, totalMessages: number, totalTokens: number}> {
    const sql = `
      SELECT 
        COUNT(*) as total_conversations,
        SUM(total_messages) as total_messages,
        SUM(total_tokens) as total_tokens
      FROM conversations
    `;

    const result = await getContextQuery(sql);
    return {
      totalConversations: result?.total_conversations || 0,
      totalMessages: result?.total_messages || 0,
      totalTokens: result?.total_tokens || 0
    };
  }

  private async getCompressionStats(): Promise<{averageRatio: number, originalTokens: number, compressedTokens: number}> {
    const sql = `
      SELECT 
        AVG(compression_ratio) as average_ratio,
        SUM(input_tokens) as original_tokens,
        SUM(output_tokens) as compressed_tokens
      FROM context_analytics
      WHERE compression_ratio IS NOT NULL
    `;

    const result = await getContextQuery(sql);
    return {
      averageRatio: result?.average_ratio || 1.0,
      originalTokens: result?.original_tokens || 0,
      compressedTokens: result?.compressed_tokens || 0
    };
  }

  private async getCacheStats(): Promise<{hitRate: number, totalRequests: number}> {
    const sql = `
      SELECT 
        AVG(CASE WHEN cache_hit THEN 1.0 ELSE 0.0 END) as hit_rate,
        COUNT(*) as total_requests
      FROM context_analytics
    `;

    const result = await getContextQuery(sql);
    return {
      hitRate: result?.hit_rate || 0,
      totalRequests: result?.total_requests || 0
    };
  }

  private async getPerformanceStats(): Promise<{averageTime: number, totalOperations: number}> {
    const sql = `
      SELECT 
        AVG(processing_time_ms) as average_time,
        COUNT(*) as total_operations
      FROM context_analytics
      WHERE processing_time_ms IS NOT NULL
    `;

    const result = await getContextQuery(sql);
    return {
      averageTime: result?.average_time || 0,
      totalOperations: result?.total_operations || 0
    };
  }
}

// Helper function for trends (fix the reference)
async function getCompressionTrends(days: number): Promise<Array<{date: string, compressionRatio: number, operations: number}>> {
  const sql = `
    SELECT 
      DATE(created_at) as date,
      AVG(compression_ratio) as compression_ratio,
      COUNT(*) as operations
    FROM context_analytics
    WHERE compression_ratio IS NOT NULL
      AND created_at >= datetime('now', '-${days} days')
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `;

  const results = await allContextQuery(sql);
  
  return results.map(row => ({
    date: row.date,
    compressionRatio: row.compression_ratio || 1.0,
    operations: row.operations || 0
  }));
}
