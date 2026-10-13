import type { Request, RequestHandler } from 'express';
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../errors/AppError';
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

/** Devuelve el id del dueño de un recurso, o null si el recurso no existe. */
export type OwnerLookup = (resourceId: number) => Promise<number | null>;

/**
 * Pertenencia de recursos que viven en la base de datos (p. ej. contactos): busca el dueño
 * del recurso `:param` y solo deja pasar a ese usuario. Debe ir después de authenticate.
 */
export function requireOwnership(lookupOwner: OwnerLookup, param = 'id'): RequestHandler {
  return async (req, _res, next) => {
    const { userId } = requireAuth(req);
    const resourceId = Number(req.params[param]);
    if (!Number.isInteger(resourceId) || resourceId <= 0) {
      throw new ValidationError('Identificador inválido');
    }

    const ownerId = await lookupOwner(resourceId);
    if (ownerId === null) throw new NotFoundError();
    if (ownerId !== userId) throw new ForbiddenError();
    next();
  };
}
