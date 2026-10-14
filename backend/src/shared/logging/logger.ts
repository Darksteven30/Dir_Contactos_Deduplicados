import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';
import { getCorrelationId } from './requestContext';

export type { Logger };

export interface LoggerConfig {
  level: string;
  /** Salida legible y con colores para desarrollo; en producción se emite JSON (una línea por evento). */
  pretty?: boolean;
}

/**
 * Logs estructurados en JSON. Cada línea incluye automáticamente el `correlationId`
 * de la petición o el trabajo en curso, para poder seguir una operación de punta a punta.
 */
export function createLogger({ level, pretty = false }: LoggerConfig, destination?: DestinationStream): Logger {
  const options: LoggerOptions = {
    level,
    base: { service: 'contactos-backend' },
    timestamp: pino.stdTimeFunctions.isoTime,
    mixin: () => {
      const correlationId = getCorrelationId();
      return correlationId ? { correlationId } : {};
    },
    // Nunca escribir credenciales en los logs.
    redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.accessToken', '*.refreshToken'],
  };

  if (destination) return pino(options, destination);
  if (pretty) {
    return pino({ ...options, transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } } });
  }
  return pino(options);
}
