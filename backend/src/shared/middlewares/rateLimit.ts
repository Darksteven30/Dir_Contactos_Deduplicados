import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';
import { TooManyRequestsError } from '../errors/AppError';

interface RateLimitOptions {
  windowMs: number;
  limit: number;
  message: string;
  /**
   * Encabezado con la IP real del usuario que pone el CDN (p. ej. `cf-connecting-ip` de Cloudflare).
   * Si llega, se cuenta por esa IP; si no, por `req.ip`.
   */
  clientIpHeader?: string;
}

/**
 * IP con la que se cuentan los intentos. Detrás de varios proxies, `req.ip` depende de cuántos
 * saltos se configuren en `trust proxy`, y en Render esa cadena no es estable: con un número
 * equivocado se toma la IP de un servidor de Cloudflare (que cambia) y el límite se reparte entre
 * varios contadores. El encabezado del CDN siempre trae la IP del usuario y el cliente no lo puede
 * falsificar, porque el CDN lo sobrescribe.
 */
export function clientIpOf(req: Request, clientIpHeader?: string): string {
  const fromCdn = clientIpHeader ? req.get(clientIpHeader)?.split(',')[0]?.trim() : undefined;
  return fromCdn || req.ip || req.socket.remoteAddress || 'desconocida';
}

/** Limita peticiones por IP; el exceso se responde con 429 en el formato estándar de la API. */
export function createRateLimiter({ windowMs, limit, message, clientIpHeader }: RateLimitOptions): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // ipKeyGenerator agrupa las IPv6 por subred: si no, cada dirección de un mismo equipo contaría aparte.
    keyGenerator: (req) => ipKeyGenerator(clientIpOf(req, clientIpHeader)),
    handler: (_req, _res, next) => next(new TooManyRequestsError(message)),
  });
}
