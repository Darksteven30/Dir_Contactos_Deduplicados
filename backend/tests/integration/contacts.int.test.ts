import type { Express } from 'express';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, createTestApp, registerUser, type TestUser } from './support/testApp';
import { createTestPool, truncateAll } from './support/testDatabase';

describe('contactos de punta a punta (PostgreSQL real)', () => {
  let pool: Pool;
  let app: Express;
  let ana: TestUser;
  let beto: TestUser;

  const create = (user: TestUser, body: object) =>
    request(app).post('/api/contacts').set('Authorization', bearer(user)).send(body).expect(201);

  beforeAll(() => {
    pool = createTestPool();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    app = createTestApp(pool);
    ana = await registerUser(app, 'ana@test.com', 'Ana');
    beto = await registerUser(app, 'beto@test.com', 'Beto');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('la búsqueda difusa con trigramas tolera errores de escritura, tildes y mayúsculas', async () => {
    await create(ana, { fullName: 'José Pérez', phone: '300 123 4567' });
    await create(ana, { fullName: 'JOSÉ PÉREZ GÓMEZ' });
    await create(ana, { fullName: 'Andrea Mejía' });

    const res = await request(app)
      .get('/api/contacts/search')
      .query({ q: 'jose peres' })
      .set('Authorization', bearer(ana))
      .expect(200);

    expect(res.body.data.items.map((c: { fullName: string }) => c.fullName)).toEqual(
      expect.arrayContaining(['José Pérez', 'JOSÉ PÉREZ GÓMEZ']),
    );
    expect(res.body.data.items.map((c: { fullName: string }) => c.fullName)).not.toContain('Andrea Mejía');
    expect(res.body.data.items[0].score).toBeGreaterThan(0.5);
  });

  it('también encuentra por un fragmento del teléfono, sin importar el formato', async () => {
    await create(ana, { fullName: 'José Pérez', phone: '+57 (300) 123-4567' });

    const res = await request(app)
      .get('/api/contacts/search')
      .query({ q: '3001234' })
      .set('Authorization', bearer(ana))
      .expect(200);

    expect(res.body.data.total).toBe(1);
  });

  it('cada usuario solo ve y modifica sus propios contactos', async () => {
    const created = await create(ana, { fullName: 'Contacto de Ana' });
    const id = created.body.data.id;

    await request(app).get(`/api/contacts/${id}`).set('Authorization', bearer(beto)).expect(403);
    await request(app).delete(`/api/contacts/${id}`).set('Authorization', bearer(beto)).expect(403);
    const list = await request(app).get('/api/contacts').set('Authorization', bearer(beto)).expect(200);
    expect(list.body.data.total).toBe(0);
    const search = await request(app)
      .get('/api/contacts/search')
      .query({ q: 'contacto de ana' })
      .set('Authorization', bearer(beto))
      .expect(200);
    expect(search.body.data.total).toBe(0);
  });

  it('dos ediciones simultáneas sobre la misma versión: una gana y la otra recibe 409 con la versión vigente', async () => {
    const created = await create(ana, { fullName: 'José Pérez' });
    const { id, version } = created.body.data;
    const edit = (fullName: string) =>
      request(app).put(`/api/contacts/${id}`).set('Authorization', bearer(ana)).send({ fullName, version });

    const results = await Promise.all([edit('José Pérez (pestaña A)'), edit('José Pérez (pestaña B)')]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = results.find((r) => r.status === 200)!;
    const loser = results.find((r) => r.status === 409)!;
    expect(loser.body.details.current).toMatchObject({ fullName: winner.body.data.fullName, version: 2 });

    const { rows } = await pool.query<{ version: number }>('SELECT version FROM contacts WHERE id = $1', [id]);
    expect(rows[0]?.version).toBe(2);
  });

  it('el borrado es lógico: deja de verse pero la fila se conserva', async () => {
    const created = await create(ana, { fullName: 'José Pérez' });
    const id = created.body.data.id;

    await request(app).delete(`/api/contacts/${id}`).set('Authorization', bearer(ana)).expect(204);

    await request(app).get(`/api/contacts/${id}`).set('Authorization', bearer(ana)).expect(404);
    const { rows } = await pool.query('SELECT deleted_at FROM contacts WHERE id = $1', [id]);
    expect(rows[0]?.deleted_at).toBeInstanceOf(Date);
  });
});
