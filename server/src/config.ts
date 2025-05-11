import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const config = {
  model: {
    name: process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219',
    maxTokens: parseInt(process.env.MODEL_MAX_TOKENS || '10000'),
    // Add model-specific max token limits to prevent errors
    tokenLimits: {
      'claude-3-7-sonnet-20250219': 10000,
      'claude-3-haiku-20240307': 4000,
      'default': 4000 // Fallback for models not explicitly listed
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
        'X-User-Name'
      ]
    }
  }
}; 