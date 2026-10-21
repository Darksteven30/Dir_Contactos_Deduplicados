import { beforeEach, describe, expect, it } from 'vitest';
import type { Contact, ContactData } from '../../src/modules/contacts/contact.entity';
import { ContactService } from '../../src/modules/contacts/contact.service';
import { DeduplicationService } from '../../src/modules/deduplication/deduplication.service';
import { DEFAULT_MIN_SCORE } from '../../src/modules/deduplication/deduplication.schemas';
import { ConflictError, NotFoundError } from '../../src/shared/errors/AppError';
import { InMemoryContactRepository, InMemoryDeduplicationRepository } from '../support/inMemoryRepositories';

const ANA = 1;
const BETO = 2;

const data = (fullName: string, overrides: Partial<ContactData> = {}): ContactData => ({
  fullName,
  email: null,
  phone: null,
  company: null,
  notes: null,
  ...overrides,
});

describe('DeduplicationService', () => {
  let contacts: ContactService;
  let deduplication: InMemoryDeduplicationRepository;
  let service: DeduplicationService;

  beforeEach(() => {
    const contactRepo = new InMemoryContactRepository();
    contacts = new ContactService(contactRepo);
    deduplication = new InMemoryDeduplicationRepository(contactRepo);
    service = new DeduplicationService(deduplication);
  });

  it('agrupa duplicados de forma transitiva aunque los extremos no se parezcan', async () => {
    // A~B por nombre y B~C por teléfono, pero A y C no comparten nada.
    const a = await contacts.create(ANA, data('José Pérez'));
    const b = await contacts.create(ANA, data('Jose Peres', { phone: '300 123 4567' }));
    const c = await contacts.create(ANA, data('Pepe', { phone: '+57 3001234567' }));
    await contacts.create(ANA, data('Andrea Mejía'));

    const groups = await service.findDuplicateGroups(ANA, DEFAULT_MIN_SCORE);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.contacts.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
    expect(groups[0]?.pairs).toHaveLength(2);
  });

  it('no expone las columnas normalizadas en los grupos', async () => {
    await contacts.create(ANA, data('José Pérez'));
    await contacts.create(ANA, data('Jose Perez'));

    const [group] = await service.findDuplicateGroups(ANA, DEFAULT_MIN_SCORE);

    expect(group?.contacts[0]).not.toHaveProperty('normalizedName');
  });

  it('sugiere como principal al contacto más completo', async () => {
    await contacts.create(ANA, data('José Pérez'));
    const complete = await contacts.create(ANA, data('Jose Perez', { email: 'jp@x.com', company: 'Acme' }));

    const [group] = await service.findDuplicateGroups(ANA, DEFAULT_MIN_SCORE);

    expect(group?.suggestedPrimaryId).toBe(complete.id);
  });

  it('ordena los grupos del más al menos probable', async () => {
    await contacts.create(ANA, data('Juan Restrepo'));
    await contacts.create(ANA, data('Jaun Restrepo'));
    await contacts.create(ANA, data('Marta Gómez'));
    await contacts.create(ANA, data('Marta Gómez'));

    const groups = await service.findDuplicateGroups(ANA, DEFAULT_MIN_SCORE);

    expect(groups.map((g) => g.score)).toEqual([1, expect.any(Number)]);
    expect(groups[1]?.score).toBeLessThan(1);
  });

  it('respeta el puntaje mínimo indicado', async () => {
    await contacts.create(ANA, data('Juan Restrepo'));
    await contacts.create(ANA, data('Jaun Restrepo'));

    expect(await service.findDuplicateGroups(ANA, 0.95)).toEqual([]);
  });

  it('no mezcla contactos de distintos usuarios', async () => {
    await contacts.create(ANA, data('José Pérez'));
    await contacts.create(BETO, data('José Pérez'));

    expect(await service.findDuplicateGroups(ANA, DEFAULT_MIN_SCORE)).toEqual([]);
  });

  it('deja de sugerir un par descartado', async () => {
    const a = await contacts.create(ANA, data('José Pérez'));
    const b = await contacts.create(ANA, data('Jose Perez'));

    await service.dismissPair(ANA, [b.id, a.id]);

    expect(await service.findDuplicateGroups(ANA, DEFAULT_MIN_SCORE)).toEqual([]);
  });

  it('no permite descartar pares con contactos ajenos', async () => {
    const mine = await contacts.create(ANA, data('José Pérez'));
    const other = await contacts.create(BETO, data('José Pérez'));

    await expect(service.dismissPair(ANA, [mine.id, other.id])).rejects.toBeInstanceOf(NotFoundError);
  });

  it('encuentra contactos parecidos a uno que se está por crear', async () => {
    const existing = await contacts.create(ANA, data('José Pérez Gómez', { email: 'jp@x.com' }));
    await contacts.create(ANA, data('Andrea Mejía'));

    const similar = await service.findSimilar(ANA, data('Jose Perez'), DEFAULT_MIN_SCORE);

    expect(similar.map((s) => s.contact.id)).toEqual([existing.id]);
    expect(similar[0]?.match.nameSimilarity).toBeGreaterThan(0.9);
  });

  it('incluye en cada grupo la vista previa de la fusión sugerida', async () => {
    await contacts.create(ANA, data('José Pérez', { phone: '300 123 4567' }));
    await contacts.create(ANA, data('Jose Perez', { email: 'jp@x.com', company: 'Acme' }));

    const [group] = await service.findDuplicateGroups(ANA, DEFAULT_MIN_SCORE);

    expect(group?.mergePreview).toEqual({
      fullName: 'Jose Perez',
      email: 'jp@x.com',
      phone: '300 123 4567',
      company: 'Acme',
      notes: null,
    });
  });

  describe('fusión', () => {
    const ref = (contact: Contact) => ({ id: contact.id, version: contact.version });

    it('combina los datos en el principal, elimina los duplicados y lo registra en el historial', async () => {
      const primary = await contacts.create(ANA, data('José Pérez', { email: 'jp@x.com' }));
      const duplicate = await contacts.create(ANA, data('Jose Perez', { phone: '300 123 4567' }));

      const { merge, contact } = await service.merge(ANA, { primary: ref(primary), duplicates: [ref(duplicate)] });

      expect(contact).toMatchObject({ id: primary.id, email: 'jp@x.com', phone: '300 123 4567', version: 2 });
      await expect(contacts.getById(ANA, duplicate.id)).rejects.toBeInstanceOf(NotFoundError);
      expect(merge).toMatchObject({ primaryContactId: primary.id, mergedContactIds: [duplicate.id], undoneAt: null });
      expect(merge.before.map((c) => c.fullName)).toEqual(['José Pérez', 'Jose Perez']);
      expect(await service.findDuplicateGroups(ANA, DEFAULT_MIN_SCORE)).toEqual([]);
    });

    it('usa los datos elegidos por el usuario en lugar de la combinación automática', async () => {
      const primary = await contacts.create(ANA, data('José Pérez'));
      const duplicate = await contacts.create(ANA, data('Jose Perez'));

      const { contact } = await service.merge(ANA, {
        primary: ref(primary),
        duplicates: [ref(duplicate)],
        contact: data('José Pérez Gómez', { company: 'Emcali' }),
      });

      expect(contact).toMatchObject({ fullName: 'José Pérez Gómez', company: 'Emcali' });
    });

    it('rechaza la fusión si algún contacto cambió desde que se leyó (409) y no modifica nada', async () => {
      const primary = await contacts.create(ANA, data('José Pérez'));
      const duplicate = await contacts.create(ANA, data('Jose Perez'));
      await contacts.update(ANA, duplicate.id, { ...data('Jose Perez', { email: 'nuevo@x.com' }), version: 1 });

      const error = await service
        .merge(ANA, { primary: ref(primary), duplicates: [ref(duplicate)] })
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details).toMatchObject({ current: [{ id: primary.id }, { id: duplicate.id, version: 2 }] });
      expect((await contacts.getById(ANA, duplicate.id)).email).toBe('nuevo@x.com');
    });

    it('responde 404 si algún contacto es de otro usuario o ya fue fusionado', async () => {
      const primary = await contacts.create(ANA, data('José Pérez'));
      const duplicate = await contacts.create(ANA, data('Jose Perez'));
      const foreign = await contacts.create(BETO, data('José Pérez'));

      await expect(
        service.merge(ANA, { primary: ref(primary), duplicates: [ref(foreign)] }),
      ).rejects.toBeInstanceOf(NotFoundError);

      await service.merge(ANA, { primary: ref(primary), duplicates: [ref(duplicate)] });
      await expect(
        service.merge(ANA, { primary: { id: primary.id, version: 2 }, duplicates: [ref(duplicate)] }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('deshace la fusión y restaura los contactos tal como estaban', async () => {
      const primary = await contacts.create(ANA, data('José Pérez', { email: 'jp@x.com' }));
      const duplicate = await contacts.create(ANA, data('Jose Perez', { phone: '300 123 4567' }));
      const { merge } = await service.merge(ANA, { primary: ref(primary), duplicates: [ref(duplicate)] });

      const restored = await service.undoMerge(ANA, merge.id);

      expect(restored.map((c) => [c.id, c.phone])).toEqual([
        [primary.id, null],
        [duplicate.id, '300 123 4567'],
      ]);
      expect((await service.listMerges(ANA, { page: 1, pageSize: 20 })).items[0]?.undoneAt).toBeInstanceOf(Date);
      await expect(service.undoMerge(ANA, merge.id)).rejects.toBeInstanceOf(ConflictError);
    });

    it('no deshace si el principal se editó después de la fusión', async () => {
      const primary = await contacts.create(ANA, data('José Pérez'));
      const duplicate = await contacts.create(ANA, data('Jose Perez'));
      const { merge, contact } = await service.merge(ANA, { primary: ref(primary), duplicates: [ref(duplicate)] });
      await contacts.update(ANA, contact.id, { ...data('José Pérez', { notes: 'editado' }), version: contact.version });

      await expect(service.undoMerge(ANA, merge.id)).rejects.toBeInstanceOf(ConflictError);
      await expect(contacts.getById(ANA, duplicate.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('no permite ver ni deshacer fusiones de otro usuario', async () => {
      const primary = await contacts.create(ANA, data('José Pérez'));
      const duplicate = await contacts.create(ANA, data('Jose Perez'));
      const { merge } = await service.merge(ANA, { primary: ref(primary), duplicates: [ref(duplicate)] });

      expect((await service.listMerges(BETO, { page: 1, pageSize: 20 })).total).toBe(0);
      await expect(service.undoMerge(BETO, merge.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
