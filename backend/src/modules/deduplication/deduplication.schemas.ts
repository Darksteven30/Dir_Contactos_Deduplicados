import { z } from 'zod';

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

export type MinScoreQuery = z.infer<typeof minScoreQuerySchema>;
export type DismissPairDto = z.infer<typeof dismissPairSchema>;
