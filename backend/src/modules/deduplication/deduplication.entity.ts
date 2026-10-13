import type { Contact } from '../contacts/contact.entity';

// Resultado de comparar dos contactos, con el detalle que explica el puntaje.
export interface ContactMatch {
  /** Probabilidad de que sean la misma persona, de 0 a 1. */
  score: number;
  /** Similitud de los nombres normalizados (Levenshtein), de 0 a 1. */
  nameSimilarity: number;
  /** null si alguno de los dos no tiene email (no se pudo comparar). */
  emailMatch: boolean | null;
  /** null si alguno de los dos no tiene teléfono (no se pudo comparar). */
  phoneMatch: boolean | null;
}

export interface DuplicatePair extends ContactMatch {
  contactIds: [number, number];
}

// Contactos que probablemente son la misma persona (agrupados de forma transitiva).
export interface DuplicateGroup {
  /** Mayor puntaje entre los pares del grupo. */
  score: number;
  /** Contacto sugerido como principal para la fusión: el más completo (y el más antiguo si empatan). */
  suggestedPrimaryId: number;
  contacts: Contact[];
  pairs: DuplicatePair[];
}

// Contacto existente parecido a uno que se está por crear.
export interface SimilarContact {
  contact: Contact;
  match: ContactMatch;
}
