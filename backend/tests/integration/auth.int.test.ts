import type { Express } from 'express';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, createTestApp, registerUser, TEST_PASSWORD } from './support/testApp';
import { createTestPool, truncateAll } from './support/testDatabase';

const refreshCookieOf = (res: request.Response): string => {
  const setCookie = res.headers['set-cookie'];
  const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie]).find((c) => c?.startsWith('refresh_token='));
  return cookie?.split(';')[0] ?? '';
};

describe('autenticación de punta a punta (PostgreSQL real)', () => {
  let pool: Pool;
  let app: Express;

  beforeAll(() => {
    pool = createTestPool();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    app = createTestApp(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('registra, guarda solo el hash de la contraseña y del refresh token, y entrega la sesión', async () => {
    const ana = await registerUser(app, 'ana@test.com', 'Ana');

    const me = await request(app).get('/api/auth/me').set('Authorization', bearer(ana)).expect(200);
    expect(me.body.data).toMatchObject({ email: 'ana@test.com', role: 'user' });

    const { rows } = await pool.query<{ password: string }>('SELECT password FROM users WHERE id = $1', [ana.id]);
    expect(rows[0]?.password).toMatch(/^\$2[aby]\$/);
    const token = await pool.query<{ token_hash: string }>('SELECT token_hash FROM refresh_tokens');
    expect(token.rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(ana.cookie).not.toContain(token.rows[0]?.token_hash);
  });

  it('rota el refresh token y, si alguien reutiliza uno viejo, cierra todas las sesiones', async () => {
    const ana = await registerUser(app, 'ana@test.com');

    const rotated = await request(app).post('/api/auth/refresh').set('Cookie', ana.cookie).expect(200);
    const newCookie = refreshCookieOf(rotated);
    expect(newCookie).not.toBe(ana.cookie);

    // Un atacante presenta el token viejo (ya rotado): se detecta el robo...
    const reuse = await request(app).post('/api/auth/refresh').set('Cookie', ana.cookie).expect(401);
    expect(reuse.body.message).toMatch(/reutilización/i);
    // ...y también queda revocado el token legítimo más nuevo.
    await request(app).post('/api/auth/refresh').set('Cookie', newCookie).expect(401);

    const { rows } = await pool.query("SELECT 1 FROM refresh_tokens WHERE revoked_at IS NULL");
    expect(rows).toHaveLength(0);
  });

  it('dos renovaciones simultáneas con el mismo token: una gana y la otra se trata como reutilización', async () => {
    const ana = await registerUser(app, 'ana@test.com');
    const refresh = () => request(app).post('/api/auth/refresh').set('Cookie', ana.cookie);

    // Se fuerza el cruce bloqueando la fila del token desde otra transacción (ver la prueba de fusión).
    const blocker = await pool.connect();
    let results: request.Response[];
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT 1 FROM refresh_tokens WHERE user_id = $1 FOR UPDATE', [ana.id]);
      const pending = Promise.all([refresh(), refresh()]);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await blocker.query('COMMIT');
      results = await pending;
    } finally {
      blocker.release();
    }

    // SELECT ... FOR UPDATE serializa las dos transacciones: nunca se rota dos veces el mismo token.
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('rechaza credenciales incorrectas y cierra la sesión en todos los dispositivos', async () => {
    const ana = await registerUser(app, 'ana@test.com');
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'ana@test.com', password: 'otra-clave' })
      .expect(401);
    const phone = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ana@test.com', password: TEST_PASSWORD })
      .expect(200);

    await request(app).post('/api/auth/logout-all').set('Authorization', bearer(ana)).expect(204);

    await request(app).post('/api/auth/refresh').set('Cookie', ana.cookie).expect(401);
    await request(app).post('/api/auth/refresh').set('Cookie', refreshCookieOf(phone)).expect(401);
  });
});
