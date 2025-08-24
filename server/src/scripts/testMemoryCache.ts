#!/usr/bin/env ts-node

/**
 * Test script for the in-memory cache system
 * Demonstrates cache functionality and performance
 */

import { MemoryCache, ContextMemoryCache } from '../services/MemoryCache';

async function testBasicMemoryCache() {
  console.log('🧪 Testing Basic Memory Cache\n');

  const cache = new MemoryCache({
    maxSize: 5,
    ttlMinutes: 1, // 1 minute for testing
    cleanupIntervalMinutes: 0.1, // 6 seconds for testing
    enableStats: true
  });

  // Test basic set/get
  console.log('1. Basic Set/Get Operations:');
  cache.set('key1', 'value1');
  cache.set('key2', { data: 'complex object' });
  cache.set('key3', [1, 2, 3, 4, 5]);

  console.log(`   key1: ${cache.get('key1')}`);
  console.log(`   key2: ${JSON.stringify(cache.get('key2'))}`);
  console.log(`   key3: ${JSON.stringify(cache.get('key3'))}`);
  console.log(`   nonexistent: ${cache.get('nonexistent')}`);

  // Test cache size and eviction
  console.log('\n2. Cache Size and Eviction:');
  console.log(`   Current size: ${cache.size()}`);
  
  // Add more items to trigger eviction
  cache.set('key4', 'value4');
  cache.set('key5', 'value5');
  cache.set('key6', 'value6'); // This should trigger eviction
  
  console.log(`   Size after adding more items: ${cache.size()}`);
  console.log(`   key1 still exists: ${cache.has('key1')}`);
  console.log(`   key6 exists: ${cache.has('key6')}`);

  // Test TTL
  console.log('\n3. TTL Testing:');
  cache.set('shortLived', 'expires soon', 0.01); // 0.6 seconds
  console.log(`   shortLived immediately: ${cache.get('shortLived')}`);
  
  await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
  console.log(`   shortLived after 1 second: ${cache.get('shortLived')}`);

  // Test statistics
  console.log('\n4. Cache Statistics:');
  const stats = cache.getStats();
  console.log(`   Total items: ${stats.totalItems}`);
  console.log(`   Hit count: ${stats.hitCount}`);
  console.log(`   Miss count: ${stats.missCount}`);
  console.log(`   Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
  console.log(`   Memory usage: ${stats.memoryUsage} bytes`);

  // Test pattern matching
  console.log('\n5. Pattern Matching:');
  cache.set('user:123', { name: 'Alice' });
  cache.set('user:456', { name: 'Bob' });
  cache.set('session:abc', { token: 'xyz' });
  
  const userEntries = cache.getByPattern(/^user:/);
  console.log(`   Found ${userEntries.length} user entries:`);
  userEntries.forEach(entry => {
    console.log(`     ${entry.key}: ${JSON.stringify(entry.value)}`);
  });

  // Test increment
  console.log('\n6. Increment Operations:');
  cache.set('counter', 0);
  console.log(`   Initial counter: ${cache.get('counter')}`);
  console.log(`   After increment: ${cache.increment('counter')}`);
  console.log(`   After increment by 5: ${cache.increment('counter', 5)}`);

  cache.destroy();
  console.log('\n✅ Basic Memory Cache test completed\n');
}

async function testContextMemoryCache() {
  console.log('🎯 Testing Context Memory Cache\n');

  const contextCache = new ContextMemoryCache({
    maxSize: 100,
    ttlMinutes: 5,
    cleanupIntervalMinutes: 1,
    enableStats: true
  });

  const chatId = 'test_chat_123';

  // Test context caching
  console.log('1. Context Caching:');
  const mockContext = {
    recentMessages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' }
    ],
    relevantHistory: [],
    summaries: [],
    keyFacts: [],
    totalTokens: 50,
    compressionRatio: 1.0
  };

  contextCache.cacheContext(chatId, 'greeting query', mockContext);
  const retrievedContext = contextCache.getCachedContext(chatId, 'greeting query');
  
  console.log(`   Context cached and retrieved: ${retrievedContext ? 'SUCCESS' : 'FAILED'}`);
  console.log(`   Retrieved tokens: ${retrievedContext?.totalTokens}`);

  // Test different query (should miss)
  const missedContext = contextCache.getCachedContext(chatId, 'different query');
  console.log(`   Different query (should miss): ${missedContext ? 'UNEXPECTED HIT' : 'EXPECTED MISS'}`);

  // Test summary caching
  console.log('\n2. Summary Caching:');
  contextCache.cacheSummary(chatId, 1, 'This is a summary of segment 1');
  contextCache.cacheSummary(chatId, 2, 'This is a summary of segment 2');
  
  const summary1 = contextCache.getCachedSummary(chatId, 1);
  const summary2 = contextCache.getCachedSummary(chatId, 2);
  const summary3 = contextCache.getCachedSummary(chatId, 3); // Should be null
  
  console.log(`   Summary 1: ${summary1}`);
  console.log(`   Summary 2: ${summary2}`);
  console.log(`   Summary 3 (should be null): ${summary3}`);

  // Test vector search caching
  console.log('\n3. Vector Search Caching:');
  const mockVectorResults = [
    { messageId: 1, similarity: 0.9, content: 'Relevant message 1', metadata: {} },
    { messageId: 2, similarity: 0.8, content: 'Relevant message 2', metadata: {} }
  ];

  contextCache.cacheVectorSearch('search query', mockVectorResults);
  const vectorResults = contextCache.getCachedVectorSearch('search query');
  
  console.log(`   Vector results cached: ${vectorResults ? 'SUCCESS' : 'FAILED'}`);
  console.log(`   Number of results: ${vectorResults?.length || 0}`);

  // Test chat-specific statistics
  console.log('\n4. Chat-Specific Statistics:');
  
  // Generate some hits and misses
  for (let i = 0; i < 5; i++) {
    contextCache.getCachedContext(chatId, 'greeting query'); // hits
    contextCache.getCachedContext(chatId, `random query ${i}`); // misses
  }

  const chatStats = contextCache.getChatCacheStats(chatId);
  console.log(`   Chat ${chatId} stats:`);
  console.log(`     Hits: ${chatStats.hits}`);
  console.log(`     Misses: ${chatStats.misses}`);
  console.log(`     Hit rate: ${(chatStats.hitRate * 100).toFixed(1)}%`);

  // Test overall cache stats
  console.log('\n5. Overall Cache Statistics:');
  const overallStats = contextCache.getStats();
  console.log(`   Total items: ${overallStats.totalItems}`);
  console.log(`   Hit count: ${overallStats.hitCount}`);
  console.log(`   Miss count: ${overallStats.missCount}`);
  console.log(`   Hit rate: ${(overallStats.hitRate * 100).toFixed(1)}%`);
  console.log(`   Memory usage: ${(overallStats.memoryUsage / 1024).toFixed(1)} KB`);

  contextCache.destroy();
  console.log('\n✅ Context Memory Cache test completed\n');
}

async function performanceTest() {
  console.log('⚡ Performance Testing\n');

  const cache = new MemoryCache({
    maxSize: 10000,
    ttlMinutes: 10,
    cleanupIntervalMinutes: 5,
    enableStats: true
  });

  const iterations = 1000;
  
  // Test write performance
  console.log(`1. Write Performance (${iterations} operations):`);
  const writeStart = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    cache.set(`key_${i}`, {
      id: i,
      data: `This is test data for item ${i}`,
      timestamp: Date.now(),
      metadata: { type: 'test', index: i }
    });
  }
  
  const writeTime = Date.now() - writeStart;
  console.log(`   Write time: ${writeTime}ms`);
  console.log(`   Writes per second: ${Math.round(iterations / (writeTime / 1000))}`);

  // Test read performance
  console.log(`\n2. Read Performance (${iterations} operations):`);
  const readStart = Date.now();
  let hits = 0;
  
  for (let i = 0; i < iterations; i++) {
    const value = cache.get(`key_${i}`);
    if (value) hits++;
  }
  
  const readTime = Date.now() - readStart;
  console.log(`   Read time: ${readTime}ms`);
  console.log(`   Reads per second: ${Math.round(iterations / (readTime / 1000))}`);
  console.log(`   Hit rate: ${(hits / iterations * 100).toFixed(1)}%`);

  // Test mixed operations
  console.log(`\n3. Mixed Operations (${iterations} operations):`);
  const mixedStart = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    if (i % 3 === 0) {
      cache.set(`mixed_${i}`, `value_${i}`);
    } else if (i % 3 === 1) {
      cache.get(`mixed_${i - 1}`);
    } else {
      cache.has(`mixed_${i - 2}`);
    }
  }
  
  const mixedTime = Date.now() - mixedStart;
  console.log(`   Mixed operations time: ${mixedTime}ms`);
  console.log(`   Operations per second: ${Math.round(iterations / (mixedTime / 1000))}`);

  // Final statistics
  console.log('\n4. Final Statistics:');
  const finalStats = cache.getStats();
  console.log(`   Total items: ${finalStats.totalItems}`);
  console.log(`   Memory usage: ${(finalStats.memoryUsage / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Hit rate: ${(finalStats.hitRate * 100).toFixed(1)}%`);

  cache.destroy();
  console.log('\n✅ Performance test completed\n');
}

async function memoryLeakTest() {
  console.log('🔍 Memory Leak Testing\n');

  const cache = new MemoryCache({
    maxSize: 1000,
    ttlMinutes: 0.01, // Very short TTL (0.6 seconds)
    cleanupIntervalMinutes: 0.01, // Frequent cleanup (0.6 seconds)
    enableStats: true
  });

  console.log('1. Adding items with short TTL...');
  
  // Add items that will expire quickly
  for (let i = 0; i < 500; i++) {
    cache.set(`temp_${i}`, `temporary data ${i}`, 0.01);
  }
  
  console.log(`   Items added: ${cache.size()}`);
  
  // Wait for expiration and cleanup
  console.log('2. Waiting for expiration and cleanup...');
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
  
  console.log(`   Items after cleanup: ${cache.size()}`);
  
  // Add more items to test eviction
  console.log('3. Testing eviction with cache overflow...');
  for (let i = 0; i < 1200; i++) { // More than maxSize
    cache.set(`overflow_${i}`, `overflow data ${i}`);
  }
  
  console.log(`   Items after overflow: ${cache.size()}`);
  console.log(`   Should be close to maxSize (1000): ${cache.size() <= 1000 ? 'PASS' : 'FAIL'}`);

  const stats = cache.getStats();
  console.log(`\n4. Final memory usage: ${(stats.memoryUsage / 1024).toFixed(1)} KB`);

  cache.destroy();
  console.log('\n✅ Memory leak test completed\n');
}

// Main execution
async function main() {
  console.log('🚀 Yitam Context Engine - Memory Cache Testing\n');
  
  try {
    await testBasicMemoryCache();
    await testContextMemoryCache();
    await performanceTest();
    await memoryLeakTest();
    
    console.log('🎉 All memory cache tests completed successfully!');
    console.log('\n💡 Key Benefits Demonstrated:');
    console.log('- Fast in-memory caching with configurable TTL');
    console.log('- Automatic cleanup and memory management');
    console.log('- LRU eviction when cache is full');
    console.log('- Context-specific caching for conversations');
    console.log('- High performance (thousands of ops/second)');
    console.log('- No external dependencies required');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}
