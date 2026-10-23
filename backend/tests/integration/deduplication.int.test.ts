import type { Express } from 'express';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../src/database/seeder';
import { DEMO_PASSWORD, DUPLICATE_SCENARIOS, SEED_USERS } from '../../src/database/seeds/demoData';
import { BcryptPasswordHasher } from '../../src/shared/security/passwordHasher';
import { createTestApp } from './support/testApp';
import { createTestPool, truncateAll } from './support/testDatabase';

interface GroupContact {
  id: number;
  version: number;
  fullName: string;
}
interface Group {
  suggestedPrimaryId: number;
  contacts: GroupContact[];
  pairs: Array<{ contactIds: [number, number] }>;
}

const sortedNames = (contacts: Array<{ fullName: string }>) => contacts.map((c) => c.fullName).sort();

describe('deduplicación y fusión de punta a punta (PostgreSQL real)', () => {
  let pool: Pool;
  let app: Express;
  let auth: string;

  const getGroups = async (minScore = 0.8): Promise<Group[]> =>
    (await request(app).get('/api/contacts/duplicates').query({ minScore }).set('Authorization', auth).expect(200))
      .body.data;
  const groupOf = (groups: Group[], name: string) => groups.find((g) => g.contacts.some((c) => c.fullName === name))!;
  const mergeBody = (group: Group) => {
    const primary = group.contacts.find((c) => c.id === group.suggestedPrimaryId)!;
    return {
      primary: { id: primary.id, version: primary.version },
      duplicates: group.contacts.filter((c) => c.id !== primary.id).map((c) => ({ id: c.id, version: c.version })),
    };
  };
  const contactsTotal = async () =>
    (await request(app).get('/api/contacts').set('Authorization', auth).expect(200)).body.data.total;

  beforeAll(() => {
    pool = createTestPool();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await seedDatabase(pool, new BcryptPasswordHasher(4), SEED_USERS);
    app = createTestApp(pool);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'demo@example.com', password: DEMO_PASSWORD })
      .expect(200);
    auth = `Bearer ${login.body.data.accessToken}`;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('con el SQL real de candidatos (trigramas + email + teléfono) encuentra exactamente los 8 grupos de la demo', async () => {
    const groups = await getGroups();

    expect(groups.map((g) => sortedNames(g.contacts)).sort()).toEqual(
      DUPLICATE_SCENARIOS.map((s) => sortedNames(s.contacts)).sort(),
    );
  });

  it('con sensibilidad estricta sugiere menos grupos', async () => {
    expect((await getGroups(0.9)).length).toBeLessThan(DUPLICATE_SCENARIOS.length);
  });

  it('avisa de parecidos antes de crear un contacto, sin guardarlo', async () => {
    const res = await request(app)
      .post('/api/contacts/duplicates/check')
      .set('Authorization', auth)
      .send({ fullName: 'Diana Torres' })
      .expect(200);

    expect(res.body.data.map((s: { contact: GroupContact }) => s.contact.fullName)).toEqual(
      expect.arrayContaining(['Diana Torres', 'Diana Carolina Torres']),
    );
    expect(await contactsTotal()).toBe(26);
  });

  it('un par descartado no vuelve a sugerirse', async () => {
    const daniel = groupOf(await getGroups(), 'Daniel Rojas');

    await request(app)
      .post('/api/contacts/duplicates/dismissals')
      .set('Authorization', auth)
      .send({ contactIds: daniel.pairs[0]!.contactIds })
      .expect(204);

    expect(groupOf(await getGroups(), 'Daniel Rojas')).toBeUndefined();
  });

  it('dos fusiones simultáneas del mismo grupo: una fusiona y la otra encuentra los duplicados ya fusionados', async () => {
    const jose = groupOf(await getGroups(), 'José Pérez');
    const merge = () => request(app).post('/api/contacts/duplicates/merges').set('Authorization', auth).send(mergeBody(jose));

    // Para que las dos fusiones se crucen de verdad (en local son tan rápidas que una termina antes
    // de que empiece la otra), se bloquea el contacto principal desde otra transacción, se lanzan
    // ambas, se espera a que las dos estén en curso y recién entonces se libera.
    const blocker = await pool.connect();
    let results: request.Response[];
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT 1 FROM contacts WHERE id = $1 FOR UPDATE', [jose.suggestedPrimaryId]);
      const pending = Promise.all([merge(), merge()]);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await blocker.query('COMMIT');
      results = await pending;
    } finally {
      blocker.release();
    }

    // SELECT ... FOR UPDATE en la transacción de fusión: la segunda espera, vuelve a leer y ve los
    // duplicados ya eliminados. Sin ese bloqueo, las dos fusionarían (dos 201 y dos historiales).
    expect(results.map((r) => r.status).sort()).toEqual([201, 404]);
    expect(await contactsTotal()).toBe(26 - (jose.contacts.length - 1));
    const { rows } = await pool.query('SELECT 1 FROM contact_merges');
    expect(rows).toHaveLength(1);
  });

  it('no fusiona si algún contacto cambió desde que se leyó (409) y no modifica nada', async () => {
    const diana = groupOf(await getGroups(), 'Diana Torres');
    const [first] = diana.contacts;
    await request(app)
      .put(`/api/contacts/${first!.id}`)
      .set('Authorization', auth)
      .send({ fullName: first!.fullName, company: 'Editado en otra pestaña', version: first!.version })
      .expect(200);

    await request(app)
      .post('/api/contacts/duplicates/merges')
      .set('Authorization', auth)
      .send(mergeBody(diana))
      .expect(409);

    expect(await contactsTotal()).toBe(26);
  });

  it('deshacer restaura los contactos tal como estaban, y no se puede deshacer dos veces', async () => {
    const alejandro = groupOf(await getGroups(), 'Alejandro Gómez');
    const merged = await request(app)
      .post('/api/contacts/duplicates/merges')
      .set('Authorization', auth)
      .send(mergeBody(alejandro))
      .expect(201);
    expect(await contactsTotal()).toBe(25);

    const mergeId = merged.body.data.merge.id;
    const undone = await request(app)
      .post(`/api/contacts/duplicates/merges/${mergeId}/undo`)
      .set('Authorization', auth)
      .expect(200);

    expect(sortedNames(undone.body.data)).toEqual(sortedNames(alejandro.contacts));
    expect(await contactsTotal()).toBe(26);
    await request(app).post(`/api/contacts/duplicates/merges/${mergeId}/undo`).set('Authorization', auth).expect(409);
    expect(groupOf(await getGroups(), 'Alejandro Gómez')).toBeDefined();
  });

  it('los duplicados de un usuario nunca incluyen contactos de otro', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'otro@example.com', password: DEMO_PASSWORD })
      .expect(200);

    const res = await request(app)
      .get('/api/contacts/duplicates')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .expect(200);

    // "otro" tiene un José Pérez idéntico al del demo, pero no se cruzan.
    expect(res.body.data).toEqual([]);
  });
});
