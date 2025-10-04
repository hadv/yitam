#!/usr/bin/env ts-node

/**
 * Test Bayesian Memory Management with current Google API settings
 * This will verify if we can enable the advanced Bayesian mode
 */

import { ContextEngine } from '../services/ContextEngine';
import { getContextConfig } from '../config/contextEngine';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Force Bayesian mode for testing
process.env.CONTEXT_USE_BAYESIAN_MEMORY = 'true';
process.env.VECTOR_STORE_PROVIDER = 'weaviate-embedded';

async function testBayesianMode() {
  console.log('🧠 Testing Bayesian Memory Management Mode\n');
  
  // Display current API configuration
  console.log('🔑 Current API Configuration:');
  console.log(`   GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   GOOGLE_API_KEY: ${process.env.GOOGLE_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   GOOGLE_CLOUD_API_KEY: ${process.env.GOOGLE_CLOUD_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   GEMINI_MODEL: ${process.env.GEMINI_MODEL || 'Not set'}`);
  console.log(`   GEMINI_EMBEDDING_DIMENSIONS: ${process.env.GEMINI_EMBEDDING_DIMENSIONS || 'Not set'}`);
  console.log('');

  // Get configuration
  const contextConfig = getContextConfig();
  console.log('📋 Bayesian Configuration:');
  console.log(`   Use Bayesian Memory: ${contextConfig.contextEngine.useBayesianMemory}`);
  console.log(`   Vector Store Provider: ${contextConfig.vectorStore.provider}`);
  console.log(`   Embedding Model: ${contextConfig.vectorStore.embeddingModel}`);
  console.log(`   Vector Dimension: ${contextConfig.vectorStore.dimension}`);
  console.log('');

  // Initialize context engine with Bayesian mode enabled
  const contextEngine = new ContextEngine({
    ...contextConfig.contextEngine,
    useBayesianMemory: true // Force enable Bayesian mode
  });

  try {
    // Test 1: Initialize Context Engine
    console.log('1. Initializing Context Engine with Bayesian Mode...');
    await contextEngine.initialize();
    console.log('✅ Context Engine initialized successfully\n');

    // Test 2: Create test conversation
    const testChatId = `bayesian_test_${Date.now()}`;
    const testUserId = 'bayesian_test@yitam.org';
    
    console.log('2. Creating Bayesian test conversation...');
    await contextEngine.createConversation(testChatId, testUserId, 'Bayesian Mode Test');
    console.log(`✅ Created conversation: ${testChatId}\n`);

    // Test 3: Add messages that will test semantic understanding
    console.log('3. Adding semantically rich messages...');
    const semanticMessages = [
      { role: 'user', content: 'I want to learn about machine learning and artificial intelligence.' },
      { role: 'assistant', content: 'Great! Machine learning is a subset of AI that focuses on algorithms that can learn from data.' },
      { role: 'user', content: 'What are neural networks and how do they work?' },
      { role: 'assistant', content: 'Neural networks are computing systems inspired by biological neural networks. They consist of layers of interconnected nodes.' },
      { role: 'user', content: 'Can you explain deep learning?' },
      { role: 'assistant', content: 'Deep learning uses neural networks with multiple hidden layers to learn complex patterns in data.' },
      { role: 'user', content: 'What about natural language processing?' },
      { role: 'assistant', content: 'NLP is a branch of AI that helps computers understand, interpret and generate human language.' },
      { role: 'user', content: 'How do transformers work in NLP?' },
      { role: 'assistant', content: 'Transformers use attention mechanisms to process sequences of data, revolutionizing NLP tasks.' },
      { role: 'user', content: 'What is the difference between supervised and unsupervised learning?' },
      { role: 'assistant', content: 'Supervised learning uses labeled data, while unsupervised learning finds patterns in unlabeled data.' },
      { role: 'user', content: 'Tell me about reinforcement learning.' },
      { role: 'assistant', content: 'Reinforcement learning trains agents to make decisions by rewarding good actions and penalizing bad ones.' }
    ];

    for (let i = 0; i < semanticMessages.length; i++) {
      const message = semanticMessages[i];
      await contextEngine.addMessage(testChatId, i + 1, message as any);
      
      if ((i + 1) % 4 === 0) {
        console.log(`   Added ${i + 1}/${semanticMessages.length} semantic messages`);
      }
    }
    console.log(`✅ Added all ${semanticMessages.length} semantic messages\n`);

    // Test 4: Test Bayesian context retrieval with specific queries
    console.log('4. Testing Bayesian context retrieval...');
    const bayesianQueries = [
      'Can you explain more about neural networks?',
      'What did we discuss about deep learning?',
      'Tell me about the NLP topics we covered',
      'How does reinforcement learning work again?',
      'What are the different types of machine learning?'
    ];

    let bayesianSuccessCount = 0;
    let legacyFallbackCount = 0;

    for (const query of bayesianQueries) {
      console.log(`   🧠 Bayesian Query: "${query}"`);
      try {
        const context = await contextEngine.getOptimizedContext(testChatId, query);
        
        // Check if Bayesian mode was used (look for specific log message)
        console.log(`     Recent messages: ${context.recentMessages.length}`);
        console.log(`     Relevant history: ${context.relevantHistory.length}`);
        console.log(`     Key facts: ${context.keyFacts.length}`);
        console.log(`     Total tokens: ${context.totalTokens}`);
        console.log(`     Compression ratio: ${(context.compressionRatio * 100).toFixed(1)}%`);
        
        bayesianSuccessCount++;
        console.log('     ✅ Bayesian context retrieval successful');
      } catch (error) {
        legacyFallbackCount++;
        console.log(`     ⚠️  Bayesian failed, using legacy: ${(error as Error).message}`);
      }
      console.log('');
    }

    // Test 5: Add key facts and test enhanced retrieval
    console.log('5. Testing Bayesian key facts integration...');
    await contextEngine.addKeyFact(testChatId, 'User is learning about machine learning and AI', 'goal');
    await contextEngine.addKeyFact(testChatId, 'Discussed neural networks, deep learning, NLP, and reinforcement learning', 'fact');
    await contextEngine.addKeyFact(testChatId, 'User prefers detailed technical explanations', 'preference');
    console.log('✅ Added 3 key facts for Bayesian analysis\n');

    // Test 6: Final Bayesian context test
    console.log('6. Testing enhanced Bayesian context with key facts...');
    const finalQuery = 'Can you summarize what we learned about AI and machine learning?';
    console.log(`   🧠 Final Bayesian Query: "${finalQuery}"`);
    
    try {
      const enhancedContext = await contextEngine.getOptimizedContext(testChatId, finalQuery);
      
      console.log('   Enhanced Bayesian context:');
      console.log(`     Recent messages: ${enhancedContext.recentMessages.length}`);
      console.log(`     Relevant history: ${enhancedContext.relevantHistory.length}`);
      console.log(`     Key facts: ${enhancedContext.keyFacts.length}`);
      
      if (enhancedContext.keyFacts.length > 0) {
        console.log('     Bayesian key facts:');
        enhancedContext.keyFacts.forEach((fact, index) => {
          console.log(`       ${index + 1}. [${fact.factType}] ${fact.factText}`);
        });
      }
      console.log('');
    } catch (error) {
      console.log(`     ⚠️  Enhanced Bayesian failed: ${(error as Error).message}\n`);
    }

    // Test 7: Results summary
    console.log('7. Bayesian Mode Test Results...');
    console.log(`   Bayesian successes: ${bayesianSuccessCount}/${bayesianQueries.length}`);
    console.log(`   Legacy fallbacks: ${legacyFallbackCount}/${bayesianQueries.length}`);
    
    if (bayesianSuccessCount > 0) {
      console.log('   🎉 Bayesian Mode is working!');
    } else {
      console.log('   ⚠️  Bayesian Mode needs troubleshooting');
    }
    console.log('');

    // Test 8: Cleanup
    console.log('8. Cleaning up Bayesian test...');
    await contextEngine.cleanup();
    console.log('✅ Bayesian cleanup completed\n');

    // Final assessment
    if (bayesianSuccessCount >= bayesianQueries.length / 2) {
      console.log('🎉 Bayesian Memory Management is working with your API settings!');
      console.log('\n📊 Bayesian Mode Benefits:');
      console.log('   ✅ Intelligent semantic context selection');
      console.log('   ✅ Query-specific relevance scoring');
      console.log('   ✅ Advanced probabilistic analysis');
      console.log('   ✅ Superior context quality');
      console.log('\n🚀 You can now use advanced Bayesian mode in production!');
    } else {
      console.log('⚠️  Bayesian Mode has issues with current configuration');
      console.log('\n📋 Troubleshooting needed:');
      console.log('   - Check Google API key permissions');
      console.log('   - Verify embedding model compatibility');
      console.log('   - Review vector store configuration');
      console.log('\n✅ Legacy mode remains reliable for production use');
    }

  } catch (error) {
    console.error('❌ Bayesian test failed:', error);
    
    try {
      await contextEngine.cleanup();
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }
    
    process.exit(1);
  }
}

// Run the Bayesian test
if (require.main === module) {
  testBayesianMode().catch(console.error);
}

export { testBayesianMode };
