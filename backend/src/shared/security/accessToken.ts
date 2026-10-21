import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { ROLES, type Role } from './roles';

// Identidad del usuario autenticado, disponible en req.auth tras el middleware authenticate.
export interface AuthContext {
  userId: number;
  role: Role;
}

export interface AccessTokenService {
  readonly ttlSeconds: number;
  sign(context: AuthContext): string;
  /** Devuelve null si el token es inválido, está manipulado o expiró. */
  verify(token: string): AuthContext | null;
}

const payloadSchema = z.object({
  sub: z.string().regex(/^\d+$/),
  role: z.enum(ROLES),
});

const ALGORITHM = 'HS256';

export class JwtAccessTokenService implements AccessTokenService {
  constructor(
    private readonly secret: string,
    readonly ttlSeconds: number,
  ) {}

  sign({ userId, role }: AuthContext): string {
    return jwt.sign({ role }, this.secret, {
      algorithm: ALGORITHM,
      subject: String(userId),
      expiresIn: this.ttlSeconds,
    });
  }

  verify(token: string): AuthContext | null {
    try {
      // Se fija el algoritmo para evitar ataques de confusión de algoritmo (p. ej. "none").
      const decoded = jwt.verify(token, this.secret, { algorithms: [ALGORITHM] });
      const payload = payloadSchema.safeParse(decoded);
      if (!payload.success) return null;
      return { userId: Number(payload.data.sub), role: payload.data.role };
    } catch {
      return null;
    }
  }
}
