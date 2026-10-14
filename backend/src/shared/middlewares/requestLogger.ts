import type { RequestHandler } from 'express';
import type { Logger } from '../logging/logger';

/** Registra cada petición al terminar: método, ruta, código de respuesta y duración. */
export function createRequestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const entry = {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        userId: req.auth?.userId,
      };

      if (res.statusCode >= 500) logger.error(entry, 'Petición fallida');
      else if (res.statusCode >= 400) logger.warn(entry, 'Petición rechazada');
      else logger.info(entry, 'Petición completada');
    });

    next();
  };
}
