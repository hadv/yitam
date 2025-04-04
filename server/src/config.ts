import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const config = {
  model: {
    name: process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219',
    maxTokens: parseInt(process.env.MODEL_MAX_TOKENS || '1000'),
  },
  server: {
    port: parseInt(process.env.PORT || '5001'),
    clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
      allowedHeaders: ['my-custom-header']
    }
  }
}; 