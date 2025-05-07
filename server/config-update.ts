import dotenv from 'dotenv';
dotenv.config();

// Helper function to parse comma-separated origins into array or string
function parseOrigins(originsStr: string | undefined): string | string[] | boolean {
  if (!originsStr) return 'http://localhost:3000';
  
  // Split by comma and trim each value
  const origins = originsStr.split(',').map(o => o.trim());
  
  // If only one origin, return it as a string
  if (origins.length === 1) return origins[0];
  
  // Otherwise return the array of origins
  return origins;
}

export const config = {
  // ... other config
  server: {
    port: parseInt(process.env.PORT || '5001'),
    clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
    cors: {
      origin: parseOrigins(process.env.CLIENT_URL),
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