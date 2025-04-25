/**
 * Generates a request signature for API requests
 * @param accessCode The access code to sign
 * @returns Promise that resolves to an object containing signature and timestamp
 */
export const generateRequestSignature = async (
  accessCode: string
): Promise<{ signature: string; timestamp: number }> => {
  // Note: In a production environment, this signing should happen server-side
  // or use a more secure method rather than hardcoding the secret.
  // This implementation is for demonstration purposes only.
  
  // This should match the server's signing secret
  const signingSecret = 'default-secret-please-change-in-production';
  
  const timestamp = Date.now();
  const message = `${accessCode}:${timestamp}`;
  
  // Implementation of HMAC-SHA256 for browser environment
  const signature = await generateHmacSha256(message, signingSecret);
  
  return { signature, timestamp };
};

/**
 * Generates an HMAC-SHA256 signature in the browser
 * @param message The message to sign
 * @param key The key to use for signing
 * @returns The hex-encoded signature
 */
const generateHmacSha256 = async (message: string, key: string): Promise<string> => {
  // For browser compatibility, we'll use the Web Crypto API
  const encoder = new TextEncoder();
  const messageBuffer = encoder.encode(message);
  const keyBuffer = encoder.encode(key);
  
  // Import the key
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Sign the message
  const signatureBuffer = await window.crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    messageBuffer
  );
  
  // Convert to hex string
  return Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}; 