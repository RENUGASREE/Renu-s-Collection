import { Request, Response, NextFunction } from "express";
import { ZodError, ZodSchema } from "zod";

// Middleware to detect and block malicious URL patterns
export function sanitizeRequest(req: Request, _res: Response, next: NextFunction): void | Response {
  const url = req.url.toLowerCase();
  const suspiciousPatterns = [
    /~and~/i,
    /\/\.\.\/|\/\.\.\\/,
    /<script|javascript:|onerror=/i,
    /union.*select|select.*from|insert.*into|delete.*from|drop.*table/i,
    /eval\(|exec\(|system\(/i,
    /\.\./,
    /%2e%2e/i,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(url)) {
      console.warn('Blocked suspicious request:', {
        url: req.url,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      return _res.status(400).json({ success: false, error: 'Invalid request' });
    }
  }

  next();
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query) as typeof req.query;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as typeof req.params;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export { ZodError };
