import type {
  BulkRevokeReason,
  NewRefreshToken,
  NextRefreshToken,
  RefreshTokenRepository,
  RotationResult,
} from '../../src/modules/auth/refreshToken.repository';
import type { User, UserWithPassword } from '../../src/modules/users/user.entity';
import type { NewUserData, UserChanges, UserRepository } from '../../src/modules/users/user.repository';
import type { PasswordHasher } from '../../src/shared/security/passwordHasher';

// Dobles de prueba: implementan los mismos contratos que los repositorios de PostgreSQL.

export class InMemoryUserRepository implements UserRepository {
  private rows: UserWithPassword[] = [];
  private nextId = 1;

  private static toPublic({ passwordHash: _hash, ...user }: UserWithPassword): User {
    return user;
  }

  async findAll(): Promise<User[]> {
    return this.rows.map(InMemoryUserRepository.toPublic);
  }

  async findById(id: number): Promise<User | null> {
    const row = this.rows.find((u) => u.id === id);
    return row ? InMemoryUserRepository.toPublic(row) : null;
  }

  async findByEmail(email: string): Promise<UserWithPassword | null> {
    return this.rows.find((u) => u.email === email) ?? null;
  }

  async create(data: NewUserData): Promise<User> {
    const row: UserWithPassword = { id: this.nextId++, createdAt: new Date(), ...data };
    this.rows.push(row);
    return InMemoryUserRepository.toPublic(row);
  }

  async update(id: number, changes: UserChanges): Promise<User | null> {
    const row = this.rows.find((u) => u.id === id);
    if (!row) return null;
    Object.assign(row, changes);
    return InMemoryUserRepository.toPublic(row);
  }

  async delete(id: number): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((u) => u.id !== id);
    return this.rows.length < before;
  }
}

interface StoredRefreshToken extends NewRefreshToken {
  revokedAt: Date | null;
  revokedReason: string | null;
}

export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  readonly tokens: StoredRefreshToken[] = [];

  async create(token: NewRefreshToken): Promise<void> {
    this.tokens.push({ ...token, revokedAt: null, revokedReason: null });
  }

  async rotate(presentedHash: string, next: NextRefreshToken, now: Date): Promise<RotationResult> {
    const current = this.tokens.find((t) => t.tokenHash === presentedHash);
    if (!current) return { status: 'invalid' };
    if (current.revokedReason === 'rotated') return { status: 'reused', userId: current.userId };
    if (current.revokedReason || current.expiresAt <= now) return { status: 'invalid' };

    this.revoke(current, now, 'rotated');
    this.tokens.push({
      userId: current.userId,
      familyId: current.familyId,
      ...next,
      revokedAt: null,
      revokedReason: null,
    });
    return { status: 'rotated', userId: current.userId, familyId: current.familyId };
  }

  async revokeFamilyOf(tokenHash: string, now: Date): Promise<void> {
    const familyId = this.tokens.find((t) => t.tokenHash === tokenHash)?.familyId;
    for (const t of this.tokens) {
      if (t.familyId === familyId && !t.revokedAt) this.revoke(t, now, 'logout');
    }
  }

  async revokeAllForUser(userId: number, now: Date, reason: BulkRevokeReason): Promise<void> {
    for (const t of this.tokens) {
      if (t.userId === userId && !t.revokedAt) this.revoke(t, now, reason);
    }
  }

  private revoke(token: StoredRefreshToken, now: Date, reason: string): void {
    token.revokedAt = now;
    token.revokedReason = reason;
  }

  activeFor(userId: number): StoredRefreshToken[] {
    return this.tokens.filter((t) => t.userId === userId && !t.revokedAt);
  }
}

export const fakeHasher: PasswordHasher = {
  hash: async (plain) => `hashed:${plain}`,
  compare: async (plain, hash) => hash === `hashed:${plain}`,
};
