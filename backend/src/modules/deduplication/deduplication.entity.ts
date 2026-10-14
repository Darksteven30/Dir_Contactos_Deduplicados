import type { Contact, ContactData } from '../contacts/contact.entity';

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
  /** Resultado de fusionar el grupo con el principal sugerido (combinación automática). */
  mergePreview: ContactData;
  contacts: Contact[];
  pairs: DuplicatePair[];
}

// Contacto tal como estaba justo antes de una fusión.
export interface MergedContactSnapshot extends ContactData {
  id: number;
}

// Registro del historial de fusiones.
export interface ContactMerge {
  id: number;
  primaryContactId: number;
  mergedContactIds: number[];
  /** Estado de todos los contactos (principal incluido) antes de fusionar. */
  before: MergedContactSnapshot[];
  createdAt: Date;
  /** null mientras la fusión siga vigente. */
  undoneAt: Date | null;
}

export interface MergeResult {
  merge: ContactMerge;
  /** Contacto principal con los datos combinados. */
  contact: Contact;
}

// Contacto existente parecido a uno que se está por crear.
export interface SimilarContact {
  contact: Contact;
  match: ContactMatch;
}
