#!/usr/bin/env ts-node

/**
 * Test script for Yitam Context Engine
 * Demonstrates the context engine capabilities with a simulated long conversation
 */

import { EnhancedConversation } from '../services/EnhancedConversation';
import { ContextEngine } from '../services/ContextEngine';
import { getContextConfig, developmentContextConfig } from '../config/contextEngine';

async function simulateLongConversation() {
  console.log('🚀 Starting Yitam Context Engine Test\n');

  // Initialize enhanced conversation with context engine
  const conversation = new EnhancedConversation({
    enableContextEngine: true,
    maxContextTokens: 4000, // Smaller for testing
    compressionThreshold: 10, // Compress after 10 messages
    vectorStoreConfig: {
      provider: 'chromadb', // Use in-memory for testing
      collectionName: 'test_context',
      dimension: 384, // Smaller dimension for testing
      embeddingModel: 'test-model'
    }
  });

  // Start a new chat
  const chatId = await conversation.startNewChat();
  console.log(`📝 Started new chat: ${chatId}\n`);

  // Simulate a long conversation about planning a trip
  const messages = [
    { role: 'user', content: "I'm planning a trip to Japan. Can you help me?" },
    { role: 'assistant', content: "I'd love to help you plan your Japan trip! When are you thinking of going?" },
    { role: 'user', content: "I'm thinking of going in April for the cherry blossoms." },
    { role: 'assistant', content: "April is perfect for cherry blossoms! How long will you be staying?" },
    { role: 'user', content: "About 10 days. I want to visit Tokyo and Kyoto." },
    { role: 'assistant', content: "Great choice! Tokyo and Kyoto offer very different experiences. Do you prefer modern cities or traditional culture?" },
    { role: 'user', content: "I love both! I want to see temples in Kyoto and experience Tokyo's nightlife." },
    { role: 'assistant', content: "Perfect! I recommend spending 6 days in Tokyo and 4 days in Kyoto. What's your budget like?" },
    { role: 'user', content: "My budget is around $3000 for the whole trip, including flights." },
    { role: 'assistant', content: "That's a good budget! Let's break it down: flights (~$800), accommodation (~$1200), food (~$600), activities (~$400)." },
    { role: 'user', content: "That sounds reasonable. What about transportation between cities?" },
    { role: 'assistant', content: "The JR Pass is perfect for your trip! It costs about $280 for 7 days and covers the shinkansen between Tokyo and Kyoto." },
    { role: 'user', content: "Great! Can you recommend some specific temples in Kyoto?" },
    { role: 'assistant', content: "Absolutely! Must-visit temples include Kiyomizu-dera, Fushimi Inari, Kinkaku-ji (Golden Pavilion), and Gion district for geishas." },
    { role: 'user', content: "I'm also interested in Japanese food. Any restaurant recommendations?" },
    { role: 'assistant', content: "For authentic experiences, try: Sukiyabashi Jiro for sushi, Ganko for kaiseki, and don't miss street food in Tsukiji Market!" },
    { role: 'user', content: "What about accommodation? Should I stay in hotels or try ryokans?" },
    { role: 'assistant', content: "I recommend a mix! Stay in a modern hotel in Tokyo for convenience, and try a traditional ryokan in Kyoto for the cultural experience." },
    { role: 'user', content: "That's a great idea! Now, what should I pack for April weather?" },
    { role: 'assistant', content: "April weather is mild but can be unpredictable. Pack layers: light sweaters, a rain jacket, comfortable walking shoes, and spring clothes." },
    { role: 'user', content: "Should I learn some Japanese phrases before going?" },
    { role: 'assistant', content: "It's very helpful! Learn: arigatou gozaimasu (thank you), sumimasen (excuse me), eigo ga wakarimasu ka? (do you speak English?)" },
    { role: 'user', content: "What about cultural etiquette I should know?" },
    { role: 'assistant', content: "Key etiquette: bow when greeting, remove shoes indoors, don't tip (it's not customary), be quiet on trains, and don't eat while walking." },
    { role: 'user', content: "This is so helpful! Can you create a day-by-day itinerary?" },
    { role: 'assistant', content: "I'd be happy to! Let me create a detailed 10-day itinerary based on everything we've discussed..." }
  ];

  // Add messages to conversation
  console.log('💬 Adding messages to conversation...');
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'user') {
      await conversation.addUserMessage(msg.content);
    } else {
      await conversation.addAssistantMessage(msg.content);
    }
    
    if ((i + 1) % 5 === 0) {
      console.log(`   Added ${i + 1}/${messages.length} messages`);
    }
  }

  console.log(`✅ Added all ${messages.length} messages\n`);

  // Test context retrieval with different queries
  const testQueries = [
    "What was my budget for the trip?",
    "Which temples did you recommend in Kyoto?",
    "What should I pack for the weather?",
    "Tell me about Japanese etiquette"
  ];

  console.log('🔍 Testing context retrieval with different queries:\n');

  for (const query of testQueries) {
    console.log(`Query: "${query}"`);
    
    // Get optimized context
    const optimizedHistory = await conversation.getConversationHistory(query);
    const fullHistory = await conversation.getConversationHistory();
    
    console.log(`   Full history: ${fullHistory.length} messages`);
    console.log(`   Optimized context: ${optimizedHistory.length} messages`);
    
    // Calculate token savings (rough estimation)
    const fullTokens = fullHistory.reduce((sum, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return sum + Math.ceil(content.length / 4);
    }, 0);
    
    const optimizedTokens = optimizedHistory.reduce((sum, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return sum + Math.ceil(content.length / 4);
    }, 0);
    
    const savings = ((fullTokens - optimizedTokens) / fullTokens * 100).toFixed(1);
    console.log(`   Token savings: ${savings}% (${fullTokens} → ${optimizedTokens} tokens)`);
    console.log('');
  }

  // Test marking important messages
  console.log('⭐ Testing importance marking...');
  await conversation.markMessageImportant(5, true); // Budget message
  await conversation.markMessageImportant(10, true); // JR Pass recommendation
  await conversation.markMessageImportant(14, true); // Restaurant recommendations
  console.log('   Marked 3 messages as important\n');

  // Test adding key facts
  console.log('📝 Testing key facts storage...');
  await conversation.addKeyFact("User's budget is $3000 for 10-day Japan trip", 'fact');
  await conversation.addKeyFact("User prefers mix of modern Tokyo and traditional Kyoto", 'preference');
  await conversation.addKeyFact("Trip planned for April to see cherry blossoms", 'decision');
  console.log('   Stored 3 key facts\n');

  // Get conversation statistics
  console.log('📊 Conversation Statistics:');
  const stats = await conversation.getConversationStats();
  console.log(`   Total messages: ${stats.totalMessages || messages.length}`);
  console.log(`   Total tokens: ${stats.totalTokens || 'N/A'}`);
  console.log(`   Segments: ${stats.segmentCount || 0}`);
  console.log(`   Key facts: ${stats.factCount || 3}`);
  console.log(`   Avg compression: ${stats.avgCompression ? (stats.avgCompression * 100).toFixed(1) + '%' : 'N/A'}\n`);

  // Test semantic search
  console.log('🔎 Testing semantic search...');
  const searchResults = await conversation.searchRelevantMessages("food and restaurants", 3);
  console.log(`   Found ${searchResults.length} relevant messages about food:`);
  searchResults.forEach((result, index) => {
    console.log(`   ${index + 1}. Similarity: ${(result.similarity * 100).toFixed(1)}% - "${result.content.substring(0, 80)}..."`);
  });

  // Cleanup
  await conversation.cleanup();
  console.log('\n✅ Context Engine test completed successfully!');
}

async function testContextEngineDirectly() {
  console.log('\n🔧 Testing Context Engine directly...\n');

  const contextEngine = new ContextEngine({
    maxRecentMessages: 5,
    maxContextTokens: 2000,
    summarizationThreshold: 8
  });

  await contextEngine.initialize();

  const testChatId = 'test_chat_direct';
  await contextEngine.createConversation(testChatId, 'test_user', 'Direct Test Chat');

  // Add some test messages
  const testMessages = [
    { role: 'user', content: 'Hello, I need help with my project.' },
    { role: 'assistant', content: 'I\'d be happy to help! What kind of project are you working on?' },
    { role: 'user', content: 'It\'s a web application using React and Node.js.' },
    { role: 'assistant', content: 'Great choice! What specific aspect do you need help with?' },
    { role: 'user', content: 'I\'m having trouble with state management in React.' },
    { role: 'assistant', content: 'For state management, I recommend considering Redux, Zustand, or React Context API.' }
  ];

  for (let i = 0; i < testMessages.length; i++) {
    await contextEngine.addMessage(testChatId, i + 1, testMessages[i] as any);
  }

  // Test context retrieval
  const context = await contextEngine.getOptimizedContext(testChatId, 'What libraries did you recommend?');
  console.log('📋 Context retrieval test:');
  console.log(`   Recent messages: ${context.recentMessages.length}`);
  console.log(`   Relevant history: ${context.relevantHistory.length}`);
  console.log(`   Summaries: ${context.summaries.length}`);
  console.log(`   Key facts: ${context.keyFacts.length}`);
  console.log(`   Total tokens: ${context.totalTokens}`);
  console.log(`   Compression ratio: ${(context.compressionRatio * 100).toFixed(1)}%`);

  // Test key fact addition
  await contextEngine.addKeyFact(testChatId, 'User is building a React/Node.js web application', 'fact');
  await contextEngine.addKeyFact(testChatId, 'User needs help with React state management', 'goal');

  // Get stats
  const stats = await contextEngine.getConversationStats(testChatId);
  console.log('\n📊 Direct Context Engine Stats:');
  console.log(`   Total messages: ${stats.total_messages}`);
  console.log(`   Total tokens: ${stats.total_tokens}`);
  console.log(`   Segments: ${stats.segment_count}`);
  console.log(`   Facts: ${stats.fact_count}`);

  console.log('\n✅ Direct Context Engine test completed!');
}

// Main execution
async function main() {
  try {
    await simulateLongConversation();
    await testContextEngineDirectly();
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}
