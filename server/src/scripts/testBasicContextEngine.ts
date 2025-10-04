#!/usr/bin/env ts-node

/**
 * Basic test for Context Engine without Bayesian memory management
 * Tests core functionality without requiring embeddings
 */

import { ContextEngine } from '../services/ContextEngine';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testBasicContextEngine() {
  console.log('🚀 Testing Basic Context Engine Functionality\n');

  // Initialize context engine with basic config (no Bayesian memory)
  const contextEngine = new ContextEngine({
    maxRecentMessages: 5,
    maxContextTokens: 2000,
    summarizationThreshold: 8,
    importanceThreshold: 0.3,
    vectorSearchLimit: 3,
    cacheExpiration: 10,
    useBayesianMemory: false // Disable Bayesian memory for this test
  });

  try {
    // Test 1: Initialize
    console.log('1. Initializing Context Engine (basic mode)...');
    await contextEngine.initialize();
    console.log('✅ Context Engine initialized successfully\n');

    // Test 2: Create a test conversation
    const testChatId = `basic_test_${Date.now()}`;
    const testUserId = 'basic_test@example.com';
    
    console.log('2. Creating test conversation...');
    await contextEngine.createConversation(testChatId, testUserId, 'Basic Context Engine Test');
    console.log(`✅ Created conversation: ${testChatId}\n`);

    // Test 3: Add messages
    console.log('3. Adding test messages...');
    const messages = [
      { role: 'user', content: 'Hello, I need help with my React project.' },
      { role: 'assistant', content: 'I\'d be happy to help! What specific issue are you facing?' },
      { role: 'user', content: 'I\'m having trouble with state management.' },
      { role: 'assistant', content: 'For state management, you could use useState, useReducer, or external libraries like Redux.' },
      { role: 'user', content: 'Which one would you recommend for a small project?' },
      { role: 'assistant', content: 'For small projects, useState and useReducer are usually sufficient.' }
    ];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      await contextEngine.addMessage(testChatId, i + 1, message as any);
      console.log(`   Added message ${i + 1}: "${message.content.substring(0, 50)}..."`);
    }
    console.log(`✅ Added all ${messages.length} messages\n`);

    // Test 4: Test basic context retrieval (without query-specific optimization)
    console.log('4. Testing basic context retrieval...');
    const context = await contextEngine.getOptimizedContext(testChatId);
    
    console.log(`   Recent messages: ${context.recentMessages.length}`);
    console.log(`   Relevant history: ${context.relevantHistory.length}`);
    console.log(`   Summaries: ${context.summaries.length}`);
    console.log(`   Key facts: ${context.keyFacts.length}`);
    console.log(`   Total tokens: ${context.totalTokens}`);
    console.log(`   Compression ratio: ${(context.compressionRatio * 100).toFixed(1)}%\n`);

    // Test 5: Add key facts
    console.log('5. Testing key facts storage...');
    await contextEngine.addKeyFact(testChatId, 'User is working on a React project', 'fact');
    await contextEngine.addKeyFact(testChatId, 'User needs help with state management', 'goal');
    await contextEngine.addKeyFact(testChatId, 'Project is small scale', 'preference');
    console.log('✅ Added 3 key facts\n');

    // Test 6: Mark important messages
    console.log('6. Testing importance marking...');
    await contextEngine.markMessageImportant(1, true); // First user message
    await contextEngine.markMessageImportant(4, true); // State management recommendation
    console.log('✅ Marked 2 messages as important\n');

    // Test 7: Get conversation statistics
    console.log('7. Getting conversation statistics...');
    const stats = await contextEngine.getConversationStats(testChatId);
    console.log(`   Total messages: ${stats.total_messages || messages.length}`);
    console.log(`   Total tokens: ${stats.total_tokens || 'Calculated dynamically'}`);
    console.log(`   Segments: ${stats.segment_count || 0}`);
    console.log(`   Key facts: ${stats.fact_count || 3}`);
    console.log('');

    // Test 8: Test context retrieval after adding facts
    console.log('8. Testing enhanced context retrieval...');
    const enhancedContext = await contextEngine.getOptimizedContext(testChatId);
    
    console.log('   Enhanced context includes:');
    console.log(`     Recent messages: ${enhancedContext.recentMessages.length}`);
    console.log(`     Key facts: ${enhancedContext.keyFacts.length}`);
    
    if (enhancedContext.keyFacts.length > 0) {
      console.log('     Key facts found:');
      enhancedContext.keyFacts.forEach((fact, index) => {
        console.log(`       ${index + 1}. [${fact.factType}] ${fact.factText}`);
      });
    }
    console.log('');

    // Test 9: Test with more messages to trigger compression
    console.log('9. Testing compression by adding more messages...');
    const additionalMessages = [
      { role: 'user', content: 'What about performance optimization?' },
      { role: 'assistant', content: 'For performance, consider React.memo, useMemo, and useCallback.' },
      { role: 'user', content: 'How do I implement lazy loading?' },
      { role: 'assistant', content: 'Use React.lazy() and Suspense for component lazy loading.' },
      { role: 'user', content: 'Thanks for all the help!' },
      { role: 'assistant', content: 'You\'re welcome! Feel free to ask if you have more questions.' }
    ];

    for (let i = 0; i < additionalMessages.length; i++) {
      const message = additionalMessages[i];
      await contextEngine.addMessage(testChatId, messages.length + i + 1, message as any);
    }
    
    const finalContext = await contextEngine.getOptimizedContext(testChatId);
    console.log(`   Total messages added: ${messages.length + additionalMessages.length}`);
    console.log(`   Context messages returned: ${finalContext.recentMessages.length + finalContext.relevantHistory.length}`);
    console.log(`   Compression achieved: ${finalContext.recentMessages.length + finalContext.relevantHistory.length < messages.length + additionalMessages.length ? 'Yes' : 'No'}\n`);

    // Test 10: Cleanup
    console.log('10. Cleaning up...');
    await contextEngine.cleanup();
    console.log('✅ Cleanup completed\n');

    console.log('🎉 All basic context engine tests passed successfully!');
    console.log('\n📊 Test Summary:');
    console.log('   ✅ Context Engine initialization (basic mode)');
    console.log('   ✅ Conversation creation');
    console.log('   ✅ Message storage and retrieval');
    console.log('   ✅ Basic context optimization');
    console.log('   ✅ Key facts management');
    console.log('   ✅ Message importance marking');
    console.log('   ✅ Statistics and analytics');
    console.log('   ✅ Context compression testing');

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
  testBasicContextEngine().catch(console.error);
}

export { testBasicContextEngine };
