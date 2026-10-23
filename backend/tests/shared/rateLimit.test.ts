import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createErrorHandler } from '../../src/shared/middlewares/errorHandler';
import { createRateLimiter } from '../../src/shared/middlewares/rateLimit';
import { silentLogger } from '../support/inMemoryRepositories';

interface Setup {
  trustProxy: number;
  clientIpHeader?: string;
}

function appBehindProxies({ trustProxy, clientIpHeader }: Setup): Express {
  const app = express();
  app.set('trust proxy', trustProxy);
  app.post(
    '/login',
    createRateLimiter({ windowMs: 60_000, limit: 2, message: 'Demasiados intentos', ...(clientIpHeader ? { clientIpHeader } : {}) }),
    (_req, res) => {
      res.status(401).end();
    },
  );
  app.use(createErrorHandler(silentLogger));
  return app;
}

/**
 * Una petición tal como llega a la app en Render: Cloudflare pone la IP del usuario en
 * CF-Connecting-IP y la agrega a X-Forwarded-For; después cada proxy agrega la suya. Cuántos
 * proxies hay (y qué servidor de Cloudflare atendió) cambia de una petición a otra.
 */
interface Hop {
  client: string;
  proxies: string[];
  /** Lo que el propio cliente haya puesto en X-Forwarded-For (un atacante puede inventarlo). */
  forged?: string;
}

async function statuses(app: Express, hops: Hop[]): Promise<number[]> {
  const result: number[] = [];
  for (const { client, proxies, forged } of hops) {
    const forwardedFor = [forged, client, ...proxies].filter(Boolean).join(', ');
    const res = await request(app).post('/login').set('X-Forwarded-For', forwardedFor).set('CF-Connecting-IP', client);
    result.push(res.status);
  }
  return result;
}

// El mismo usuario, atendido por distintos servidores de Cloudflare y cadenas de distinto largo.
const sameUser: Hop[] = [
  { client: '203.0.113.7', proxies: ['172.68.0.1'] },
  { client: '203.0.113.7', proxies: ['172.68.0.2', '10.0.0.5'] },
  { client: '203.0.113.7', proxies: ['172.68.0.3'] },
];

describe('rate limit detrás de Cloudflare + Render', () => {
  it('contando por CF-Connecting-IP bloquea al mismo usuario aunque cambien los proxies', async () => {
    const app = appBehindProxies({ trustProxy: 1, clientIpHeader: 'cf-connecting-ip' });

    expect(await statuses(app, sameUser)).toEqual([401, 401, 429]);
  });

  it('contando por saltos de trust proxy el límite se reparte entre proxies (el error corregido)', async () => {
    // Con 1 salto, la "IP del usuario" es la del último proxy: cada uno tiene su propio contador.
    expect(await statuses(appBehindProxies({ trustProxy: 1 }), sameUser)).toEqual([401, 401, 401]);
  });

  it('usuarios distintos tienen contadores distintos', async () => {
    const app = appBehindProxies({ trustProxy: 1, clientIpHeader: 'cf-connecting-ip' });

    expect(
      await statuses(app, [
        { client: '203.0.113.7', proxies: ['172.68.0.1'] },
        { client: '203.0.113.7', proxies: ['172.68.0.1'] },
        { client: '198.51.100.20', proxies: ['172.68.0.1'] },
      ]),
    ).toEqual([401, 401, 401]);
  });

  it('una IP falsa en X-Forwarded-For no sirve para evadir el límite', async () => {
    const app = appBehindProxies({ trustProxy: 1, clientIpHeader: 'cf-connecting-ip' });
    const attacker = ['1.1.1.1', '2.2.2.2', '3.3.3.3'].map((forged) => ({
      client: '203.0.113.7',
      proxies: ['172.68.0.1'],
      forged,
    }));

    expect(await statuses(app, attacker)).toEqual([401, 401, 429]);
  });

  it('sin encabezado del CDN (desarrollo local) cuenta por la IP de la conexión', async () => {
    const app = appBehindProxies({ trustProxy: 0, clientIpHeader: 'cf-connecting-ip' });
    const local = () => request(app).post('/login');

    expect([(await local()).status, (await local()).status, (await local()).status]).toEqual([401, 401, 429]);
  });
});
