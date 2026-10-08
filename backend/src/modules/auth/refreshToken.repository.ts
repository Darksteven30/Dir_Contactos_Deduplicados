import type { Pool } from 'pg';

export interface NewRefreshToken {
  userId: number;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface NextRefreshToken {
  tokenHash: string;
  expiresAt: Date;
}

export type BulkRevokeReason = 'logout_all' | 'reuse_detected';

export type RotationResult =
  | { status: 'rotated'; userId: number; familyId: string }
  /** El token ya había sido rotado y alguien lo volvió a presentar: posible robo. */
  | { status: 'reused'; userId: number }
  /** No existe, expiró o fue cerrado con logout. */
  | { status: 'invalid' };

export interface RefreshTokenRepository {
  create(token: NewRefreshToken): Promise<void>;
  /** Revoca el token presentado y crea su sucesor en la misma familia, de forma atómica. */
  rotate(presentedHash: string, next: NextRefreshToken, now: Date): Promise<RotationResult>;
  revokeFamilyOf(tokenHash: string, now: Date): Promise<void>;
  revokeAllForUser(userId: number, now: Date, reason: BulkRevokeReason): Promise<void>;
}

interface RefreshTokenRow {
  id: string;
  user_id: number;
  family_id: string;
  expires_at: Date;
  revoked_reason: string | null;
}

export class PgRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly pool: Pool) {}

  async create(token: NewRefreshToken): Promise<void> {
    await this.pool.query(
      `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
      [token.userId, token.familyId, token.tokenHash, token.expiresAt],
    );
  }

  async rotate(presentedHash: string, next: NextRefreshToken, now: Date): Promise<RotationResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Bloqueo pesimista: dos refresh simultáneos con el mismo token se serializan,
      // así solo uno puede rotarlo y el otro lo verá como reutilizado.
      const { rows } = await client.query<RefreshTokenRow>(
        `SELECT id, user_id, family_id, expires_at, revoked_reason
           FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
        [presentedHash],
      );
      const current = rows[0];

      let result: RotationResult;
      if (!current) {
        result = { status: 'invalid' };
      } else if (current.revoked_reason === 'rotated') {
        result = { status: 'reused', userId: current.user_id };
      } else if (current.revoked_reason || current.expires_at <= now) {
        result = { status: 'invalid' };
      } else {
        await client.query(
          `UPDATE refresh_tokens SET revoked_at = $1, revoked_reason = 'rotated' WHERE id = $2`,
          [now, current.id],
        );
        await client.query(
          `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
          [current.user_id, current.family_id, next.tokenHash, next.expiresAt],
        );
        result = { status: 'rotated', userId: current.user_id, familyId: current.family_id };
      }

      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async revokeFamilyOf(tokenHash: string, now: Date): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = $1, revoked_reason = 'logout'
        WHERE revoked_at IS NULL
          AND family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $2)`,
      [now, tokenHash],
    );
  }

  async revokeAllForUser(userId: number, now: Date, reason: BulkRevokeReason): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = $1, revoked_reason = $3
        WHERE user_id = $2 AND revoked_at IS NULL`,
      [now, userId, reason],
    );
  }
}
