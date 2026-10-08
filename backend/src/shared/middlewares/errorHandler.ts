import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../errors/AppError';
import type { ErrorResponse } from '../http/response';

// Código de PostgreSQL para violación de restricción UNIQUE.
const PG_UNIQUE_VIOLATION = '23505';

function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string';
}

function isMalformedJson(err: unknown): boolean {
  return err instanceof SyntaxError && 'type' in err && err.type === 'entity.parse.failed';
}

export const notFoundHandler: RequestHandler = (req) => {
  throw new NotFoundError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`);
};

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  let appError: AppError;

  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof z.ZodError) {
    appError = new ValidationError('Datos inválidos', z.flattenError(err).fieldErrors);
  } else if (isPgError(err) && err.code === PG_UNIQUE_VIOLATION) {
    // Respaldo ante condiciones de carrera: dos peticiones que pasan la validación a la vez.
    appError = new ConflictError('El recurso ya existe');
  } else if (isMalformedJson(err)) {
    appError = new AppError('JSON mal formado', 400);
  } else {
    console.error('Error no controlado:', err);
    appError = new AppError('Error interno del servidor', 500);
  }

  const body: ErrorResponse = { success: false, message: appError.message };
  if (appError.details !== undefined) body.details = appError.details;

  res.status(appError.statusCode).json(body);
};
