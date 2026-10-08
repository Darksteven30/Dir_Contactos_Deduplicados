import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../errors/AppError';
import type { AccessTokenService } from '../security/accessToken';

const BEARER_PATTERN = /^Bearer (\S+)$/;

/** Exige un access token válido en `Authorization: Bearer <token>` y deja la identidad en req.auth. */
export function createAuthenticate(tokens: AccessTokenService): RequestHandler {
  return (req, _res, next) => {
    const token = BEARER_PATTERN.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedError('Falta el token de acceso');

    const auth = tokens.verify(token);
    if (!auth) throw new UnauthorizedError('Token de acceso inválido o expirado');

    req.auth = auth;
    next();
  };
}
