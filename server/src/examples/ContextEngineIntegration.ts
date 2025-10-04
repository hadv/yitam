/**
 * Example integration of Context Engine into the main server application
 * This shows how to replace direct Anthropic API calls with context-aware calls
 */

import { ContextEngine } from '../services/ContextEngine';
import { getContextConfig } from '../config/contextEngine';
import Anthropic from '@anthropic-ai/sdk';

export class ContextAwareConversationHandler {
  private contextEngine: ContextEngine;
  private anthropic: Anthropic;
  private isInitialized: boolean = false;

  constructor(apiKey: string) {
    // Initialize Anthropic client
    this.anthropic = new Anthropic({ apiKey });

    // Initialize Context Engine with production config
    const contextConfig = getContextConfig({
      contextEngine: {
        maxRecentMessages: parseInt(process.env.CONTEXT_MAX_RECENT_MESSAGES || '10'),
        maxContextTokens: parseInt(process.env.CONTEXT_MAX_TOKENS || '12000'),
        summarizationThreshold: parseInt(process.env.CONTEXT_SUMMARIZATION_THRESHOLD || '20'),
        importanceThreshold: parseFloat(process.env.CONTEXT_IMPORTANCE_THRESHOLD || '0.3'),
        vectorSearchLimit: parseInt(process.env.CONTEXT_VECTOR_SEARCH_LIMIT || '5'),
        cacheExpiration: parseInt(process.env.CONTEXT_CACHE_EXPIRATION || '30'),
        useBayesianMemory: process.env.CONTEXT_USE_BAYESIAN_MEMORY !== 'false'
      },
      vectorStore: {
        provider: (process.env.VECTOR_STORE_PROVIDER as any) || 'qdrant',
        endpoint: process.env.VECTOR_STORE_ENDPOINT || process.env.QDRANT_URL,
        apiKey: process.env.QDRANT_API_KEY,
        collectionName: process.env.VECTOR_STORE_COLLECTION || 'yitam_context',
        dimension: parseInt(process.env.VECTOR_STORE_DIMENSION || '768'),
        embeddingModel: process.env.EMBEDDING_MODEL || 'gemini-embedding-001'
      },
      enableMCPServer: process.env.ENABLE_MCP_SERVER === 'true'
    });

    this.contextEngine = new ContextEngine(contextConfig.contextEngine);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.contextEngine.initialize();
      this.isInitialized = true;
      console.log('Context-aware conversation handler initialized successfully');
    } catch (error) {
      console.error('Failed to initialize context engine:', error);
      throw error;
    }
  }

  /**
   * Process a chat message with context awareness
   * This replaces the direct Anthropic API call in the main server
   */
  async processMessage(
    chatId: string,
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    personaId?: string
  ): Promise<AsyncIterable<any>> {
    await this.initialize();

    try {
      // Store the user message in context engine
      await this.contextEngine.addMessage(chatId, {
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
        metadata: { personaId }
      });

      // Get optimized context instead of using full conversation history
      const contextWindow = await this.contextEngine.getOptimizedContext(chatId, userMessage);

      console.log(`Context optimization: ${conversationHistory.length} messages → ${contextWindow.messages.length} messages`);
      console.log(`Token reduction: ~${conversationHistory.length * 100} → ${contextWindow.totalTokens} tokens`);

      // Use optimized context for Anthropic API call
      const stream = await this.anthropic.messages.stream({
        model: process.env.MODEL_NAME || 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        messages: contextWindow.messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        // Include context summary if available
        system: contextWindow.summary ? 
          `Previous conversation context: ${contextWindow.summary}\n\nPlease respond naturally while being aware of this context.` : 
          undefined
      });

      // Store assistant response as it streams
      let assistantResponse = '';
      const originalStream = stream;

      // Create a new async generator that captures the response
      async function* captureResponse() {
        for await (const chunk of originalStream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text') {
            assistantResponse += chunk.delta.text;
          }
          yield chunk;
        }
      }

      const capturedStream = captureResponse();

      // Store the complete assistant response after streaming
      stream.finalMessage().then(async (message) => {
        if (message.content[0]?.type === 'text') {
          await this.contextEngine.addMessage(chatId, {
            role: 'assistant',
            content: message.content[0].text,
            timestamp: new Date(),
            metadata: { personaId, tokenCount: message.usage?.output_tokens }
          });
        }
      }).catch(error => {
        console.error('Error storing assistant message in context:', error);
      });

      return capturedStream;

    } catch (error) {
      console.error('Error in context-aware message processing:', error);
      
      // Fallback to direct API call without context optimization
      console.log('Falling back to direct API call');
      return await this.anthropic.messages.stream({
        model: process.env.MODEL_NAME || 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        messages: conversationHistory
      });
    }
  }

  /**
   * Generate title with context awareness
   */
  async generateTitle(chatId: string, conversation: string): Promise<string> {
    await this.initialize();

    try {
      // Use context engine to get relevant conversation snippets
      const contextWindow = await this.contextEngine.getOptimizedContext(chatId);
      
      // Use the most important parts of the conversation for title generation
      const relevantContent = contextWindow.messages
        .slice(-5) // Last 5 messages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      const prompt = `Dưới đây là một đoạn hội thoại. Hãy tạo một tiêu đề ngắn gọn (không quá 50 ký tự) mô tả nội dung chính của cuộc trò chuyện này. Tiêu đề phải bằng tiếng Việt, có ý nghĩa và dễ hiểu.

Hội thoại:
${relevantContent}

Tiêu đề:`;

      const response = await this.anthropic.messages.create({
        model: process.env.MODEL_NAME || 'claude-3-5-sonnet-20241022',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }]
      });

      const title = response.content[0]?.type === 'text' ? 
        response.content[0].text.trim() : 
        'New Conversation';

      return title;

    } catch (error) {
      console.error('Error generating context-aware title:', error);
      return 'New Conversation';
    }
  }

  /**
   * Get conversation analytics
   */
  async getConversationAnalytics(chatId: string) {
    await this.initialize();
    return await this.contextEngine.getAnalytics(chatId);
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.contextEngine) {
      await this.contextEngine.cleanup();
    }
  }
}

/**
 * Factory function to create context-aware handler
 */
export function createContextAwareHandler(apiKey: string): ContextAwareConversationHandler {
  return new ContextAwareConversationHandler(apiKey);
}

/**
 * Check if context engine is enabled
 */
export function isContextEngineEnabled(): boolean {
  return process.env.CONTEXT_ENGINE_ENABLED === 'true';
}
