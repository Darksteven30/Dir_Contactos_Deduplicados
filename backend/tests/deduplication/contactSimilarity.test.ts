import { describe, expect, it } from 'vitest';
import { normalizeContact } from '../../src/modules/contacts/contact.normalizer';
import { compareContacts, nameSimilarity } from '../../src/modules/deduplication/contactSimilarity';
import { DEFAULT_MIN_SCORE } from '../../src/modules/deduplication/deduplication.schemas';

const contact = (fullName: string, email: string | null = null, phone: string | null = null) =>
  normalizeContact({ fullName, email, phone, company: null, notes: null });

describe('nameSimilarity', () => {
  it('ignora el orden de las palabras', () => {
    expect(nameSimilarity('perez jose', 'jose perez')).toBe(1);
  });

  it('tolera un apellido omitido', () => {
    expect(nameSimilarity('jose perez', 'jose perez gomez')).toBeGreaterThan(0.9);
  });

  it('no iguala un nombre de una sola palabra con cualquier nombre que la contenga', () => {
    expect(nameSimilarity('jose', 'jose perez')).toBeLessThan(0.5);
  });
});

describe('compareContacts', () => {
  it.each([
    ['error de escritura', contact('José Pérez'), contact('Jose Peres')],
    ['palabras invertidas', contact('Pérez José'), contact('José Pérez')],
    ['apellido omitido', contact('José Pérez'), contact('José Pérez Gómez')],
    ['letras transpuestas', contact('Juan Restrepo'), contact('Jaun Restrepo')],
    ['mismo email aunque el nombre difiera', contact('Mamá', 'ana@x.com'), contact('Ana Gómez', 'ANA@x.com')],
    ['mismo teléfono con y sin indicativo', contact('Ana', null, '+57 300 123 4567'), contact('Ana G', null, '3001234567')],
  ])('marca como duplicado: %s', (_label, a, b) => {
    expect(compareContacts(a, b).score).toBeGreaterThanOrEqual(DEFAULT_MIN_SCORE);
  });

  it.each([
    ['nombres distintos', contact('Carlos Ruiz'), contact('Andrea Mejía')],
    ['nombres parecidos pero de otra persona', contact('María López'), contact('Mario Lopera')],
    ['homónimos con email y teléfono distintos', contact('Juan Pérez', 'a@x.com', '3001111111'), contact('Juan Pérez', 'b@y.com', '3002222222')],
    ['un solo nombre en común', contact('José'), contact('José Pérez')],
  ])('no marca como duplicado: %s', (_label, a, b) => {
    expect(compareContacts(a, b).score).toBeLessThan(DEFAULT_MIN_SCORE);
  });

  it('explica el resultado y marca como null los campos que no se pueden comparar', () => {
    expect(compareContacts(contact('Ana', 'ana@x.com'), contact('Ana', 'ana@x.com', '3001234567'))).toEqual({
      score: 1,
      nameSimilarity: 1,
      emailMatch: true,
      phoneMatch: null,
    });
  });

  it('es simétrica', () => {
    const a = contact('José Pérez', 'jp@x.com');
    const b = contact('Jose Peres Gómez', null, '3001234567');
    expect(compareContacts(a, b)).toEqual(compareContacts(b, a));
  });
});
