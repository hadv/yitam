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
    clientUrl: process.env.CLIENT_URL || 'http://localhost:3001',
    cors: {
      origin: process.env.CLIENT_URL || function(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
        // Allow all localhost origins in development
        if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) {
          callback(null, true);
        } else if (process.env.NODE_ENV === 'production') {
          // In production, only allow specific origins
          callback(null, origin === 'https://yitam.org');
        } else {
          callback(null, true); // Allow all in development
        }
      },
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
        'X-User-ID',
        'x-api-key'
      ]
    }
  }
}; 