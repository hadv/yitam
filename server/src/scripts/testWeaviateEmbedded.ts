#!/usr/bin/env ts-node

import { WeaviateEmbeddedStore, VectorStoreConfig } from '../services/VectorStore';
import * as path from 'path';
import * as fs from 'fs';

async function testWeaviateEmbedded() {
  console.log('🚀 Testing Weaviate Embedded Vector Store\n');

  // Ensure data directory exists
  const dataPath = path.join(process.cwd(), 'data', 'weaviate-test');
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }

  // Configure Weaviate Embedded
  const config: VectorStoreConfig = {
    provider: 'weaviate-embedded',
    collectionName: 'test_embeddings',
    dimension: 768,
    embeddingModel: 'gemini-embedding-001',
    dataPath: dataPath
  };

  const store = new WeaviateEmbeddedStore(config);

  try {
    // Test 1: Initialize
    console.log('1. Initializing Weaviate Embedded...');
    await store.initialize();
    console.log('✅ Initialization successful\n');

    // Test 2: Add embeddings
    console.log('2. Adding test embeddings...');
    const testData = [
      { text: 'Hello world', type: 'message' as const, messageId: 1 },
      { text: 'How are you today?', type: 'message' as const, messageId: 2 },
      { text: 'The weather is nice', type: 'message' as const, messageId: 3 },
      { text: 'I love programming', type: 'message' as const, messageId: 4 },
      { text: 'Vector databases are useful', type: 'message' as const, messageId: 5 }
    ];

    const vectorIds: string[] = [];
    for (const data of testData) {
      const vectorId = await store.addEmbedding(data);
      vectorIds.push(vectorId);
      console.log(`   Added: "${data.text}" -> ${vectorId}`);
    }
    console.log('✅ All embeddings added successfully\n');

    // Test 3: Search similar
    console.log('3. Testing similarity search...');
    const searchQueries = [
      'greeting message',
      'weather information',
      'coding and development'
    ];

    for (const query of searchQueries) {
      console.log(`   Searching for: "${query}"`);
      const results = await store.searchSimilar(query, 3, 0.1); // Lower threshold for testing
      
      if (results.length > 0) {
        results.forEach((result, index) => {
          console.log(`     ${index + 1}. "${result.content}" (similarity: ${result.similarity.toFixed(3)})`);
        });
      } else {
        console.log('     No results found');
      }
      console.log('');
    }

    // Test 4: Get specific embedding
    console.log('4. Testing get embedding...');
    if (vectorIds.length > 0) {
      const embedding = await store.getEmbedding(vectorIds[0]);
      console.log(`   Retrieved embedding for ID: ${vectorIds[0]}`);
      console.log(`   Has vector data: ${embedding ? 'Yes' : 'No'}`);
    }
    console.log('');

    // Test 5: Delete embedding
    console.log('5. Testing delete embedding...');
    if (vectorIds.length > 0) {
      await store.deleteEmbedding(vectorIds[0]);
      console.log(`   Deleted embedding: ${vectorIds[0]}`);
      
      // Verify deletion
      const searchAfterDelete = await store.searchSimilar('Hello world', 5, 0.1);
      const stillExists = searchAfterDelete.some(result => result.content === 'Hello world');
      console.log(`   Embedding still exists: ${stillExists ? 'Yes (unexpected)' : 'No (expected)'}`);
    }
    console.log('');

    // Test 6: Close connection
    console.log('6. Closing connection...');
    await store.close();
    console.log('✅ Connection closed successfully\n');

    console.log('🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    
    // Try to close connection even if tests failed
    try {
      await store.close();
    } catch (closeError) {
      console.error('Error closing connection:', closeError);
    }
    
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testWeaviateEmbedded().catch(console.error);
}

export { testWeaviateEmbedded };
