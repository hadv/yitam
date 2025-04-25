import { Request, Response, NextFunction } from 'express';
import { verifyRequestSignature } from '../utils/crypto';

interface AccessCodeRequest extends Request {
  accessCode?: string;
}

export const validateAccessCode = (req: AccessCodeRequest, res: Response, next: NextFunction) => {
  const accessCode = req.headers['x-access-code'] as string;
  const signature = req.headers['x-request-signature'] as string;
  const timestamp = req.headers['x-request-timestamp'] as string;
  
  if (!accessCode) {
    return res.status(401).json({
      error: 'Access code is required',
      message: 'Please provide a valid access code in the X-Access-Code header'
    });
  }

  const validAccessCodes = process.env.VALID_ACCESS_CODES?.split(',') || [];
  
  if (!validAccessCodes.includes(accessCode)) {
    return res.status(403).json({
      error: 'Invalid access code',
      message: 'The provided access code is not valid'
    });
  }

  // Verify request signature if signature verification is enabled
  if (process.env.ENABLE_SIGNATURE_VERIFICATION === 'true') {
    if (!signature || !timestamp) {
      return res.status(401).json({
        error: 'Request signature required',
        message: 'Please provide a valid request signature'
      });
    }

    if (!verifyRequestSignature(accessCode, signature, timestamp)) {
      return res.status(403).json({
        error: 'Invalid request signature',
        message: 'The provided request signature is not valid or has expired'
      });
    }
  }

  req.accessCode = accessCode;
  next();
}; 