import type { Request, RequestHandler } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError';
import type { AuthContext } from '../security/accessToken';
import type { Role } from '../security/roles';

function requireAuth(req: Request): AuthContext {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
}

/** RBAC: solo deja pasar a los roles indicados. Debe ir después de authenticate. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const { role } = requireAuth(req);
    if (!roles.includes(role)) throw new ForbiddenError();
    next();
  };
}

/**
 * Pertenencia del recurso (resource ownership): el usuario solo puede operar sobre
 * su propio registro (`:param` igual a su id), salvo que sea admin.
 */
export function requireSelfOrAdmin(param = 'id'): RequestHandler {
  return (req, _res, next) => {
    const { userId, role } = requireAuth(req);
    if (role !== 'admin' && req.params[param] !== String(userId)) {
      throw new ForbiddenError();
    }
    next();
  };
}
