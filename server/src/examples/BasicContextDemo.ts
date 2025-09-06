/**
 * Basic demo for Context Engine without Bayesian complexity
 */

import { ContextEngine } from '../services/ContextEngine';

async function runBasicDemo() {
  console.log('🚀 Starting Basic Context Engine Demo\n');

  try {
    // Initialize Context Engine with basic config
    const contextEngine = new ContextEngine({
      maxRecentMessages: 5,
      maxContextTokens: 4000,
      summarizationThreshold: 10,
      importanceThreshold: 0.5,
      vectorSearchLimit: 3,
      cacheExpiration: 30
    });

    console.log('⏳ Initializing Context Engine...');
    await contextEngine.initialize();
    console.log('✅ Context Engine initialized successfully');

    // Create a test conversation
    const chatId = 'basic-demo-chat';
    console.log(`⏳ Creating conversation: ${chatId}`);
    await contextEngine.createConversation(chatId, 'demo-user', 'Basic Demo Conversation');
    console.log('✅ Conversation created');

    // Add some test messages with different importance levels
    const messages = [
      { 
        id: 1, 
        role: 'user', 
        content: 'Hello, I want to learn about machine learning algorithms',
        importance: 0.8 
      },
      { 
        id: 2, 
        role: 'assistant', 
        content: 'Great! Machine learning has many algorithms like linear regression, decision trees, and neural networks. What interests you most?',
        importance: 0.7 
      },
      { 
        id: 3, 
        role: 'user', 
        content: 'I am particularly interested in neural networks and deep learning',
        importance: 0.9 
      },
      { 
        id: 4, 
        role: 'assistant', 
        content: 'Neural networks are fascinating! They consist of layers of interconnected nodes that process information.',
        importance: 0.8 
      },
      { 
        id: 5, 
        role: 'user', 
        content: 'What is the weather like today?',
        importance: 0.2 
      },
      { 
        id: 6, 
        role: 'assistant', 
        content: 'I don\'t have access to current weather data, but you can check weather apps or websites.',
        importance: 0.3 
      },
      { 
        id: 7, 
        role: 'user', 
        content: 'Back to machine learning - can you recommend some practical resources?',
        importance: 0.8 
      },
      { 
        id: 8, 
        role: 'assistant', 
        content: 'For practical ML, I recommend Python with scikit-learn, TensorFlow, or PyTorch. Start with online courses like Coursera or edX.',
        importance: 0.7 
      }
    ];

    console.log('\n📝 Adding messages to conversation...');
    for (const msg of messages) {
      await contextEngine.addMessage(chatId, msg.id, {
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }, msg.importance);
      
      console.log(`   ✓ Added message ${msg.id} (importance: ${msg.importance})`);
    }
    console.log(`✅ Added ${messages.length} messages successfully`);

    // Test context retrieval with different queries
    const testQueries = [
      {
        query: 'Tell me more about neural networks and deep learning',
        description: 'ML-focused query - should prioritize ML messages'
      },
      {
        query: 'What programming tools should I use for machine learning?',
        description: 'Practical ML query - should find resource recommendations'
      },
      {
        query: 'Can you summarize our conversation?',
        description: 'General summary query - should include diverse messages'
      }
    ];

    console.log('\n🔍 Testing context retrieval with different queries...\n');

    for (let i = 0; i < testQueries.length; i++) {
      const testCase = testQueries[i];
      console.log(`📋 Test ${i + 1}: ${testCase.description}`);
      console.log(`❓ Query: "${testCase.query}"`);

      try {
        // Get optimized context
        const startTime = Date.now();
        const context = await contextEngine.getOptimizedContext(chatId, testCase.query);
        const processingTime = Date.now() - startTime;

        console.log(`📊 Context Results (${processingTime}ms):`);
        console.log(`   • Recent messages: ${context.recentMessages.length}`);
        console.log(`   • Relevant history: ${context.relevantHistory.length}`);
        console.log(`   • Summaries: ${context.summaries.length}`);
        console.log(`   • Key facts: ${context.keyFacts.length}`);
        console.log(`   • Total tokens: ${context.totalTokens}`);
        console.log(`   • Compression ratio: ${(context.compressionRatio * 100).toFixed(1)}%`);

        // Show sample messages from context
        if (context.recentMessages.length > 0) {
          console.log(`   📝 Sample recent message: "${context.recentMessages[0].content.toString().substring(0, 60)}..."`);
        }

        if (context.relevantHistory.length > 0) {
          console.log(`   🎯 Sample relevant message: "${context.relevantHistory[0].content.toString().substring(0, 60)}..."`);
        }

      } catch (error) {
        console.error(`❌ Error processing query: ${error}`);
      }

      console.log(''); // Empty line for readability
    }

    // Test message importance marking
    console.log('🏷️  Testing message importance marking...');
    await contextEngine.markMessageImportant(3, true); // Mark neural networks message as important
    console.log('✅ Marked message 3 as important');

    // Test conversation statistics
    console.log('\n📈 Getting conversation statistics...');
    try {
      const stats = await contextEngine.getConversationStats(chatId);
      console.log('📊 Conversation Statistics:');
      if (stats) {
        console.log(`   • Total messages: ${stats.total_messages || 'N/A'}`);
        console.log(`   • Total tokens: ${stats.total_tokens || 'N/A'}`);
        console.log(`   • Segments: ${stats.segment_count || 'N/A'}`);
        console.log(`   • Key facts: ${stats.fact_count || 'N/A'}`);
        console.log(`   • Avg compression: ${stats.avg_compression ? (stats.avg_compression * 100).toFixed(1) + '%' : 'N/A'}`);
      } else {
        console.log('   No statistics available');
      }
    } catch (error) {
      console.error('❌ Error getting statistics:', error);
    }

    // Test memory cache stats
    console.log('\n💾 Memory cache statistics:');
    try {
      const cacheStats = contextEngine.getMemoryCacheStats();
      console.log('📊 Cache Stats:', JSON.stringify(cacheStats, null, 2));
    } catch (error) {
      console.error('❌ Error getting cache stats:', error);
    }

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await contextEngine.cleanup();
    console.log('✅ Cleanup completed');

    console.log('\n🎉 Basic Context Engine Demo completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   • Context Engine initialized and configured');
    console.log('   • Test conversation created with 8 messages');
    console.log('   • Different importance levels assigned to messages');
    console.log('   • Context retrieval tested with 3 different query types');
    console.log('   • Message importance marking tested');
    console.log('   • Statistics and cache performance monitored');
    console.log('   • All resources cleaned up properly');

  } catch (error) {
    console.error('❌ Demo failed with error:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    return;
  }
}

// Run the demo
console.log('Starting Basic Context Engine Demo...');
runBasicDemo().catch((error) => {
  console.error('Fatal error:', error);
  return;
});
