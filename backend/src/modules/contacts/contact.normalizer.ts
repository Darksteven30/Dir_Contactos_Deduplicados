/**
 * Normalización para comparar contactos: elimina diferencias de formato que no cambian la
 * identidad (mayúsculas, tildes, puntuación, espacios repetidos, formato del teléfono).
 * Ejemplo: "  José  PÉREZ-Gómez " -> "jose perez gomez".
 */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function normalizeEmail(email: string | null): string | null {
  const value = email?.trim().toLowerCase();
  return value ? value : null;
}

// "+57 (300) 123-4567" -> "573001234567"
export function normalizePhone(phone: string | null): string | null {
  const digits = phone?.replace(/\D/g, '');
  return digits ? digits : null;
}
