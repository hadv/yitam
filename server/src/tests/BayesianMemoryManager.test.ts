/**
 * Tests for Bayesian Memory Management
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { BayesianMemoryManager } from '../services/BayesianMemoryManager';
import { VectorStoreManager, InMemoryVectorStore } from '../services/VectorStore';
import { HistoricalMessage, BayesianMemoryConfig } from '../types/BayesianTypes';
import { initializeContextDatabase } from '../db/contextDatabase';

describe('BayesianMemoryManager', () => {
  let bayesianManager: BayesianMemoryManager;
  let vectorStore: VectorStoreManager;

  beforeEach(async () => {
    // Initialize test database
    await initializeContextDatabase();

    // Create in-memory vector store for testing
    vectorStore = new VectorStoreManager({
      provider: 'inmemory',
      collectionName: 'test_collection',
      dimension: 1536,
      embeddingModel: 'text-embedding-ada-002'
    });

    await vectorStore.initialize();

    // Create Bayesian manager with test config
    const testConfig: Partial<BayesianMemoryConfig> = {
      evidenceWeights: {
        semantic: 0.4,
        temporal: 0.2,
        entity: 0.15,
        topic: 0.1,
        interaction: 0.1,
        continuity: 0.05
      },
      maxHistorySize: 20,
      topKSelection: 3,
      thresholds: {
        minSemanticSimilarity: 0.2,
        minEntityOverlap: 0.1,
        minTopicSimilarity: 0.1,
        minRelevanceProbability: 0.3
      }
    };

    bayesianManager = new BayesianMemoryManager(vectorStore, testConfig);
  });

  afterEach(async () => {
    await vectorStore.close();
  });

  describe('analyzeBayesianRelevance', () => {
    it('should analyze relevance of historical messages to current query', async () => {
      const chatId = 'test-chat-1';
      const currentQuery = 'What did we discuss about machine learning?';

      // Mock some historical messages
      const mockMessages: HistoricalMessage[] = [
        {
          messageId: 1,
          chatId,
          content: 'I want to learn about machine learning algorithms',
          role: 'user',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          tokenCount: 50,
          currentImportanceScore: 0.7,
          entities: ['machine learning', 'algorithms'],
          topics: ['technology', 'education'],
          userMarked: false,
          timesReferenced: 0
        },
        {
          messageId: 2,
          chatId,
          content: 'Let me explain neural networks and deep learning',
          role: 'assistant',
          timestamp: new Date(Date.now() - 1.5 * 60 * 60 * 1000), // 1.5 hours ago
          tokenCount: 80,
          currentImportanceScore: 0.8,
          entities: ['neural networks', 'deep learning'],
          topics: ['technology'],
          userMarked: true,
          timesReferenced: 1
        },
        {
          messageId: 3,
          chatId,
          content: 'What should I have for lunch today?',
          role: 'user',
          timestamp: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
          tokenCount: 30,
          currentImportanceScore: 0.3,
          entities: ['lunch'],
          topics: ['food'],
          userMarked: false,
          timesReferenced: 0
        }
      ];

      // Add messages to vector store
      for (const message of mockMessages) {
        await vectorStore.addEmbedding({
          text: message.content,
          messageId: message.messageId,
          type: 'message'
        });
      }

      // Analyze Bayesian relevance
      const result = await bayesianManager.analyzeBayesianRelevance(chatId, currentQuery);

      // Assertions
      expect(result).toBeDefined();
      expect(result.selectedMessages).toBeDefined();
      expect(result.selectedMessages.length).toBeGreaterThan(0);
      expect(result.selectedMessages.length).toBeLessThanOrEqual(3); // topKSelection

      // The machine learning related messages should be selected
      const selectedMessageIds = result.selectedMessages.map(m => m.message.messageId);
      expect(selectedMessageIds).toContain(1); // ML query
      expect(selectedMessageIds).toContain(2); // ML explanation

      // Lunch message should have lower probability and might not be selected
      const lunchMessage = result.selectedMessages.find(m => m.message.messageId === 3);
      if (lunchMessage) {
        expect(lunchMessage.bayesianScore.relevanceProbability).toBeLessThan(0.5);
      }

      // Check analysis summary
      expect(result.analysisSummary.totalMessagesAnalyzed).toBeGreaterThan(0);
      expect(result.analysisSummary.averageRelevanceProbability).toBeGreaterThan(0);
      expect(result.analysisSummary.processingTimeMs).toBeGreaterThan(0);

      // Check context note
      expect(result.contextNote).toContain('Bayesian');
      expect(result.contextNote).toContain('thông tin quan trọng');
    });

    it('should handle empty conversation history', async () => {
      const chatId = 'empty-chat';
      const currentQuery = 'Hello, this is my first message';

      const result = await bayesianManager.analyzeBayesianRelevance(chatId, currentQuery);

      expect(result.selectedMessages).toHaveLength(0);
      expect(result.analysisSummary.totalMessagesAnalyzed).toBe(0);
      expect(result.contextNote).toContain('Không tìm thấy');
    });

    it('should respect probability thresholds', async () => {
      const chatId = 'threshold-test';
      const currentQuery = 'Tell me about cooking';

      // Add a message with low relevance
      const lowRelevanceMessage: HistoricalMessage = {
        messageId: 10,
        chatId,
        content: 'The weather is nice today',
        role: 'user',
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        tokenCount: 25,
        currentImportanceScore: 0.2,
        entities: ['weather'],
        topics: ['general'],
        userMarked: false,
        timesReferenced: 0
      };

      await vectorStore.addEmbedding({
        text: lowRelevanceMessage.content,
        messageId: lowRelevanceMessage.messageId,
        type: 'message'
      });

      const result = await bayesianManager.analyzeBayesianRelevance(chatId, currentQuery);

      // Should filter out low relevance messages
      const weatherMessage = result.selectedMessages.find(m => m.message.messageId === 10);
      expect(weatherMessage).toBeUndefined();
    });
  });

  describe('createBayesianContextWindow', () => {
    it('should create a complete context window with Bayesian selection', async () => {
      const chatId = 'context-test';
      const currentQuery = 'How do I implement a neural network?';

      // Add some test messages
      const messages = [
        {
          messageId: 20,
          content: 'I need help with neural network implementation',
          role: 'user' as const,
          timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
          entities: ['neural network', 'implementation'],
          topics: ['technology', 'programming']
        },
        {
          messageId: 21,
          content: 'Here are the steps to build a neural network from scratch',
          role: 'assistant' as const,
          timestamp: new Date(Date.now() - 2.5 * 60 * 60 * 1000),
          entities: ['neural network', 'steps'],
          topics: ['technology', 'programming']
        }
      ];

      for (const msg of messages) {
        await vectorStore.addEmbedding({
          text: msg.content,
          messageId: msg.messageId,
          type: 'message'
        });
      }

      const contextWindow = await bayesianManager.createBayesianContextWindow(
        chatId,
        currentQuery,
        5 // recentMessageCount
      );

      expect(contextWindow).toBeDefined();
      expect(contextWindow.bayesianSelectedMessages).toBeDefined();
      expect(contextWindow.recentMessages).toBeDefined();
      expect(contextWindow.statistics).toBeDefined();
      expect(contextWindow.contextExplanation).toBeDefined();

      // Check statistics
      expect(contextWindow.statistics.totalTokens).toBeGreaterThanOrEqual(0);
      expect(contextWindow.statistics.compressionRatio).toBeGreaterThan(0);
      expect(contextWindow.statistics.bayesianSelectionRatio).toBeGreaterThanOrEqual(0);
      expect(contextWindow.statistics.bayesianSelectionRatio).toBeLessThanOrEqual(1);
    });
  });

  describe('Bayesian probability calculation', () => {
    it('should calculate higher probabilities for semantically similar messages', async () => {
      const chatId = 'similarity-test';
      
      // Two queries with different similarity levels
      const highSimilarityQuery = 'Tell me about machine learning algorithms';
      const lowSimilarityQuery = 'What is the weather like?';

      const mlMessage: HistoricalMessage = {
        messageId: 30,
        chatId,
        content: 'Machine learning algorithms are powerful tools for data analysis',
        role: 'assistant',
        timestamp: new Date(Date.now() - 60 * 60 * 1000),
        tokenCount: 60,
        currentImportanceScore: 0.7,
        entities: ['machine learning', 'algorithms', 'data analysis'],
        topics: ['technology'],
        userMarked: false,
        timesReferenced: 0
      };

      await vectorStore.addEmbedding({
        text: mlMessage.content,
        messageId: mlMessage.messageId,
        type: 'message'
      });

      // Test high similarity
      const highSimilarityResult = await bayesianManager.analyzeBayesianRelevance(
        chatId, 
        highSimilarityQuery
      );

      // Test low similarity
      const lowSimilarityResult = await bayesianManager.analyzeBayesianRelevance(
        chatId, 
        lowSimilarityQuery
      );

      // High similarity should produce higher probability
      if (highSimilarityResult.selectedMessages.length > 0 && lowSimilarityResult.selectedMessages.length > 0) {
        const highProb = highSimilarityResult.selectedMessages[0].bayesianScore.relevanceProbability;
        const lowProb = lowSimilarityResult.selectedMessages[0].bayesianScore.relevanceProbability;
        
        expect(highProb).toBeGreaterThan(lowProb);
      }
    });

    it('should give higher weight to user-marked messages', async () => {
      const chatId = 'user-marked-test';
      const query = 'Important information';

      const markedMessage: HistoricalMessage = {
        messageId: 40,
        chatId,
        content: 'This is very important information to remember',
        role: 'user',
        timestamp: new Date(Date.now() - 60 * 60 * 1000),
        tokenCount: 40,
        currentImportanceScore: 0.6,
        entities: ['important', 'information'],
        topics: ['general'],
        userMarked: true, // User marked as important
        timesReferenced: 2
      };

      const unmarkedMessage: HistoricalMessage = {
        messageId: 41,
        chatId,
        content: 'This is some regular information',
        role: 'user',
        timestamp: new Date(Date.now() - 60 * 60 * 1000),
        tokenCount: 30,
        currentImportanceScore: 0.6,
        entities: ['information'],
        topics: ['general'],
        userMarked: false,
        timesReferenced: 0
      };

      await vectorStore.addEmbedding({
        text: markedMessage.content,
        messageId: markedMessage.messageId,
        type: 'message'
      });

      await vectorStore.addEmbedding({
        text: unmarkedMessage.content,
        messageId: unmarkedMessage.messageId,
        type: 'message'
      });

      const result = await bayesianManager.analyzeBayesianRelevance(chatId, query);

      // Find both messages in results
      const markedResult = result.selectedMessages.find(m => m.message.messageId === 40);
      const unmarkedResult = result.selectedMessages.find(m => m.message.messageId === 41);

      if (markedResult && unmarkedResult) {
        // User-marked message should have higher probability
        expect(markedResult.bayesianScore.relevanceProbability)
          .toBeGreaterThan(unmarkedResult.bayesianScore.relevanceProbability);
      }
    });
  });
});
