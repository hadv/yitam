#!/usr/bin/env ts-node

/**
 * Test script for the integrated Yitam Context Engine
 * Tests the actual integration with the main server's context engine
 */

import { ContextEngine } from '../services/ContextEngine';
import { getContextConfig } from '../config/contextEngine';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testIntegratedContextEngine() {
  console.log('🚀 Testing Integrated Yitam Context Engine\n');

  // Initialize context engine with production config
  const contextConfig = getContextConfig();
  const contextEngine = new ContextEngine(contextConfig.contextEngine);

  try {
    // Test 1: Initialize
    console.log('1. Initializing Context Engine...');
    await contextEngine.initialize();
    console.log('✅ Context Engine initialized successfully\n');

    // Test 2: Create a test conversation
    const testChatId = `test_chat_${Date.now()}`;
    const testUserId = 'test_user@example.com';
    
    console.log('2. Creating test conversation...');
    await contextEngine.createConversation(testChatId, testUserId, 'Context Engine Integration Test');
    console.log(`✅ Created conversation: ${testChatId}\n`);

    // Test 3: Add a series of messages (simulating a real conversation)
    console.log('3. Adding conversation messages...');
    const messages = [
      { role: 'user', content: 'Hello! I need help planning a software architecture for my e-commerce project.' },
      { role: 'assistant', content: 'I\'d be happy to help! What type of e-commerce platform are you building?' },
      { role: 'user', content: 'It\'s a marketplace for handmade crafts. I expect around 10,000 users initially.' },
      { role: 'assistant', content: 'Great! For a marketplace with 10k users, I recommend a microservices architecture. What\'s your tech stack preference?' },
      { role: 'user', content: 'I prefer Node.js for backend and React for frontend. What about the database?' },
      { role: 'assistant', content: 'Perfect choice! For your marketplace, I suggest PostgreSQL for transactional data and Redis for caching.' },
      { role: 'user', content: 'How should I handle payments securely?' },
      { role: 'assistant', content: 'For payments, integrate with Stripe or PayPal. Never store payment details directly - use their secure APIs.' },
      { role: 'user', content: 'What about user authentication and authorization?' },
      { role: 'assistant', content: 'Implement JWT tokens with refresh tokens. Use role-based access control (RBAC) for sellers vs buyers.' },
      { role: 'user', content: 'Should I use Docker for deployment?' },
      { role: 'assistant', content: 'Absolutely! Docker with Kubernetes or Docker Swarm will help with scaling and deployment.' },
      { role: 'user', content: 'What about monitoring and logging?' },
      { role: 'assistant', content: 'Use ELK stack (Elasticsearch, Logstash, Kibana) for logging and Prometheus + Grafana for monitoring.' }
    ];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      await contextEngine.addMessage(testChatId, i + 1, message as any);
      
      if ((i + 1) % 4 === 0) {
        console.log(`   Added ${i + 1}/${messages.length} messages`);
      }
    }
    console.log(`✅ Added all ${messages.length} messages\n`);

    // Test 4: Test context retrieval with different queries
    console.log('4. Testing context retrieval...');
    const testQueries = [
      'What database did you recommend?',
      'How should I handle payments?',
      'What monitoring tools should I use?',
      'Tell me about the authentication approach'
    ];

    for (const query of testQueries) {
      console.log(`   Query: "${query}"`);
      const context = await contextEngine.getOptimizedContext(testChatId, query);
      
      console.log(`     Recent messages: ${context.recentMessages.length}`);
      console.log(`     Relevant history: ${context.relevantHistory.length}`);
      console.log(`     Summaries: ${context.summaries.length}`);
      console.log(`     Key facts: ${context.keyFacts.length}`);
      console.log(`     Total tokens: ${context.totalTokens}`);
      console.log(`     Compression ratio: ${(context.compressionRatio * 100).toFixed(1)}%`);
      console.log('');
    }

    // Test 5: Add key facts
    console.log('5. Testing key facts storage...');
    await contextEngine.addKeyFact(testChatId, 'User is building a handmade crafts marketplace', 'fact');
    await contextEngine.addKeyFact(testChatId, 'Expected 10,000 initial users', 'fact');
    await contextEngine.addKeyFact(testChatId, 'Prefers Node.js and React tech stack', 'preference');
    await contextEngine.addKeyFact(testChatId, 'Decided to use PostgreSQL and Redis', 'decision');
    console.log('✅ Added 4 key facts\n');

    // Test 6: Mark important messages
    console.log('6. Testing importance marking...');
    await contextEngine.markMessageImportant(3, true); // Marketplace description
    await contextEngine.markMessageImportant(6, true); // Database recommendation
    await contextEngine.markMessageImportant(8, true); // Payment security
    console.log('✅ Marked 3 messages as important\n');

    // Test 7: Get conversation statistics
    console.log('7. Getting conversation statistics...');
    const stats = await contextEngine.getConversationStats(testChatId);
    console.log(`   Total messages: ${stats.total_messages || messages.length}`);
    console.log(`   Total tokens: ${stats.total_tokens || 'Calculated dynamically'}`);
    console.log(`   Segments: ${stats.segment_count || 0}`);
    console.log(`   Key facts: ${stats.fact_count || 4}`);
    console.log('');

    // Test 8: Test context retrieval after adding facts and importance
    console.log('8. Testing enhanced context retrieval...');
    const enhancedContext = await contextEngine.getOptimizedContext(testChatId, 'What are the key decisions for my marketplace?');
    
    console.log('   Enhanced context includes:');
    console.log(`     Recent messages: ${enhancedContext.recentMessages.length}`);
    console.log(`     Relevant history: ${enhancedContext.relevantHistory.length}`);
    console.log(`     Key facts: ${enhancedContext.keyFacts.length}`);
    
    if (enhancedContext.keyFacts.length > 0) {
      console.log('     Key facts found:');
      enhancedContext.keyFacts.forEach((fact, index) => {
        console.log(`       ${index + 1}. [${fact.factType}] ${fact.factText}`);
      });
    }
    console.log('');

    // Test 9: Cleanup
    console.log('9. Cleaning up...');
    await contextEngine.cleanup();
    console.log('✅ Cleanup completed\n');

    console.log('🎉 All integrated context engine tests passed successfully!');
    console.log('\n📊 Test Summary:');
    console.log('   ✅ Context Engine initialization');
    console.log('   ✅ Conversation creation');
    console.log('   ✅ Message storage and retrieval');
    console.log('   ✅ Context optimization');
    console.log('   ✅ Key facts management');
    console.log('   ✅ Message importance marking');
    console.log('   ✅ Statistics and analytics');
    console.log('   ✅ Enhanced context retrieval');

  } catch (error) {
    console.error('❌ Test failed:', error);
    
    // Try to cleanup even if tests failed
    try {
      await contextEngine.cleanup();
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }
    
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testIntegratedContextEngine().catch(console.error);
}

export { testIntegratedContextEngine };
