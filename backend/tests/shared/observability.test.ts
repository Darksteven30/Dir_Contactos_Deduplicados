import express, { type Express } from 'express';
import helmet from 'helmet';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createHealthRouter } from '../../src/shared/http/health';
import { createLogger } from '../../src/shared/logging/logger';
import { CORRELATION_ID_HEADER, correlationId } from '../../src/shared/middlewares/correlationId';
import { createErrorHandler, notFoundHandler } from '../../src/shared/middlewares/errorHandler';
import { createRequestLogger } from '../../src/shared/middlewares/requestLogger';

type LogLine = Record<string, unknown>;

const UUID = /^[0-9a-f-]{36}$/;

describe('correlation id, logs estructurados y manejo de errores', () => {
  let app: Express;
  let lines: LogLine[];
  let databaseUp: boolean;

  beforeEach(() => {
    lines = [];
    databaseUp = true;
    const logger = createLogger({ level: 'info' }, { write: (line: string) => void lines.push(JSON.parse(line)) });

    // Mismo orden de middlewares que en app.ts.
    app = express();
    app.use(correlationId);
    app.use(createRequestLogger(logger));
    app.use(helmet());
    app.get('/ok', (_req, res) => {
      logger.info('dentro del controlador');
      res.json({ ok: true });
    });
    app.get('/boom', () => {
      throw new Error('detalle interno que no debe filtrarse');
    });
    app.use(
      '/health',
      createHealthRouter(async () => {
        if (!databaseUp) throw new Error('conexión rechazada');
      }, logger),
    );
    app.use(notFoundHandler);
    app.use(createErrorHandler(logger));
  });

  it('genera un correlation id cuando el cliente no envía uno y lo devuelve en el header', async () => {
    const res = await request(app).get('/ok').expect(200);

    expect(res.headers[CORRELATION_ID_HEADER]).toMatch(UUID);
  });

  it('reutiliza el correlation id válido que envía el cliente', async () => {
    const res = await request(app).get('/ok').set(CORRELATION_ID_HEADER, 'front-42.abc').expect(200);

    expect(res.headers[CORRELATION_ID_HEADER]).toBe('front-42.abc');
  });

  it('reemplaza un correlation id inválido para no inyectar texto en los logs', async () => {
    for (const invalid of ['id con espacios "y comillas"', 'x'.repeat(101)]) {
      const res = await request(app).get('/ok').set(CORRELATION_ID_HEADER, invalid).expect(200);

      expect(res.headers[CORRELATION_ID_HEADER]).toMatch(UUID);
    }
  });

  it('todos los logs de una petición llevan su correlation id', async () => {
    await request(app).get('/ok').set(CORRELATION_ID_HEADER, 'req-1').expect(200);

    expect(lines.map((line) => [line.msg, line.correlationId])).toEqual([
      ['dentro del controlador', 'req-1'],
      ['Petición completada', 'req-1'],
    ]);
    expect(lines[1]).toMatchObject({ method: 'GET', url: '/ok', status: 200, level: 30 });
  });

  it('ante un error inesperado responde 500 genérico con el correlation id y registra el detalle', async () => {
    const res = await request(app).get('/boom').set(CORRELATION_ID_HEADER, 'req-2').expect(500);

    expect(res.body).toEqual({ success: false, message: 'Error interno del servidor', correlationId: 'req-2' });
    const errorLog = lines.find((line) => line.msg === 'Error no controlado');
    expect(errorLog).toMatchObject({ correlationId: 'req-2', err: { message: 'detalle interno que no debe filtrarse' } });
    expect(lines.at(-1)).toMatchObject({ msg: 'Petición fallida', status: 500, level: 50 });
  });

  it('registra como advertencia las peticiones rechazadas (4xx)', async () => {
    const res = await request(app).get('/no-existe').expect(404);

    expect(res.body.correlationId).toBe(res.headers[CORRELATION_ID_HEADER]);
    expect(lines.at(-1)).toMatchObject({ msg: 'Petición rechazada', status: 404, level: 40 });
  });

  it('agrega los headers de seguridad de helmet', async () => {
    const res = await request(app).get('/ok').expect(200);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('health responde 200 con la base de datos disponible y 503 sin ella', async () => {
    const up = await request(app).get('/health').expect(200);
    expect(up.body).toMatchObject({ status: 'ok', database: 'ok' });

    databaseUp = false;
    const down = await request(app).get('/health').expect(503);
    expect(down.body).toMatchObject({ status: 'error', database: 'error' });
  });
});
