import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { TooManyRequestsError } from '../errors/AppError';

interface RateLimitOptions {
  windowMs: number;
  limit: number;
  message: string;
}

/** Limita peticiones por IP; el exceso se responde con 429 en el formato estándar de la API. */
export function createRateLimiter({ windowMs, limit, message }: RateLimitOptions): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new TooManyRequestsError(message)),
  });
}
