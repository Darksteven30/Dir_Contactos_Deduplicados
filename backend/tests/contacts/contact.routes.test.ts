import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { ContactController } from '../../src/modules/contacts/contact.controller';
import { createContactRouter } from '../../src/modules/contacts/contact.routes';
import { ContactService } from '../../src/modules/contacts/contact.service';
import { createAuthenticate } from '../../src/shared/middlewares/authenticate';
import { requireOwnership } from '../../src/shared/middlewares/authorize';
import { errorHandler } from '../../src/shared/middlewares/errorHandler';
import { JwtAccessTokenService } from '../../src/shared/security/accessToken';
import { InMemoryContactRepository } from '../support/inMemoryRepositories';

const tokens = new JwtAccessTokenService('secreto-de-pruebas-con-al-menos-32-caracteres', 900);
const ANA = `Bearer ${tokens.sign({ userId: 1, role: 'user' })}`;
const BETO = `Bearer ${tokens.sign({ userId: 2, role: 'user' })}`;
const ADMIN = `Bearer ${tokens.sign({ userId: 3, role: 'admin' })}`;

const JOSE = { fullName: 'José Pérez', email: 'jose@example.com', phone: '300 123 4567' };

// Integración de la capa HTTP: rutas + autenticación + pertenencia + validación + errores.
describe('Rutas /api/contacts', () => {
  let app: Express;

  beforeEach(() => {
    const service = new ContactService(new InMemoryContactRepository());
    app = express();
    app.use(express.json());
    app.use(
      '/api/contacts',
      createContactRouter(
        new ContactController(service),
        createAuthenticate(tokens),
        requireOwnership((id) => service.findOwnerId(id)),
      ),
    );
    app.use(errorHandler);
  });

  const createAs = (auth: string, body: object = JOSE) =>
    request(app).post('/api/contacts').set('Authorization', auth).send(body);

  it('responde 401 sin token', async () => {
    await request(app).get('/api/contacts').expect(401);
  });

  it('crea un contacto y lo asigna al usuario autenticado', async () => {
    const res = await createAs(ANA).expect(201);

    expect(res.body.data).toMatchObject({ id: 1, ownerId: 1, fullName: 'José Pérez', company: null, version: 1 });
  });

  it('ignora un ownerId enviado por el cliente', async () => {
    const res = await createAs(ANA, { ...JOSE, ownerId: 2 }).expect(201);

    expect(res.body.data.ownerId).toBe(1);
  });

  it('responde 400 con detalle por campo ante datos inválidos', async () => {
    const res = await createAs(ANA, { fullName: '  ', email: 'no-es-email', phone: 'abc' }).expect(400);

    expect(Object.keys(res.body.details)).toEqual(expect.arrayContaining(['fullName', 'email', 'phone']));
  });

  it('responde 403 si otro usuario intenta leer, editar o borrar el contacto', async () => {
    await createAs(ANA);

    await request(app).get('/api/contacts/1').set('Authorization', BETO).expect(403);
    await request(app).put('/api/contacts/1').set('Authorization', BETO).send({ ...JOSE, version: 1 }).expect(403);
    await request(app).delete('/api/contacts/1').set('Authorization', BETO).expect(403);
  });

  it('tampoco el admin accede a contactos ajenos (son privados de cada usuario)', async () => {
    await createAs(ANA);

    await request(app).get('/api/contacts/1').set('Authorization', ADMIN).expect(403);
  });

  it('responde 404 para un contacto inexistente y 400 para un id inválido', async () => {
    await request(app).get('/api/contacts/99').set('Authorization', ANA).expect(404);
    await request(app).get('/api/contacts/abc').set('Authorization', ANA).expect(400);
  });

  it('responde 409 con la versión vigente si la versión enviada está desactualizada', async () => {
    await createAs(ANA);
    await request(app).put('/api/contacts/1').set('Authorization', ANA).send({ ...JOSE, version: 1 }).expect(200);

    const res = await request(app)
      .put('/api/contacts/1')
      .set('Authorization', ANA)
      .send({ ...JOSE, notes: 'tarde', version: 1 })
      .expect(409);

    expect(res.body.details.current.version).toBe(2);
  });

  it('busca solo entre los contactos propios', async () => {
    await createAs(ANA);
    await createAs(BETO, { fullName: 'José Pérez (de Beto)' });

    const res = await request(app).get('/api/contacts/search').query({ q: 'jose' }).set('Authorization', ANA).expect(200);

    expect(res.body.data.items.map((c: { ownerId: number }) => c.ownerId)).toEqual([1]);
  });

  it('responde 400 si la búsqueda no trae texto', async () => {
    await request(app).get('/api/contacts/search').set('Authorization', ANA).expect(400);
  });

  it('pagina el listado', async () => {
    for (const fullName of ['Ana', 'Beto', 'Carla']) await createAs(ANA, { fullName });

    const res = await request(app).get('/api/contacts').query({ page: 2, pageSize: 2 }).set('Authorization', ANA).expect(200);

    expect(res.body.data).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(res.body.data.items.map((c: { fullName: string }) => c.fullName)).toEqual(['Carla']);
  });
});
