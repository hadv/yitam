import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Model-specific configurations
const modelConfigs = {
  'claude-3-7-sonnet-20250219': {
    maxTokens: 10000
  },
  'claude-3-haiku-20240307': {
    maxTokens: 4000  // Haiku has a 4096 max token limit
  },
  'claude-3-sonnet-20240229': {
    maxTokens: 4000
  }
};

// Get the configured model name with fallback to Claude 3.7 Sonnet
const modelName = process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219';

// Get appropriate max tokens for the selected model
const getMaxTokensForModel = (model: string) => {
  if (model in modelConfigs) {
    return modelConfigs[model as keyof typeof modelConfigs].maxTokens;
  }
  // Default fallback
  return 4000;
};

export const config = {
  model: {
    name: modelName,
    maxTokens: parseInt(process.env.MODEL_MAX_TOKENS || getMaxTokensForModel(modelName).toString()),
  },
  server: {
    port: parseInt(process.env.PORT || '5001'),
    clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
      allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'X-Access-Code', 
        'X-Request-Signature', 
        'X-Request-Timestamp'
      ]
    }
  }
}; 