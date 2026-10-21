import { createHash, randomBytes, randomUUID } from 'node:crypto';

/**
 * Tokens opacos (sin información dentro) para el refresh token.
 * Al cliente se le entrega el valor en claro; en base de datos solo se guarda su hash,
 * así una filtración de la tabla no permite suplantar sesiones.
 */
export function generateOpaqueToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateFamilyId(): string {
  return randomUUID();
}
