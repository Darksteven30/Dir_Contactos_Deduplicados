import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizePhone, normalizeText } from '../../src/modules/contacts/contact.normalizer';

describe('Normalización de contactos', () => {
  describe('normalizeText', () => {
    it('quita tildes, mayúsculas, puntuación y espacios repetidos', () => {
      expect(normalizeText('  José  PÉREZ-Gómez ')).toBe('jose perez gomez');
    });

    it('trata la ñ y la ü como n y u', () => {
      expect(normalizeText('Íñigo Güell')).toBe('inigo guell');
    });

    it('produce el mismo valor para variantes de formato del mismo nombre', () => {
      expect(normalizeText('MARÍA.  del-carmen')).toBe(normalizeText('Maria del Carmen'));
    });

    it('devuelve vacío si no hay letras ni números', () => {
      expect(normalizeText(' ... -- ')).toBe('');
    });
  });

  describe('normalizeEmail', () => {
    it('pasa a minúsculas y recorta espacios', () => {
      expect(normalizeEmail('  Ana.Gomez@Example.COM ')).toBe('ana.gomez@example.com');
    });

    it('devuelve null si no hay email', () => {
      expect(normalizeEmail(null)).toBeNull();
      expect(normalizeEmail('   ')).toBeNull();
    });
  });

  describe('normalizePhone', () => {
    it('conserva solo los dígitos', () => {
      expect(normalizePhone('+57 (300) 123-4567')).toBe('573001234567');
    });

    it('devuelve null si no hay dígitos', () => {
      expect(normalizePhone(null)).toBeNull();
      expect(normalizePhone('---')).toBeNull();
    });
  });
});
