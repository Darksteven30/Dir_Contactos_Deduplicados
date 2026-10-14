import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { ContactController } from '../../src/modules/contacts/contact.controller';
import { createContactRouter } from '../../src/modules/contacts/contact.routes';
import { ContactService } from '../../src/modules/contacts/contact.service';
import { DeduplicationController } from '../../src/modules/deduplication/deduplication.controller';
import { createDeduplicationRouter } from '../../src/modules/deduplication/deduplication.routes';
import { DeduplicationService } from '../../src/modules/deduplication/deduplication.service';
import { createAuthenticate } from '../../src/shared/middlewares/authenticate';
import { requireOwnership } from '../../src/shared/middlewares/authorize';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';
import { JwtAccessTokenService } from '../../src/shared/security/accessToken';
import { InMemoryContactRepository, InMemoryDeduplicationRepository } from '../support/inMemoryRepositories';

const tokens = new JwtAccessTokenService('secreto-de-pruebas-con-al-menos-32-caracteres', 900);
const ANA = `Bearer ${tokens.sign({ userId: 1, role: 'user' })}`;
const BETO = `Bearer ${tokens.sign({ userId: 2, role: 'user' })}`;

describe('Rutas /api/contacts/duplicates', () => {
  let app: Express;

  beforeEach(() => {
    const contactRepo = new InMemoryContactRepository();
    const contacts = new ContactService(contactRepo);
    const authenticate = createAuthenticate(tokens);

    // Mismo orden de montaje que en app.ts.
    app = express();
    app.use(express.json());
    app.use(
      '/api/contacts/duplicates',
      createDeduplicationRouter(
        new DeduplicationController(new DeduplicationService(new InMemoryDeduplicationRepository(contactRepo))),
        authenticate,
      ),
    );
    app.use(
      '/api/contacts',
      createContactRouter(
        new ContactController(contacts),
        authenticate,
        requireOwnership((id) => contacts.findOwnerId(id)),
      ),
    );
    app.use(errorHandler);
  });

  const createAs = (auth: string, fullName: string) =>
    request(app).post('/api/contacts').set('Authorization', auth).send({ fullName });

  it('responde 401 sin token', async () => {
    await request(app).get('/api/contacts/duplicates').expect(401);
  });

  it('no confunde "duplicates" con el id de un contacto', async () => {
    const res = await request(app).get('/api/contacts/duplicates').set('Authorization', ANA).expect(200);

    expect(res.body.data).toEqual([]);
  });

  it('devuelve los grupos con el detalle de cada par', async () => {
    await createAs(ANA, 'José Pérez');
    await createAs(ANA, 'Jose Peres');

    const res = await request(app).get('/api/contacts/duplicates').set('Authorization', ANA).expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].pairs[0]).toMatchObject({ contactIds: [1, 2], emailMatch: null, phoneMatch: null });
  });

  it('valida el rango de minScore', async () => {
    await request(app).get('/api/contacts/duplicates').query({ minScore: 0.2 }).set('Authorization', ANA).expect(400);
  });

  it('verifica un contacto nuevo sin guardarlo', async () => {
    await createAs(ANA, 'José Pérez Gómez');

    const res = await request(app)
      .post('/api/contacts/duplicates/check')
      .set('Authorization', ANA)
      .send({ fullName: 'Jose Perez' })
      .expect(200);

    expect(res.body.data[0].contact.fullName).toBe('José Pérez Gómez');
    await request(app).get('/api/contacts').set('Authorization', ANA).expect(200).expect((r) => {
      expect(r.body.data.total).toBe(1);
    });
  });

  it('descarta un par y deja de sugerirlo', async () => {
    await createAs(ANA, 'José Pérez');
    await createAs(ANA, 'Jose Peres');

    await request(app)
      .post('/api/contacts/duplicates/dismissals')
      .set('Authorization', ANA)
      .send({ contactIds: [1, 2] })
      .expect(204);

    const res = await request(app).get('/api/contacts/duplicates').set('Authorization', ANA).expect(200);
    expect(res.body.data).toEqual([]);
  });

  it('responde 404 al descartar contactos de otro usuario y 400 si son el mismo', async () => {
    await createAs(ANA, 'José Pérez');
    await createAs(ANA, 'Jose Peres');

    await request(app)
      .post('/api/contacts/duplicates/dismissals')
      .set('Authorization', BETO)
      .send({ contactIds: [1, 2] })
      .expect(404);
    await request(app)
      .post('/api/contacts/duplicates/dismissals')
      .set('Authorization', ANA)
      .send({ contactIds: [1, 1] })
      .expect(400);
  });

  describe('fusiones', () => {
    const mergeAs = (auth: string, body: object) =>
      request(app).post('/api/contacts/duplicates/merges').set('Authorization', auth).send(body);
    const pairBody = { primary: { id: 1, version: 1 }, duplicates: [{ id: 2, version: 1 }] };

    beforeEach(async () => {
      await createAs(ANA, 'José Pérez');
      await createAs(ANA, 'Jose Peres');
    });

    it('fusiona, aparece en el historial y se puede deshacer', async () => {
      const merged = await mergeAs(ANA, pairBody).expect(201);
      expect(merged.body.data.contact).toMatchObject({ id: 1, version: 2 });
      expect(merged.body.data.merge).toMatchObject({ id: 1, primaryContactId: 1, mergedContactIds: [2] });

      await request(app).get('/api/contacts/2').set('Authorization', ANA).expect(404);

      const history = await request(app).get('/api/contacts/duplicates/merges').set('Authorization', ANA).expect(200);
      expect(history.body.data).toMatchObject({ total: 1, items: [{ id: 1, undoneAt: null }] });

      const undone = await request(app)
        .post('/api/contacts/duplicates/merges/1/undo')
        .set('Authorization', ANA)
        .expect(200);
      expect(undone.body.data.map((c: { id: number }) => c.id)).toEqual([1, 2]);
      await request(app).get('/api/contacts/2').set('Authorization', ANA).expect(200);
    });

    it('valida que los contactos sean distintos y que haya al menos un duplicado', async () => {
      await mergeAs(ANA, { primary: { id: 1, version: 1 }, duplicates: [{ id: 1, version: 1 }] }).expect(400);
      await mergeAs(ANA, { primary: { id: 1, version: 1 }, duplicates: [] }).expect(400);
    });

    it('responde 409 con las versiones vigentes si la versión enviada está desactualizada', async () => {
      const res = await mergeAs(ANA, { primary: { id: 1, version: 7 }, duplicates: [{ id: 2, version: 1 }] }).expect(
        409,
      );
      expect(res.body.details.current).toHaveLength(2);
    });

    it('no deja fusionar, ver el historial ni deshacer fusiones de otro usuario', async () => {
      await mergeAs(BETO, pairBody).expect(404);
      await mergeAs(ANA, pairBody).expect(201);

      const history = await request(app).get('/api/contacts/duplicates/merges').set('Authorization', BETO).expect(200);
      expect(history.body.data.total).toBe(0);
      await request(app).post('/api/contacts/duplicates/merges/1/undo').set('Authorization', BETO).expect(404);
    });

    it('responde 409 al deshacer dos veces la misma fusión', async () => {
      await mergeAs(ANA, pairBody).expect(201);
      await request(app).post('/api/contacts/duplicates/merges/1/undo').set('Authorization', ANA).expect(200);
      await request(app).post('/api/contacts/duplicates/merges/1/undo').set('Authorization', ANA).expect(409);
    });
  });
});
