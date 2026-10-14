import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { runWithContext } from '../logging/requestContext';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

// Solo se acepta un id razonable del cliente; cualquier otra cosa (vacío, muy largo, caracteres
// raros que podrían inyectar texto en los logs) se reemplaza por uno nuevo.
const VALID_CORRELATION_ID = /^[\w.-]{1,100}$/;

/**
 * Asigna a cada petición un correlation id: reutiliza el que envía el cliente en `x-correlation-id`
 * (así se sigue una operación entre servicios) o genera uno. Se devuelve en el mismo header y queda
 * disponible para los logs durante toda la petición.
 */
export const correlationId: RequestHandler = (req, res, next) => {
  const incoming = req.get(CORRELATION_ID_HEADER);
  const id = incoming && VALID_CORRELATION_ID.test(incoming) ? incoming : randomUUID();

  res.setHeader(CORRELATION_ID_HEADER, id);
  runWithContext({ correlationId: id }, next);
};
