import type { Pool } from 'pg';
import type { Role } from '../../shared/security/roles';
import type { User, UserWithPassword } from './user.entity';

export interface NewUserData {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
}

export interface UserChanges {
  name: string;
  email: string;
}

// Contrato de persistencia: el servicio depende de esta interfaz, no de PostgreSQL.
export interface UserRepository {
  findAll(): Promise<User[]>;
  findById(id: number): Promise<User | null>;
  findByEmail(email: string): Promise<UserWithPassword | null>;
  create(data: NewUserData): Promise<User>;
  update(id: number, changes: UserChanges): Promise<User | null>;
  delete(id: number): Promise<boolean>;
}

interface UserRow {
  id: number;
  name: string;
  email: string;
  password: string;
  role: Role;
  created_at: Date;
}

const PUBLIC_COLUMNS = 'id, name, email, role, created_at';

function toUser(row: Omit<UserRow, 'password'>): User {
  return { id: row.id, name: row.name, email: row.email, role: row.role, createdAt: row.created_at };
}

export class PgUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async findAll(): Promise<User[]> {
    const { rows } = await this.pool.query<Omit<UserRow, 'password'>>(
      `SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY id`,
    );
    return rows.map(toUser);
  }

  async findById(id: number): Promise<User | null> {
    const { rows } = await this.pool.query<Omit<UserRow, 'password'>>(
      `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`,
      [id],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<UserWithPassword | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT ${PUBLIC_COLUMNS}, password FROM users WHERE email = $1`,
      [email],
    );
    const row = rows[0];
    return row ? { ...toUser(row), passwordHash: row.password } : null;
  }

  async create(data: NewUserData): Promise<User> {
    const { rows } = await this.pool.query<Omit<UserRow, 'password'>>(
      `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING ${PUBLIC_COLUMNS}`,
      [data.name, data.email, data.passwordHash, data.role],
    );
    const row = rows[0];
    if (!row) throw new Error('INSERT de usuario no devolvió filas');
    return toUser(row);
  }

  async update(id: number, changes: UserChanges): Promise<User | null> {
    const { rows } = await this.pool.query<Omit<UserRow, 'password'>>(
      `UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING ${PUBLIC_COLUMNS}`,
      [changes.name, changes.email, id],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async delete(id: number): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }
}
