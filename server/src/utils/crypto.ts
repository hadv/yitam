import crypto from 'crypto';

/**
 * Verifies a request signature
 * @param accessCode The access code from the request
 * @param signature The signature from the request
 * @param timestamp The timestamp when the signature was created
 * @returns Boolean indicating whether the signature is valid
 */
export const verifyRequestSignature = (
  accessCode: string,
  signature: string,
  timestamp: string
): boolean => {
  if (!accessCode || !signature || !timestamp) {
    return false;
  }

  // Verify timestamp is recent (prevent replay attacks)
  const requestTime = parseInt(timestamp);
  const currentTime = Date.now();
  
  // Signature expires after 5 minutes
  if (isNaN(requestTime) || currentTime - requestTime > 5 * 60 * 1000) {
    return false;
  }

  // Get the signing secret from environment variables
  const signingSecret = process.env.SIGNING_SECRET || 'default-secret-please-change-in-production';

  // Recalculate the signature
  const message = `${accessCode}:${timestamp}`;
  const expectedSignature = crypto
    .createHmac('sha256', signingSecret)
    .update(message)
    .digest('hex');

  // Compare signatures
  return signature === expectedSignature;
};

/**
 * Generates a request signature (for testing purposes)
 * Note: This should normally only be used on the client side
 */
export const generateRequestSignature = (
  accessCode: string,
  timestamp: number = Date.now()
): { signature: string; timestamp: number } => {
  const signingSecret = process.env.SIGNING_SECRET || 'default-secret-please-change-in-production';
  
  const message = `${accessCode}:${timestamp}`;
  const signature = crypto
    .createHmac('sha256', signingSecret)
    .update(message)
    .digest('hex');

  return { signature, timestamp };
}; 