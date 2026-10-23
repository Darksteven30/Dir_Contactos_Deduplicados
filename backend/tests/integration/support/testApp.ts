import type { Express } from 'express';
import type { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../../../src/app';
import { createLogger } from '../../../src/shared/logging/logger';

export const TEST_PASSWORD = 'clave-segura-123';

/**
 * La aplicación real (mismo composition root que en producción) conectada a la base de pruebas.
 * Se crea una por prueba: así el rate limit del login (en memoria) empieza en cero cada vez.
 */
export function createTestApp(pool: Pool): Express {
  return createApp({
    pool,
    logger: createLogger({ level: 'silent' }),
    config: {
      port: 0,
      jwtAccessSecret: 'secreto-de-pruebas-de-integracion-con-mas-de-32-caracteres',
      accessTokenTtlSeconds: 900,
      refreshTokenTtlDays: 7,
      cookieSecure: false,
      trustProxy: 0,
    },
  }).app;
}

export interface TestUser {
  id: number;
  token: string;
  /** Cookie del refresh token tal como la envía el servidor (Set-Cookie). */
  cookie: string;
}

/** Registra un usuario por la API y devuelve su access token y la cookie de sesión. */
export async function registerUser(app: Express, email: string, name = 'Usuario de prueba'): Promise<TestUser> {
  const res = await request(app).post('/api/auth/register').send({ name, email, password: TEST_PASSWORD }).expect(201);
  const setCookie = res.headers['set-cookie'];
  const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie]).find((c) => c?.startsWith('refresh_token='));
  if (!cookie) throw new Error('El registro no devolvió la cookie refresh_token');
  return { id: res.body.data.user.id, token: res.body.data.accessToken, cookie: cookie.split(';')[0]! };
}

export const bearer = (user: TestUser) => `Bearer ${user.token}`;
