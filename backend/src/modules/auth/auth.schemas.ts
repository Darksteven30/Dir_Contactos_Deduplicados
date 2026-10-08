import { z } from 'zod';
import { email, name, password } from '../users/user.schemas';

export const registerSchema = z.object({ name, email, password });

export const loginSchema = z.object({
  email,
  // En login no se aplican reglas de longitud: solo se compara con el hash guardado.
  password: z.string().min(1, 'La contraseña es requerida').max(72),
});

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
