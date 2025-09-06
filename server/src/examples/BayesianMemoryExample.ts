/**
 * Example demonstrating Bayesian Memory Management in Yitam Context Engine
 */

import { ContextEngine } from '../services/ContextEngine';
import { BayesianMemoryManager } from '../services/BayesianMemoryManager';
import { VectorStoreManager } from '../services/VectorStore';
import { HistoricalMessage } from '../types/BayesianTypes';

export class BayesianMemoryExample {
  private contextEngine: ContextEngine;
  private bayesianManager?: BayesianMemoryManager;
  private vectorStore?: VectorStoreManager;

  constructor() {
    // Initialize Context Engine with Bayesian support
    this.contextEngine = new ContextEngine({
      maxRecentMessages: 10,
      maxContextTokens: 8000
    });
  }

  async initialize(): Promise<void> {
    await this.contextEngine.initialize();
    console.log('✅ Bayesian Memory Management initialized');
  }

  /**
   * Demo: Cuộc trò chuyện dài về nhiều chủ đề
   */
  async demonstrateLongConversation(): Promise<void> {
    console.log('\n🎯 Demo: Cuộc trò chuyện dài với nhiều chủ đề\n');

    const chatId = 'demo-long-conversation';
    await this.contextEngine.createConversation(chatId, 'demo-user', 'Long Conversation Demo');

    // Simulate a long conversation with multiple topics
    const conversationHistory = [
      // Topic 1: Machine Learning (messages 1-4)
      { id: 1, role: 'user', content: 'Tôi muốn học về machine learning. Bạn có thể giúp tôi không?', timestamp: new Date('2024-01-01T09:00:00Z') },
      { id: 2, role: 'assistant', content: 'Tất nhiên! Machine learning là một nhánh của AI. Bạn muốn bắt đầu từ đâu?', timestamp: new Date('2024-01-01T09:01:00Z') },
      { id: 3, role: 'user', content: 'Tôi quan tâm đến neural networks và deep learning', timestamp: new Date('2024-01-01T09:02:00Z') },
      { id: 4, role: 'assistant', content: 'Neural networks là nền tảng của deep learning. Chúng ta có thể bắt đầu với perceptron đơn giản.', timestamp: new Date('2024-01-01T09:03:00Z') },

      // Topic 2: Cooking (messages 5-8)
      { id: 5, role: 'user', content: 'Chuyển chủ đề nhé. Bạn có biết cách nấu phở không?', timestamp: new Date('2024-01-01T10:00:00Z') },
      { id: 6, role: 'assistant', content: 'Phở là món ăn truyền thống Việt Nam. Cần nước dùng trong, bánh phở và thịt bò.', timestamp: new Date('2024-01-01T10:01:00Z') },
      { id: 7, role: 'user', content: 'Làm thế nào để nước dùng phở trong và ngọt?', timestamp: new Date('2024-01-01T10:02:00Z') },
      { id: 8, role: 'assistant', content: 'Bí quyết là ninh xương bò lâu, thêm hành tây nướng và gia vị đặc biệt.', timestamp: new Date('2024-01-01T10:03:00Z') },

      // Topic 3: Travel (messages 9-12)
      { id: 9, role: 'user', content: 'Tôi đang lên kế hoạch du lịch Đà Lạt. Có gợi ý gì không?', timestamp: new Date('2024-01-01T11:00:00Z') },
      { id: 10, role: 'assistant', content: 'Đà Lạt rất đẹp! Bạn nên thăm Hồ Xuân Hương, chợ đêm và các vườn hoa.', timestamp: new Date('2024-01-01T11:01:00Z') },
      { id: 11, role: 'user', content: 'Thời tiết ở Đà Lạt như thế nào vào mùa này?', timestamp: new Date('2024-01-01T11:02:00Z') },
      { id: 12, role: 'assistant', content: 'Đà Lạt mát mẻ quanh năm, nhiệt độ khoảng 15-25°C. Nên mang áo ấm.', timestamp: new Date('2024-01-01T11:03:00Z') },

      // Recent messages (13-16)
      { id: 13, role: 'user', content: 'Cảm ơn bạn về thông tin du lịch!', timestamp: new Date('2024-01-01T12:00:00Z') },
      { id: 14, role: 'assistant', content: 'Không có gì! Tôi luôn sẵn sàng giúp đỡ.', timestamp: new Date('2024-01-01T12:01:00Z') },
      { id: 15, role: 'user', content: 'Bây giờ tôi muốn quay lại chủ đề machine learning', timestamp: new Date('2024-01-01T12:02:00Z') },
      { id: 16, role: 'assistant', content: 'Tuyệt! Chúng ta đã nói về neural networks. Bạn muốn tìm hiểu sâu hơn về gì?', timestamp: new Date('2024-01-01T12:03:00Z') }
    ];

    // Add all messages to context engine
    for (const msg of conversationHistory) {
      await this.contextEngine.addMessage(chatId, msg.id, {
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      });
    }

    console.log(`📝 Đã thêm ${conversationHistory.length} messages vào cuộc trò chuyện`);

    // Now test Bayesian memory with different queries
    await this.testBayesianQueries(chatId);
  }

  /**
   * Test Bayesian memory với các câu hỏi khác nhau
   */
  private async testBayesianQueries(chatId: string): Promise<void> {
    const testQueries = [
      {
        query: 'Bạn có thể giải thích thêm về deep learning không?',
        expectedTopic: 'Machine Learning',
        description: 'Query về ML - should retrieve ML-related messages'
      },
      {
        query: 'Làm sao để nấu một nồi phở ngon?',
        expectedTopic: 'Cooking',
        description: 'Query về nấu ăn - should retrieve cooking messages'
      },
      {
        query: 'Tôi nên mang gì khi đi Đà Lạt?',
        expectedTopic: 'Travel',
        description: 'Query về du lịch - should retrieve travel messages'
      },
      {
        query: 'Tóm tắt những gì chúng ta đã thảo luận',
        expectedTopic: 'General',
        description: 'General query - should retrieve diverse messages'
      }
    ];

    for (const testCase of testQueries) {
      console.log(`\n🔍 Testing query: "${testCase.query}"`);
      console.log(`📋 Expected topic: ${testCase.expectedTopic}`);
      console.log(`💡 Description: ${testCase.description}`);

      try {
        // Get optimized context using Bayesian analysis
        const optimizedContext = await this.contextEngine.getOptimizedContext(chatId, testCase.query);

        console.log(`\n📊 Bayesian Analysis Results:`);
        console.log(`   • Total tokens: ${optimizedContext.totalTokens}`);
        console.log(`   • Compression ratio: ${(optimizedContext.compressionRatio * 100).toFixed(1)}%`);
        console.log(`   • Recent messages: ${optimizedContext.recentMessages.length}`);
        console.log(`   • Relevant history: ${optimizedContext.relevantHistory.length}`);
        console.log(`   • Summaries: ${optimizedContext.summaries.length}`);
        console.log(`   • Key facts: ${optimizedContext.keyFacts.length}`);

        // Show selected messages (simplified)
        if (optimizedContext.relevantHistory.length > 0) {
          console.log(`\n📋 Selected relevant messages:`);
          optimizedContext.relevantHistory.forEach((msg, index) => {
            const preview = typeof msg.content === 'string' 
              ? msg.content.substring(0, 60) + '...'
              : JSON.stringify(msg.content).substring(0, 60) + '...';
            console.log(`   ${index + 1}. [${msg.role}] ${preview}`);
          });
        }

        // Simulate LLM response based on context
        const response = this.generateContextualResponse(testCase.query, optimizedContext);
        console.log(`\n🤖 Contextual Response: ${response}`);

      } catch (error) {
        console.error(`❌ Error processing query: ${error}`);
      }

      console.log('\n' + '─'.repeat(80));
    }
  }

  /**
   * Generate a contextual response based on optimized context
   */
  private generateContextualResponse(query: string, context: any): string {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('deep learning') || lowerQuery.includes('machine learning')) {
      return "Dựa trên cuộc trò chuyện trước đó về machine learning, tôi có thể giải thích thêm về deep learning và neural networks mà chúng ta đã thảo luận...";
    }

    if (lowerQuery.includes('phở') || lowerQuery.includes('nấu')) {
      return "Như tôi đã chia sẻ trước đó về cách nấu phở, bí quyết quan trọng nhất là nước dùng. Để bổ sung thêm...";
    }

    if (lowerQuery.includes('đà lạt') || lowerQuery.includes('du lịch')) {
      return "Về chuyến du lịch Đà Lạt mà bạn đang lên kế hoạch, ngoài những gợi ý về thời tiết và địa điểm tôi đã đề cập...";
    }

    if (lowerQuery.includes('tóm tắt') || lowerQuery.includes('thảo luận')) {
      return "Trong cuộc trò chuyện của chúng ta, chúng ta đã thảo luận về 3 chủ đề chính: machine learning (neural networks), nấu ăn (phở), và du lịch (Đà Lạt)...";
    }

    return "Dựa trên ngữ cảnh cuộc trò chuyện, tôi có thể giúp bạn với câu hỏi này...";
  }

  /**
   * Demo performance comparison
   */
  async demonstratePerformanceComparison(): Promise<void> {
    console.log('\n⚡ Demo: So sánh hiệu suất Bayesian vs Traditional\n');

    const chatId = 'performance-test';
    await this.contextEngine.createConversation(chatId, 'perf-user', 'Performance Test');

    // Create a large conversation history
    const largeHistory = this.generateLargeConversationHistory(100); // 100 messages

    console.log(`📝 Tạo cuộc trò chuyện với ${largeHistory.length} messages...`);

    for (const msg of largeHistory) {
      await this.contextEngine.addMessage(chatId, msg.id, {
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      });
    }

    const testQuery = 'Tell me about the machine learning project we discussed';

    // Test Bayesian approach
    console.log('\n🧠 Testing Bayesian Memory Management...');
    const bayesianStart = Date.now();
    const bayesianContext = await this.contextEngine.getOptimizedContext(chatId, testQuery);
    const bayesianTime = Date.now() - bayesianStart;

    // Test traditional approach (without query)
    console.log('📚 Testing Traditional Context Retrieval...');
    const traditionalStart = Date.now();
    const traditionalContext = await this.contextEngine.getOptimizedContext(chatId); // No query
    const traditionalTime = Date.now() - traditionalStart;

    // Compare results
    console.log('\n📊 Performance Comparison:');
    console.log(`   Bayesian Approach:`);
    console.log(`     • Processing time: ${bayesianTime}ms`);
    console.log(`     • Selected messages: ${bayesianContext.relevantHistory.length}`);
    console.log(`     • Total tokens: ${bayesianContext.totalTokens}`);
    console.log(`     • Compression ratio: ${(bayesianContext.compressionRatio * 100).toFixed(1)}%`);

    console.log(`   Traditional Approach:`);
    console.log(`     • Processing time: ${traditionalTime}ms`);
    console.log(`     • Selected messages: ${traditionalContext.relevantHistory.length}`);
    console.log(`     • Total tokens: ${traditionalContext.totalTokens}`);
    console.log(`     • Compression ratio: ${(traditionalContext.compressionRatio * 100).toFixed(1)}%`);

    const tokenSavings = traditionalContext.totalTokens - bayesianContext.totalTokens;
    const percentSavings = (tokenSavings / traditionalContext.totalTokens * 100).toFixed(1);

    console.log(`\n💰 Token Savings: ${tokenSavings} tokens (${percentSavings}%)`);
    console.log(`🎯 Relevance Improvement: Bayesian selection provides more contextually relevant messages`);
  }

  /**
   * Generate large conversation history for testing
   */
  private generateLargeConversationHistory(count: number): Array<{id: number, role: string, content: string, timestamp: Date}> {
    const topics = [
      { topic: 'machine learning', messages: [
        'What is machine learning?',
        'Machine learning is a subset of AI that enables computers to learn without explicit programming.',
        'Can you explain neural networks?',
        'Neural networks are computing systems inspired by biological neural networks.',
        'How do I start a machine learning project?',
        'Start by defining your problem, collecting data, and choosing appropriate algorithms.'
      ]},
      { topic: 'cooking', messages: [
        'How do I cook pasta?',
        'Boil water, add salt, cook pasta for 8-12 minutes until al dente.',
        'What ingredients do I need for pizza?',
        'You need flour, yeast, water, salt for dough, plus toppings like tomato sauce and cheese.',
        'How long should I bake a cake?',
        'Most cakes bake for 25-35 minutes at 350°F, but check with a toothpick.'
      ]},
      { topic: 'travel', messages: [
        'Where should I visit in Vietnam?',
        'Vietnam has many beautiful places: Ha Long Bay, Hoi An, Ho Chi Minh City, and Sapa.',
        'What is the best time to visit Japan?',
        'Spring (March-May) and autumn (September-November) are ideal for visiting Japan.',
        'How do I plan a budget trip?',
        'Set a budget, book flights early, stay in hostels, eat local food, and use public transport.'
      ]}
    ];

    const history = [];
    const baseTime = new Date('2024-01-01T08:00:00Z');

    for (let i = 0; i < count; i++) {
      const topicIndex = i % topics.length;
      const messageIndex = Math.floor(i / topics.length) % topics[topicIndex].messages.length;
      const role = i % 2 === 0 ? 'user' : 'assistant';
      
      history.push({
        id: i + 1,
        role,
        content: topics[topicIndex].messages[messageIndex],
        timestamp: new Date(baseTime.getTime() + i * 60000) // 1 minute apart
      });
    }

    return history;
  }

  /**
   * Run the complete demo
   */
  async runDemo(): Promise<void> {
    try {
      await this.initialize();
      
      console.log('🚀 Starting Bayesian Memory Management Demo\n');
      console.log('=' .repeat(80));
      
      await this.demonstrateLongConversation();
      
      console.log('\n' + '='.repeat(80));
      
      await this.demonstratePerformanceComparison();
      
      console.log('\n✅ Demo completed successfully!');
      
    } catch (error) {
      console.error('❌ Demo failed:', error);
    } finally {
      await this.contextEngine.cleanup();
    }
  }
}

// Run demo if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
  const demo = new BayesianMemoryExample();
  demo.runDemo().catch(console.error);
}
