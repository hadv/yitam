import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const config = {
  llm: {
    // Primary LLM provider configuration
    provider: (process.env.LLM_PROVIDER || 'anthropic') as 'anthropic' | 'openai' | 'google',

    // API Keys for different providers
    apiKeys: {
      anthropic: process.env.ANTHROPIC_API_KEY || '',
      openai: process.env.OPENAI_API_KEY || '',
      google: process.env.GOOGLE_API_KEY || '',
    },

    // Model configuration
    model: {
      name: process.env.LLM_MODEL || process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219',
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || process.env.MODEL_MAX_TOKENS || '10000'),
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
      topP: parseFloat(process.env.LLM_TOP_P || '1.0'),
    },

    // Model-specific token limits to prevent errors
    tokenLimits: {
      // Anthropic models
      'claude-3-7-sonnet-20250219': 10000,
      'claude-3-haiku-20240307': 4000,
      'claude-3-sonnet-20240229': 4000,
      'claude-3-opus-20240229': 4000,

      // OpenAI models
      'gpt-4o': 4000,
      'gpt-4o-mini': 4000,
      'gpt-4-turbo': 4000,
      'gpt-4': 4000,
      'gpt-3.5-turbo': 4000,

      // Google models
      'gemini-1.5-pro': 4000,
      'gemini-1.5-flash': 4000,
      'gemini-1.0-pro': 4000,

      'default': 4000 // Fallback for models not explicitly listed
    } as Record<string, number>,

    // Fallback configuration
    fallback: {
      enabled: process.env.LLM_FALLBACK_ENABLED === 'true',
      providers: (process.env.LLM_FALLBACK_PROVIDERS || 'anthropic,openai').split(','),
    }
  },

  // Legacy model config for backward compatibility
  model: {
    name: process.env.LLM_MODEL || process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219',
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || process.env.MODEL_MAX_TOKENS || '10000'),
    tokenLimits: {
      'claude-3-7-sonnet-20250219': 10000,
      'claude-3-haiku-20240307': 4000,
      'default': 4000
    } as Record<string, number>
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
        'X-Request-Timestamp',
        'X-User-Email',
        'X-User-Name',
        'x-api-key'
      ]
    }
  }
};