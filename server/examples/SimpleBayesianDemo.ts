/**
 * Simple demo for Bayesian Memory Management
 */

import { ContextEngine } from '../services/ContextEngine';

async function runSimpleDemo() {
  console.log('🚀 Starting Simple Bayesian Memory Demo\n');

  try {
    // Initialize Context Engine
    const contextEngine = new ContextEngine({
      maxRecentMessages: 5,
      maxContextTokens: 4000
    });

    await contextEngine.initialize();
    console.log('✅ Context Engine initialized');

    // Create a test conversation
    const chatId = 'simple-demo-chat';
    await contextEngine.createConversation(chatId, 'demo-user', 'Simple Demo');
    console.log('✅ Conversation created');

    // Add some test messages
    const messages = [
      { id: 1, role: 'user', content: 'Hello, I want to learn about machine learning' },
      { id: 2, role: 'assistant', content: 'Great! Machine learning is a fascinating field. What specific area interests you?' },
      { id: 3, role: 'user', content: 'I am interested in neural networks and deep learning' },
      { id: 4, role: 'assistant', content: 'Neural networks are the foundation of deep learning. They mimic how the brain processes information.' },
      { id: 5, role: 'user', content: 'Can you recommend some good books on this topic?' },
      { id: 6, role: 'assistant', content: 'I recommend "Deep Learning" by Ian Goodfellow and "Neural Networks and Deep Learning" by Michael Nielsen.' },
      { id: 7, role: 'user', content: 'What about practical implementation? Any programming languages you recommend?' },
      { id: 8, role: 'assistant', content: 'Python is the most popular choice with libraries like TensorFlow, PyTorch, and Keras.' }
    ];

    console.log('\n📝 Adding messages to conversation...');
    for (const msg of messages) {
      await contextEngine.addMessage(chatId, msg.id, {
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      });
    }
    console.log(`✅ Added ${messages.length} messages`);

    // Test different queries
    const testQueries = [
      'Can you tell me more about neural networks?',
      'What programming tools should I use?',
      'Give me a summary of our discussion'
    ];

    console.log('\n🔍 Testing Bayesian context retrieval...\n');

    for (let i = 0; i < testQueries.length; i++) {
      const query = testQueries[i];
      console.log(`Query ${i + 1}: "${query}"`);

      try {
        // Get optimized context (will use Bayesian if available, fallback to standard)
        const context = await contextEngine.getOptimizedContext(chatId, query);

        console.log(`📊 Results:`);
        console.log(`   • Recent messages: ${context.recentMessages.length}`);
        console.log(`   • Relevant history: ${context.relevantHistory.length}`);
        console.log(`   • Total tokens: ${context.totalTokens}`);
        console.log(`   • Compression ratio: ${(context.compressionRatio * 100).toFixed(1)}%`);

        // Show some context messages
        if (context.relevantHistory.length > 0) {
          console.log(`   • Sample relevant message: "${typeof context.relevantHistory[0].content === 'string' 
            ? context.relevantHistory[0].content.substring(0, 50) + '...'
            : 'Complex content'
          }"`);
        }

      } catch (error) {
        console.error(`❌ Error processing query: ${error}`);
      }

      console.log(''); // Empty line for readability
    }

    // Test conversation stats
    console.log('📈 Getting conversation statistics...');
    try {
      const stats = await contextEngine.getConversationStats(chatId);
      console.log('📊 Conversation Stats:', JSON.stringify(stats, null, 2));
    } catch (error) {
      console.error('❌ Error getting stats:', error);
    }

    // Cleanup
    await contextEngine.cleanup();
    console.log('\n✅ Demo completed successfully!');

  } catch (error) {
    console.error('❌ Demo failed:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
  }
}

// Run the demo
runSimpleDemo().catch(console.error);
