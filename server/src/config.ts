import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const config = {
  model: {
    name: process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219',
    maxTokens: parseInt(process.env.MODEL_MAX_TOKENS || '1000'),
  },
  // Add other configuration categories here as needed
}; 