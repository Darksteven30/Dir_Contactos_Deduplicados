import { z } from 'zod';
import { normalizeText } from './contact.normalizer';

const MIN_PHONE_DIGITS = 7;
const PHONE_PATTERN = /^\+?[\d\s().-]+$/;
const emailFormat = z.email();

// Campo opcional: acepta texto, vacío, null u omitido; lo vacío se guarda como null.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

const fullName = z
  .string()
  .trim()
  .min(1, 'El nombre es requerido')
  .max(150)
  .refine((value) => normalizeText(value).length > 0, 'El nombre debe contener letras o números');

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(150)
  .refine((value) => value === '' || emailFormat.safeParse(value).success, 'Email inválido')
  .nullish()
  .transform((value) => value || null);

const phone = z
  .string()
  .trim()
  .max(30)
  .refine(
    (value) => value === '' || (PHONE_PATTERN.test(value) && value.replace(/\D/g, '').length >= MIN_PHONE_DIGITS),
    `Teléfono inválido: solo dígitos, espacios, +, -, () y al menos ${MIN_PHONE_DIGITS} dígitos`,
  )
  .nullish()
  .transform((value) => value || null);

export const contactInputSchema = z.object({
  fullName,
  email,
  phone,
  company: optionalText(150),
  notes: optionalText(2000),
});

// PUT reemplaza el contacto completo y exige la versión leída (bloqueo optimista).
export const updateContactSchema = contactInputSchema.extend({
  version: z.number().int().positive(),
});

export const contactIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const listContactsQuerySchema = z.object(pagination);

export const searchContactsQuerySchema = z.object({
  q: z.string().trim().min(1, 'El texto de búsqueda es requerido').max(100),
  ...pagination,
});

export type ContactInputDto = z.infer<typeof contactInputSchema>;
export type UpdateContactDto = z.infer<typeof updateContactSchema>;
export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;
export type SearchContactsQuery = z.infer<typeof searchContactsQuerySchema>;
