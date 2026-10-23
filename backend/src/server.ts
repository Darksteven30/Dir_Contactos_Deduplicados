import type { Server } from 'node:http';
import path from 'node:path';
import { createApp } from './app';
import { env } from './config/env';
import { runMigrations } from './database/migrator';
import { pool } from './database/pool';
import { createLogger } from './shared/logging/logger';
import { InMemoryJobQueue } from './shared/queue/jobQueue';
import { scheduleRecurring } from './shared/queue/scheduler';

const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });

// En producción el backend sirve el frontend compilado (npm run build en la raíz lo deja en
// frontend/dist). En desarrollo no: el frontend lo sirve Vite con recarga en caliente.
const frontendDistDir =
  env.FRONTEND_DIST_DIR ??
  (env.NODE_ENV === 'production' ? path.resolve(__dirname, '../../frontend/dist') : undefined);

// Si el apagado ordenado no termina en este tiempo, se fuerza la salida.
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function start(): Promise<void> {
  try {
    const applied = await runMigrations(pool);
    applied.forEach((name) => logger.info({ migration: name }, 'Migración aplicada'));

    const { app, authService } = createApp({
      pool,
      logger,
      config: {
        port: env.PORT,
        jwtAccessSecret: env.JWT_ACCESS_SECRET,
        accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
        refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
        cookieSecure: env.COOKIE_SECURE,
        trustProxy: env.TRUST_PROXY,
        authRateLimitMax: env.AUTH_RATE_LIMIT_MAX,
        ...(env.CLIENT_IP_HEADER ? { clientIpHeader: env.CLIENT_IP_HEADER } : {}),
        ...(frontendDistDir ? { frontendDistDir } : {}),
      },
    });

    // Tareas asíncronas fuera del ciclo de las peticiones.
    const queue = new InMemoryJobQueue(logger, { concurrency: 2 });
    const cancelCleanup = scheduleRecurring(
      queue,
      'purge-expired-sessions',
      env.TOKEN_CLEANUP_INTERVAL_MINUTES * 60_000,
      async () => {
        const deleted = await authService.purgeExpiredSessions();
        logger.info({ deleted }, 'Refresh tokens vencidos eliminados');
      },
    );

    const server = app.listen(env.PORT, () => {
      logger.info({ port: env.PORT }, `Servidor en http://localhost:${env.PORT} (Swagger en /api-docs)`);
    });

    const shutdown = (signal: string) => {
      logger.info({ signal }, 'Apagando: se dejan de aceptar conexiones');
      setTimeout(() => {
        logger.error('El apagado tardó demasiado; se fuerza la salida');
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS).unref();

      cancelCleanup();
      void closeServer(server)
        .then(() => queue.stop())
        .then(() => pool.end())
        .then(() => {
          logger.info('Apagado completo');
          process.exit(0);
        })
        .catch((err: unknown) => {
          logger.error({ err }, 'Error durante el apagado');
          process.exit(1);
        });
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.fatal({ err }, 'Error al iniciar');
    await pool.end();
    process.exit(1);
  }
}

// Espera a que terminen las peticiones en curso.
function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

void start();
