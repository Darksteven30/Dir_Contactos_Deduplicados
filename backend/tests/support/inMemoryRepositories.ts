import type {
  BulkRevokeReason,
  NewRefreshToken,
  NextRefreshToken,
  RefreshTokenRepository,
  RotationResult,
} from '../../src/modules/auth/refreshToken.repository';
import type { Contact, ScoredContact } from '../../src/modules/contacts/contact.entity';
import type {
  ContactRecord,
  ContactRepository,
  ContactSearchCriteria,
  ContactUpdateResult,
} from '../../src/modules/contacts/contact.repository';
import type {
  CandidatePairs,
  ComparableContact,
  DeduplicationRepository,
} from '../../src/modules/deduplication/deduplication.repository';
import type { NormalizedContactFields } from '../../src/modules/contacts/contact.repository';
import type { User, UserWithPassword } from '../../src/modules/users/user.entity';
import type { NewUserData, UserChanges, UserRepository } from '../../src/modules/users/user.repository';
import { pageOffset, type Page, type PageRequest } from '../../src/shared/http/pagination';
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

interface StoredContact extends Contact, ContactRecord {
  deletedAt: Date | null;
}

// La búsqueda difusa real (trigramas) vive en PostgreSQL; aquí se simula con coincidencia
// por subcadena, suficiente para probar las reglas del servicio.
export class InMemoryContactRepository implements ContactRepository {
  readonly rows: StoredContact[] = [];
  private nextId = 1;

  private static toPublic(row: StoredContact): Contact {
    return {
      id: row.id,
      ownerId: row.ownerId,
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      company: row.company,
      notes: row.notes,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private active(ownerId: number): StoredContact[] {
    return this.rows
      .filter((c) => c.ownerId === ownerId && !c.deletedAt)
      .sort((a, b) => a.normalizedName.localeCompare(b.normalizedName) || a.id - b.id);
  }

  private find(ownerId: number, id: number): StoredContact | undefined {
    return this.active(ownerId).find((c) => c.id === id);
  }

  private static paginate<T>(items: T[], page: PageRequest): Page<T> {
    const start = pageOffset(page);
    return { ...page, total: items.length, items: items.slice(start, start + page.pageSize) };
  }

  async findOwnerId(id: number): Promise<number | null> {
    return this.rows.find((c) => c.id === id && !c.deletedAt)?.ownerId ?? null;
  }

  async list(ownerId: number, page: PageRequest): Promise<Page<Contact>> {
    return InMemoryContactRepository.paginate(this.active(ownerId).map(InMemoryContactRepository.toPublic), page);
  }

  async search(ownerId: number, criteria: ContactSearchCriteria, page: PageRequest): Promise<Page<ScoredContact>> {
    const hits = this.active(ownerId)
      .filter(
        (c) =>
          (criteria.text !== '' && c.normalizedName.includes(criteria.text)) ||
          (c.normalizedEmail ?? '').includes(criteria.email) ||
          (criteria.phoneDigits !== null && (c.normalizedPhone ?? '').includes(criteria.phoneDigits)),
      )
      .map((c) => ({ ...InMemoryContactRepository.toPublic(c), score: 1 }));
    return InMemoryContactRepository.paginate(hits, page);
  }

  async findById(ownerId: number, id: number): Promise<Contact | null> {
    const row = this.find(ownerId, id);
    return row ? InMemoryContactRepository.toPublic(row) : null;
  }

  async create(ownerId: number, record: ContactRecord): Promise<Contact> {
    const now = new Date();
    const row: StoredContact = {
      ...record,
      id: this.nextId++,
      ownerId,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.rows.push(row);
    return InMemoryContactRepository.toPublic(row);
  }

  async update(
    ownerId: number,
    id: number,
    expectedVersion: number,
    record: ContactRecord,
  ): Promise<ContactUpdateResult> {
    const row = this.find(ownerId, id);
    if (!row) return { status: 'not_found' };
    if (row.version !== expectedVersion) {
      return { status: 'version_conflict', current: InMemoryContactRepository.toPublic(row) };
    }
    Object.assign(row, record, { version: row.version + 1, updatedAt: new Date() });
    return { status: 'updated', contact: InMemoryContactRepository.toPublic(row) };
  }

  async softDelete(ownerId: number, id: number): Promise<boolean> {
    const row = this.find(ownerId, id);
    if (!row) return false;
    row.deletedAt = new Date();
    row.version += 1;
    return true;
  }
}

// El blocking real (trigramas) vive en PostgreSQL; aquí todos los pares son candidatos,
// así el servicio decide solo con el puntaje.
export class InMemoryDeduplicationRepository implements DeduplicationRepository {
  readonly dismissed = new Set<string>();

  constructor(private readonly contacts: InMemoryContactRepository) {}

  private activeOf(ownerId: number): ComparableContact[] {
    return this.contacts.rows
      .filter((c) => c.ownerId === ownerId && !c.deletedAt)
      .map(({ deletedAt: _deletedAt, ...contact }) => contact);
  }

  async findCandidatePairs(ownerId: number): Promise<CandidatePairs> {
    const contacts = this.activeOf(ownerId);
    const pairs: Array<[number, number]> = [];
    for (const a of contacts) {
      for (const b of contacts) {
        if (a.id < b.id && !this.dismissed.has(`${a.id}-${b.id}`)) pairs.push([a.id, b.id]);
      }
    }
    return { contacts, pairs };
  }

  async findCandidatesFor(ownerId: number, _fields: NormalizedContactFields): Promise<ComparableContact[]> {
    return this.activeOf(ownerId);
  }

  async countOwned(ownerId: number, ids: number[]): Promise<number> {
    return this.activeOf(ownerId).filter((c) => ids.includes(c.id)).length;
  }

  async dismissPair(contactAId: number, contactBId: number): Promise<void> {
    this.dismissed.add(`${contactAId}-${contactBId}`);
  }
}

export const fakeHasher: PasswordHasher = {
  hash: async (plain) => `hashed:${plain}`,
  compare: async (plain, hash) => hash === `hashed:${plain}`,
};
