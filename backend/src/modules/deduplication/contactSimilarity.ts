import { levenshteinSimilarity } from '../../shared/algorithms/levenshtein';
import type { NormalizedContactFields } from '../contacts/contact.repository';
import type { ContactMatch } from './deduplication.entity';

/**
 * Peso de cada campo en el puntaje. Solo cuentan los campos que ambos contactos tienen:
 * si uno no tiene teléfono, el puntaje se calcula con nombre y email (pesos re-normalizados).
 */
export const FIELD_WEIGHTS = { name: 0.5, email: 0.3, phone: 0.2 } as const;

/**
 * Un email o teléfono idéntico es evidencia fuerte aunque el nombre esté escrito muy distinto
 * ("Mamá" vs "Ana Gómez"): el puntaje no baja de estos pisos.
 */
export const EMAIL_MATCH_FLOOR = 0.85;
export const PHONE_MATCH_FLOOR = 0.8;

// Los números se comparan por sus últimos 10 dígitos para ignorar el indicativo de país
// ("+57 300 123 4567" y "300 123 4567" son el mismo número).
const PHONE_SIGNIFICANT_DIGITS = 10;

const tokensOf = (name: string): string[] => name.split(' ').filter(Boolean);

/**
 * Similitud por palabras: cada palabra del nombre más corto se empareja con la palabra más
 * parecida del más largo. Cubre el caso frecuente de apellidos omitidos:
 * "jose perez" vs "jose perez gomez" -> todas las palabras coinciden, con una pequeña
 * penalización por la palabra que sobra.
 */
function tokenSetSimilarity(a: string[], b: string[]): number {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const total = shorter.reduce(
    (sum, token) => sum + Math.max(...longer.map((other) => levenshteinSimilarity(token, other))),
    0,
  );
  const coverage = shorter.length / longer.length;
  return (total / shorter.length) * (0.8 + 0.2 * coverage);
}

/**
 * Similitud de nombres (ya normalizados) entre 0 y 1. Toma la mejor de tres comparaciones:
 * 1. Levenshtein sobre el nombre completo ("jose peres" vs "jose perez").
 * 2. Levenshtein con las palabras ordenadas ("perez jose" vs "jose perez").
 * 3. Por palabras, solo si ambos tienen al menos dos ("jose perez" vs "jose perez gomez").
 *    Con una sola palabra no se aplica: "jose" no debe igualar a todos los "jose ...".
 */
export function nameSimilarity(a: string, b: string): number {
  const tokensA = tokensOf(a);
  const tokensB = tokensOf(b);
  const sorted = (tokens: string[]) => [...tokens].sort().join(' ');

  let best = Math.max(levenshteinSimilarity(a, b), levenshteinSimilarity(sorted(tokensA), sorted(tokensB)));
  if (tokensA.length >= 2 && tokensB.length >= 2) {
    best = Math.max(best, tokenSetSimilarity(tokensA, tokensB));
  }
  return best;
}

/** true/false si ambos tienen el dato; null si alguno no lo tiene (no se puede comparar). */
function sameValue(a: string | null, b: string | null, key: (value: string) => string = (v) => v): boolean | null {
  if (a === null || b === null) return null;
  return key(a) === key(b);
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

/** Compara dos contactos y explica el resultado (similitud de nombre, email, teléfono). */
export function compareContacts(a: NormalizedContactFields, b: NormalizedContactFields): ContactMatch {
  const name = nameSimilarity(a.normalizedName, b.normalizedName);
  const emailMatch = sameValue(a.normalizedEmail, b.normalizedEmail);
  const phoneMatch = sameValue(a.normalizedPhone, b.normalizedPhone, (phone) => phone.slice(-PHONE_SIGNIFICANT_DIGITS));

  let weighted = FIELD_WEIGHTS.name * name;
  let totalWeight = FIELD_WEIGHTS.name;
  if (emailMatch !== null) {
    weighted += emailMatch ? FIELD_WEIGHTS.email : 0;
    totalWeight += FIELD_WEIGHTS.email;
  }
  if (phoneMatch !== null) {
    weighted += phoneMatch ? FIELD_WEIGHTS.phone : 0;
    totalWeight += FIELD_WEIGHTS.phone;
  }

  const score = Math.max(
    weighted / totalWeight,
    emailMatch ? EMAIL_MATCH_FLOOR : 0,
    phoneMatch ? PHONE_MATCH_FLOOR : 0,
  );

  return { score: round(score), nameSimilarity: round(name), emailMatch, phoneMatch };
}
