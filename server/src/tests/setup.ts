/**
 * Jest test setup file
 * Handles global test configuration and cleanup
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.CONTEXT_ENGINE_ENABLED = 'false'; // Disable context engine for most tests
process.env.VECTOR_STORE_PROVIDER = 'memory'; // Use in-memory vector store for tests
process.env.MEMORY_CACHE_ENABLED = 'true';
process.env.MEMORY_CACHE_MAX_SIZE = '100';
process.env.MEMORY_CACHE_TTL_MINUTES = '5';

// Global test timeout
jest.setTimeout(10000);

// Global cleanup after each test
afterEach(async () => {
  // Clear any timers
  jest.clearAllTimers();
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
});

// Global cleanup after all tests
afterAll(async () => {
  // Give time for async operations to complete
  await new Promise(resolve => setTimeout(resolve, 100));
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Mock external dependencies that might cause issues in tests
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      embedContent: jest.fn().mockResolvedValue({
        embedding: {
          values: new Array(768).fill(0).map(() => Math.random())
        }
      })
    })
  }))
}));

jest.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: jest.fn().mockImplementation(() => ({
    getCollections: jest.fn().mockResolvedValue({ collections: [] }),
    createCollection: jest.fn().mockResolvedValue({}),
    upsert: jest.fn().mockResolvedValue({}),
    search: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue({})
  }))
}));
