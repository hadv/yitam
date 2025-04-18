import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Define the LLM Provider type
type LlmProvider = 'anthropic' | 'openai';

// Function to safely get the LLM provider from env
const getLlmProvider = (): LlmProvider => {
  const provider = process.env.LLM_PROVIDER?.toLowerCase();
  if (provider === 'openai') {
    return 'openai';
  }
  // Default to anthropic if not specified or invalid
  return 'anthropic'; 
};

export const config = {
  // LLM Provider Selection
  llmProvider: getLlmProvider(),
  
  // Anthropic Configuration (if used)
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    modelName: process.env.ANTHROPIC_MODEL || 'claude-3-opus-20240229',
  },
  
  // OpenAI Configuration (if used)
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    modelName: process.env.OPENAI_MODEL_NAME || 'gpt-4-turbo-preview',
  },
  
  // General Model Configuration (shared)
  model: {
    maxTokens: parseInt(process.env.MODEL_MAX_TOKENS || '4096'), // Use MODEL_MAX_TOKENS for both
  },
  
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT || '5001'),
    clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
    mcpServerPath: process.env.MCP_SERVER_PATH, // Load MCP server path
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
      allowedHeaders: ['my-custom-header'] // Kept existing allowedHeaders
    }
  }
}; 