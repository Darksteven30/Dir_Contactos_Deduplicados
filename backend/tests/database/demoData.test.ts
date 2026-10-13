import { describe, expect, it } from 'vitest';
import { registerSchema } from '../../src/modules/auth/auth.schemas';
import { contactInputSchema } from '../../src/modules/contacts/contact.schemas';
import { ContactService } from '../../src/modules/contacts/contact.service';
import { DEFAULT_MIN_SCORE } from '../../src/modules/deduplication/deduplication.schemas';
import { DeduplicationService } from '../../src/modules/deduplication/deduplication.service';
import { DUPLICATE_SCENARIOS, SEED_USERS, UNIQUE_CONTACTS } from '../../src/database/seeds/demoData';
import { InMemoryContactRepository, InMemoryDeduplicationRepository } from '../support/inMemoryRepositories';

const OWNER = 1;

const sortedNames = (contacts: Array<{ fullName: string }>): string[] =>
  contacts.map((contact) => contact.fullName).sort();

describe('datos de prueba (seed)', () => {
  it('son aceptados por las mismas validaciones que la API', () => {
    for (const user of SEED_USERS) {
      expect(registerSchema.safeParse(user).success, user.email).toBe(true);
      for (const contact of user.contacts) {
        expect(contactInputSchema.safeParse(contact).success, contact.fullName).toBe(true);
      }
    }
    expect(new Set(SEED_USERS.map((user) => user.email)).size).toBe(SEED_USERS.length);
  });

  it('cada escenario forma exactamente un grupo de duplicados y los únicos no se agrupan', async () => {
    const contactRepo = new InMemoryContactRepository();
    const contacts = new ContactService(contactRepo);
    const deduplication = new DeduplicationService(new InMemoryDeduplicationRepository(contactRepo));

    for (const data of [...DUPLICATE_SCENARIOS.flatMap((scenario) => scenario.contacts), ...UNIQUE_CONTACTS]) {
      await contacts.create(OWNER, data);
    }

    const groups = await deduplication.findDuplicateGroups(OWNER, DEFAULT_MIN_SCORE);

    expect(groups.map((group) => sortedNames(group.contacts)).sort()).toEqual(
      DUPLICATE_SCENARIOS.map((scenario) => sortedNames(scenario.contacts)).sort(),
    );
  });
});
