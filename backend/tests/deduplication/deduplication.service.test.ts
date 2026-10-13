import { beforeEach, describe, expect, it } from 'vitest';
import type { ContactData } from '../../src/modules/contacts/contact.entity';
import { ContactService } from '../../src/modules/contacts/contact.service';
import { DeduplicationService } from '../../src/modules/deduplication/deduplication.service';
import { DEFAULT_MIN_SCORE } from '../../src/modules/deduplication/deduplication.schemas';
import { NotFoundError } from '../../src/shared/errors/AppError';
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
});
