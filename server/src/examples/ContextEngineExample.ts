#!/usr/bin/env ts-node

/**
 * Complete example of integrating Yitam Context Engine
 * This demonstrates how to replace the existing conversation system
 * with the context-aware version for cost optimization
 */

import { EnhancedConversation } from '../services/EnhancedConversation';
import { ContextAnalytics } from '../services/ContextAnalytics';
import { getContextConfig } from '../config/contextEngine';

// Simulate the existing Query service structure
class ExampleQueryService {
  private conversation: EnhancedConversation;
  private analytics: ContextAnalytics;

  constructor() {
    // Initialize with context engine enabled
    this.conversation = new EnhancedConversation({
      enableContextEngine: true,
      maxContextTokens: 8000,
      compressionThreshold: 15,
      vectorStoreConfig: getContextConfig().vectorStore
    });

    this.analytics = new ContextAnalytics();
  }

  /**
   * Get current chat ID
   */
  getCurrentChatId(): string | undefined {
    return this.conversation.getCurrentChatId();
  }

  /**
   * Process a query with context optimization
   * This replaces the existing processQuery method
   */
  async processQuery(query: string, chatId?: string): Promise<string> {
    const startTime = Date.now();
    
    try {
      // Start new chat or continue existing one
      if (!chatId || chatId !== this.conversation.getCurrentChatId()) {
        chatId = await this.conversation.startNewChat();
        console.log(`🆕 Started new chat: ${chatId}`);
      }

      // Add user message
      await this.conversation.addUserMessage(query);

      // Get optimized conversation history (this is the key change!)
      const optimizedHistory = await this.conversation.getConversationHistory(query);
      
      // Log context optimization results
      console.log(`📊 Context optimization:`);
      console.log(`   Messages in context: ${optimizedHistory.length}`);
      
      // Estimate token usage
      const totalTokens = this.estimateTokens(optimizedHistory);
      console.log(`   Estimated tokens: ${totalTokens}`);

      // Simulate LLM API call (replace with actual Anthropic call)
      const response = await this.simulateLLMCall(optimizedHistory, query);

      // Add assistant response
      await this.conversation.addAssistantMessage(response);

      // Record analytics
      const processingTime = Date.now() - startTime;
      await this.analytics.recordOperation(
        chatId,
        'query_processing',
        totalTokens,
        this.estimateTokens([{ role: 'assistant', content: response }]),
        processingTime
      );

      return response;

    } catch (error) {
      console.error('Error processing query:', error);
      throw error;
    }
  }

  /**
   * Get conversation statistics and analytics
   */
  async getConversationAnalytics(chatId?: string): Promise<any> {
    if (chatId) {
      return await this.analytics.getConversationMetrics(chatId);
    } else {
      return await this.analytics.getSystemMetrics();
    }
  }

  /**
   * Mark important messages for better context retention
   */
  async markImportantMessage(messageId: number): Promise<void> {
    await this.conversation.markMessageImportant(messageId, true);
    console.log(`⭐ Marked message ${messageId} as important`);
  }

  /**
   * Add key facts for persistent memory
   */
  async addKeyFact(fact: string, type: 'decision' | 'preference' | 'fact' | 'goal' = 'fact'): Promise<void> {
    const chatId = this.conversation.getCurrentChatId();
    await this.conversation.addKeyFact(fact, type);
    console.log(`📝 Added ${type}: ${fact}`);
  }

  /**
   * Search conversation history semantically
   */
  async searchConversation(query: string, limit: number = 5): Promise<any[]> {
    return await this.conversation.searchRelevantMessages(query, limit);
  }

  // Helper methods

  private async simulateLLMCall(messages: any[], query: string): Promise<string> {
    // This would be replaced with actual Anthropic API call
    // For demo purposes, we'll simulate a response
    
    console.log(`🤖 Simulating LLM call with ${messages.length} messages`);
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Generate a contextual response based on the query
    if (query.toLowerCase().includes('summary')) {
      return "Based on our conversation, here's a summary of the key points we've discussed...";
    } else if (query.toLowerCase().includes('help')) {
      return "I'd be happy to help! Based on our previous discussion, I can assist you with...";
    } else {
      return `I understand you're asking about "${query}". Let me provide you with a helpful response based on our conversation context.`;
    }
  }

  private estimateTokens(messages: any[]): number {
    return messages.reduce((total, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return total + Math.ceil(content.length / 4);
    }, 0);
  }
}

// Example usage and demonstration
async function demonstrateContextEngine() {
  console.log('🚀 Yitam Context Engine Integration Example\n');

  const queryService = new ExampleQueryService();

  // Simulate a long conversation
  const queries = [
    "I'm planning a vacation to Europe. Can you help me?",
    "I want to visit France, Italy, and Spain in 2 weeks.",
    "My budget is around $5000 for everything including flights.",
    "I prefer cultural experiences over nightlife.",
    "What's the best time to visit these countries?",
    "Can you recommend some must-see museums in Paris?",
    "What about food recommendations in Italy?",
    "I'm interested in flamenco shows in Spain.",
    "How should I plan my transportation between countries?",
    "What kind of accommodation would you recommend?",
    "I have some dietary restrictions - I'm vegetarian.",
    "What should I pack for the weather in May?",
    "Do I need any special documents or visas?",
    "Can you help me create a day-by-day itinerary?",
    "What are some budget-friendly tips for this trip?",
    "How can I stay connected with internet while traveling?",
    "What are some cultural etiquette tips I should know?",
    "Can you recommend some language learning apps?",
    "What's the best way to handle money and payments?",
    "Can you summarize all the recommendations you've given me?"
  ];

  let chatId: string | undefined;

  console.log('💬 Processing conversation with context optimization...\n');

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    console.log(`Query ${i + 1}: "${query}"`);
    
    try {
      const response = await queryService.processQuery(query, chatId);
      
      if (!chatId) {
        chatId = queryService.getCurrentChatId();
      }
      
      console.log(`Response: ${response.substring(0, 100)}...\n`);

      // Add some key facts at strategic points
      if (i === 2) {
        await queryService.addKeyFact("User's budget is $5000 for 2-week Europe trip", 'fact');
      }
      if (i === 3) {
        await queryService.addKeyFact("User prefers cultural experiences over nightlife", 'preference');
      }
      if (i === 10) {
        await queryService.addKeyFact("User is vegetarian", 'preference');
      }

      // Mark important messages
      if (i === 1 || i === 2 || i === 10) {
        await queryService.markImportantMessage(i + 1);
      }

    } catch (error) {
      console.error(`Error processing query ${i + 1}:`, error);
    }
  }

  // Show analytics
  console.log('📊 Final Analytics Report:\n');
  
  if (chatId) {
    const conversationMetrics = await queryService.getConversationAnalytics(chatId);
    console.log('Conversation Metrics:');
    console.log(`- Messages: ${conversationMetrics.messageCount}`);
    console.log(`- Tokens: ${conversationMetrics.tokenCount.toLocaleString()}`);
    console.log(`- Segments: ${conversationMetrics.segmentCount}`);
    console.log(`- Key Facts: ${conversationMetrics.factCount}`);
    console.log(`- Compression: ${(conversationMetrics.averageCompression * 100).toFixed(1)}%`);
    console.log(`- Estimated Savings: $${conversationMetrics.totalSavings.toFixed(2)}\n`);
  }

  const systemMetrics = await queryService.getConversationAnalytics();
  console.log('System Metrics:');
  console.log(`- Total Conversations: ${systemMetrics.totalConversations}`);
  console.log(`- Total Messages: ${systemMetrics.totalMessages.toLocaleString()}`);
  console.log(`- Total Tokens: ${systemMetrics.totalTokens.toLocaleString()}`);
  console.log(`- Average Compression: ${(systemMetrics.averageCompressionRatio * 100).toFixed(1)}%`);
  console.log(`- Cache Hit Rate: ${(systemMetrics.cacheHitRate * 100).toFixed(1)}%`);
  console.log(`- Total Tokens Saved: ${systemMetrics.tokensSaved.toLocaleString()}`);
  console.log(`- Total Cost Savings: $${systemMetrics.costSavings.toFixed(2)}\n`);

  // Demonstrate semantic search
  console.log('🔍 Semantic Search Example:');
  const searchResults = await queryService.searchConversation("budget and money", 3);
  console.log(`Found ${searchResults.length} relevant messages about budget:`);
  searchResults.forEach((result, index) => {
    console.log(`${index + 1}. Similarity: ${(result.similarity * 100).toFixed(1)}% - "${result.content.substring(0, 80)}..."`);
  });

  console.log('\n✅ Context Engine integration example completed!');
  console.log('\n💡 Key Benefits Demonstrated:');
  console.log('- Automatic context optimization based on query relevance');
  console.log('- Significant token usage reduction for long conversations');
  console.log('- Persistent key facts and important message marking');
  console.log('- Semantic search capabilities');
  console.log('- Comprehensive analytics and monitoring');
  console.log('- Drop-in replacement for existing conversation management');
}

// Integration comparison
async function compareWithTraditionalApproach() {
  console.log('\n📈 Comparison: Traditional vs Context Engine\n');

  // Simulate traditional approach (sending all messages)
  const traditionalTokens = 20 * 200; // 20 messages * 200 tokens each = 4000 tokens
  const traditionalCost = traditionalTokens * 0.00001; // $0.01 per 1K tokens

  // Context engine approach (optimized)
  const optimizedTokens = 8 * 200; // 8 relevant messages * 200 tokens = 1600 tokens
  const optimizedCost = optimizedTokens * 0.00001;

  const tokenSavings = traditionalTokens - optimizedTokens;
  const costSavings = traditionalCost - optimizedCost;
  const percentageSavings = (tokenSavings / traditionalTokens) * 100;

  console.log('Traditional Approach:');
  console.log(`- Tokens sent: ${traditionalTokens.toLocaleString()}`);
  console.log(`- Cost per query: $${traditionalCost.toFixed(4)}`);
  console.log('');
  console.log('Context Engine Approach:');
  console.log(`- Tokens sent: ${optimizedTokens.toLocaleString()}`);
  console.log(`- Cost per query: $${optimizedCost.toFixed(4)}`);
  console.log('');
  console.log('Savings:');
  console.log(`- Tokens saved: ${tokenSavings.toLocaleString()} (${percentageSavings.toFixed(1)}%)`);
  console.log(`- Cost saved per query: $${costSavings.toFixed(4)}`);
  console.log(`- Monthly savings (1000 queries): $${(costSavings * 1000).toFixed(2)}`);
  console.log(`- Annual savings (12K queries): $${(costSavings * 12000).toFixed(2)}`);
}

// Main execution
async function main() {
  try {
    await demonstrateContextEngine();
    await compareWithTraditionalApproach();
  } catch (error) {
    console.error('❌ Example failed:', error);
    process.exit(1);
  }
}

// Export for use in other files
export { ExampleQueryService };

// Run if this file is executed directly
if (require.main === module) {
  main();
}
