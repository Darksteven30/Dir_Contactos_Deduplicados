import { z } from 'zod';

const name = z.string().trim().min(1, 'El nombre es requerido').max(100);
const email = z.email('Email inválido').trim().toLowerCase().max(150);
const password = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(72);

export const userIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createUserSchema = z.object({ name, email, password });

export const updateUserSchema = z.object({ name, email });

export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
