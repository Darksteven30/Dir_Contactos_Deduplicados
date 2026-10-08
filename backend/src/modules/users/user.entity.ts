import type { Role } from '../../shared/security/roles';

// Representación pública del usuario (nunca expone el hash de la contraseña).
export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
}

// Uso interno de la capa de servicios (p. ej. login).
export interface UserWithPassword extends User {
  passwordHash: string;
}
