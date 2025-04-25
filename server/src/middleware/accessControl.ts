import { Request, Response, NextFunction } from 'express';

interface AccessCodeRequest extends Request {
  accessCode?: string;
}

export const validateAccessCode = (req: AccessCodeRequest, res: Response, next: NextFunction) => {
  const accessCode = req.headers['x-access-code'] as string;
  
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

  req.accessCode = accessCode;
  next();
}; 