import { z } from 'zod';
import { contactInputSchema, listContactsQuerySchema } from '../contacts/contact.schemas';

/** Puntaje mínimo por defecto para sugerir que dos contactos son la misma persona. */
export const DEFAULT_MIN_SCORE = 0.8;

const contactId = z.number().int().positive();

export const minScoreQuerySchema = z.object({
  minScore: z.coerce.number().min(0.5).max(1).default(DEFAULT_MIN_SCORE),
});

export const dismissPairSchema = z.object({
  contactIds: z
    .tuple([contactId, contactId])
    .refine(([a, b]) => a !== b, 'Deben ser dos contactos distintos'),
});

/** Máximo de duplicados que se pueden fusionar en un principal en una sola operación. */
export const MAX_MERGE_DUPLICATES = 20;

// Cada contacto va con la versión que leyó el cliente (bloqueo optimista).
const versionedContact = z.object({ id: contactId, version: z.number().int().positive() });

export const mergeContactsSchema = z
  .object({
    primary: versionedContact,
    duplicates: z.array(versionedContact).min(1).max(MAX_MERGE_DUPLICATES),
    // Valores finales elegidos por el usuario. Si se omite, se usa la combinación automática.
    contact: contactInputSchema.optional(),
  })
  .refine(
    ({ primary, duplicates }) => new Set([primary.id, ...duplicates.map((d) => d.id)]).size === duplicates.length + 1,
    'Los contactos a fusionar deben ser distintos entre sí',
  );

// Misma paginación (page, pageSize) que el listado de contactos.
export const mergeHistoryQuerySchema = listContactsQuerySchema;

export const mergeIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type MinScoreQuery = z.infer<typeof minScoreQuerySchema>;
export type DismissPairDto = z.infer<typeof dismissPairSchema>;
export type VersionedContactRef = z.infer<typeof versionedContact>;
export type MergeContactsDto = z.infer<typeof mergeContactsSchema>;
