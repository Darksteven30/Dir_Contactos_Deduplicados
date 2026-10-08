import { z } from 'zod';
import { ROLES } from '../../shared/security/roles';

export const name = z.string().trim().min(1, 'El nombre es requerido').max(100);
export const email = z.email('Email inválido').trim().toLowerCase().max(150);
export const password = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(72);

export const userIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Alta de usuarios por un administrador (permite elegir rol). El registro público está en auth.
export const createUserSchema = z.object({ name, email, password, role: z.enum(ROLES).default('user') });

export const updateUserSchema = z.object({ name, email });

export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
