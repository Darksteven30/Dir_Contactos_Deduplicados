import { describe, expect, it } from 'vitest';
import type { ContactData } from '../../src/modules/contacts/contact.entity';
import { combineContacts } from '../../src/modules/deduplication/contactMerge';

const data = (fullName: string, overrides: Partial<ContactData> = {}): ContactData => ({
  fullName,
  email: null,
  phone: null,
  company: null,
  notes: null,
  ...overrides,
});

describe('combineContacts', () => {
  it('conserva los datos del principal y completa los vacíos con los de los duplicados', () => {
    const result = combineContacts(data('José Pérez', { email: 'jose@gmail.com' }), [
      data('jose perez', { phone: '300 123 4567' }),
      data('JOSÉ PÉREZ', { company: 'Emcali' }),
    ]);

    expect(result).toEqual({
      fullName: 'José Pérez',
      email: 'jose@gmail.com',
      phone: '300 123 4567',
      company: 'Emcali',
      notes: null,
    });
  });

  it('no pierde valores distintos: los que no se eligen quedan en las notas', () => {
    const result = combineContacts(data('Ana', { email: 'ana@gmail.com', phone: '300 111 2222' }), [
      data('Ana María', { email: 'ana@empresa.com', phone: '310 333 4444' }),
    ]);

    expect(result.email).toBe('ana@gmail.com');
    expect(result.phone).toBe('300 111 2222');
    expect(result.notes).toBe('Otros datos de contactos fusionados: email: ana@empresa.com; teléfono: 310 333 4444');
  });

  it('trata como el mismo dato los valores que solo cambian de formato', () => {
    const result = combineContacts(data('Ana', { email: 'ana@gmail.com', phone: '300 111 2222', company: 'Emcali' }), [
      data('Ana', { email: 'ANA@Gmail.com', phone: '+57 (300) 111-2222', company: 'EMCALI' }),
    ]);

    expect(result.notes).toBeNull();
  });

  it('junta las notas de todos sin repetirlas', () => {
    const result = combineContacts(data('Ana', { notes: 'Amiga del colegio' }), [
      data('Ana', { notes: 'Amiga del colegio' }),
      data('Ana', { notes: '  Vive en Cali ' }),
    ]);

    expect(result.notes).toBe('Amiga del colegio\n\nVive en Cali');
  });
});
