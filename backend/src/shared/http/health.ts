import { Router } from 'express';
import type { Logger } from '../logging/logger';

export interface HealthStatus {
  status: 'ok' | 'error';
  database: 'ok' | 'error';
  uptimeSeconds: number;
}

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Estado del servicio
 *     description: Verifica que la API responde y que hay conexión con PostgreSQL. Lo usan las plataformas de despliegue.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Servicio operativo
 *       503:
 *         description: Sin conexión con la base de datos
 */
export function createHealthRouter(checkDatabase: () => Promise<void>, logger: Logger): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    let database: HealthStatus['database'] = 'ok';
    try {
      await checkDatabase();
    } catch (err) {
      logger.error({ err }, 'Health check: sin conexión con la base de datos');
      database = 'error';
    }

    const body: HealthStatus = {
      status: database === 'ok' ? 'ok' : 'error',
      database,
      uptimeSeconds: Math.round(process.uptime()),
    };
    res.status(database === 'ok' ? 200 : 503).json(body);
  });

  return router;
}
