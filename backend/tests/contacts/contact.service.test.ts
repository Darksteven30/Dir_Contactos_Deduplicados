import { beforeEach, describe, expect, it } from 'vitest';
import type { ContactData } from '../../src/modules/contacts/contact.entity';
import { ContactService } from '../../src/modules/contacts/contact.service';
import { ConflictError, NotFoundError } from '../../src/shared/errors/AppError';
import { InMemoryContactRepository } from '../support/inMemoryRepositories';

const ANA = 1;
const BETO = 2;
const PAGE = { page: 1, pageSize: 20 };

const contact = (overrides: Partial<ContactData> = {}): ContactData => ({
  fullName: 'José Pérez',
  email: 'Jose.Perez@Example.com',
  phone: '+57 (300) 123-4567',
  company: null,
  notes: null,
  ...overrides,
});

describe('ContactService', () => {
  let repo: InMemoryContactRepository;
  let service: ContactService;

  beforeEach(() => {
    repo = new InMemoryContactRepository();
    service = new ContactService(repo);
  });

  it('guarda las columnas normalizadas al crear', async () => {
    const created = await service.create(ANA, contact());

    expect(created).toMatchObject({ ownerId: ANA, fullName: 'José Pérez', version: 1 });
    expect(created).not.toHaveProperty('normalizedName');
    expect(repo.rows[0]).toMatchObject({
      normalizedName: 'jose perez',
      normalizedEmail: 'jose.perez@example.com',
      normalizedPhone: '573001234567',
    });
  });

  it('lista solo los contactos del dueño, en orden alfabético y paginados', async () => {
    await service.create(ANA, contact({ fullName: 'Zoe' }));
    await service.create(ANA, contact({ fullName: 'Álvaro' }));
    await service.create(ANA, contact({ fullName: 'Marta' }));
    await service.create(BETO, contact({ fullName: 'Ajeno' }));

    const page = await service.list(ANA, { page: 1, pageSize: 2 });

    expect(page.total).toBe(3);
    expect(page.items.map((c) => c.fullName)).toEqual(['Álvaro', 'Marta']);
  });

  it('busca normalizando el texto (sin tildes ni mayúsculas)', async () => {
    await service.create(ANA, contact());

    const result = await service.search(ANA, { q: 'PEREZ', ...PAGE });

    expect(result.items).toHaveLength(1);
  });

  it('busca por fragmento de teléfono ignorando su formato', async () => {
    await service.create(ANA, contact());

    const result = await service.search(ANA, { q: '123-45', ...PAGE });

    expect(result.items.map((c) => c.fullName)).toEqual(['José Pérez']);
  });

  it('no devuelve contactos de otro usuario en la búsqueda', async () => {
    await service.create(BETO, contact());

    expect((await service.search(ANA, { q: 'perez', ...PAGE })).total).toBe(0);
  });

  it('no permite leer el contacto de otro usuario', async () => {
    const ajeno = await service.create(BETO, contact());

    await expect(service.getById(ANA, ajeno.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('actualiza con la versión vigente e incrementa la versión', async () => {
    const created = await service.create(ANA, contact());

    const updated = await service.update(ANA, created.id, { ...contact({ fullName: 'José A. Pérez' }), version: 1 });

    expect(updated).toMatchObject({ fullName: 'José A. Pérez', version: 2 });
    expect(repo.rows[0]?.normalizedName).toBe('jose a perez');
  });

  it('rechaza una actualización con versión desactualizada y devuelve la vigente', async () => {
    const created = await service.create(ANA, contact());
    await service.update(ANA, created.id, { ...contact({ notes: 'primera edición' }), version: 1 });

    const stale = service.update(ANA, created.id, { ...contact({ notes: 'edición tardía' }), version: 1 });

    await expect(stale).rejects.toBeInstanceOf(ConflictError);
    await expect(stale).rejects.toMatchObject({ details: { current: { version: 2, notes: 'primera edición' } } });
  });

  it('elimina con borrado lógico: deja de listarse pero se conserva', async () => {
    const created = await service.create(ANA, contact());

    await service.remove(ANA, created.id);

    expect((await service.list(ANA, PAGE)).total).toBe(0);
    expect(repo.rows[0]?.deletedAt).toBeInstanceOf(Date);
    await expect(service.remove(ANA, created.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
