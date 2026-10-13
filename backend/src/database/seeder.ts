import type { Pool, PoolClient } from 'pg';
import type { ContactData } from '../modules/contacts/contact.entity';
import { normalizeContact } from '../modules/contacts/contact.normalizer';
import type { PasswordHasher } from '../shared/security/passwordHasher';
import type { SeedUser } from './seeds/demoData';

export interface SeedSummary {
  email: string;
  contacts: number;
}

/**
 * Carga los usuarios de prueba y reemplaza sus contactos.
 *
 * Es idempotente: si el usuario ya existe se actualizan su nombre y contraseña (se conserva
 * su rol) y se borran sus contactos antes de insertarlos de nuevo, así ejecutarlo varias veces
 * deja siempre el mismo resultado. Todo ocurre en una sola transacción.
 */
export async function seedDatabase(pool: Pool, hasher: PasswordHasher, users: SeedUser[]): Promise<SeedSummary[]> {
  // bcrypt es lento a propósito: se calcula antes de abrir la transacción.
  const prepared = await Promise.all(
    users.map(async (user) => ({ ...user, passwordHash: await hasher.hash(user.password) })),
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const summary: SeedSummary[] = [];
    for (const user of prepared) {
      const userId = await upsertUser(client, user.name, user.email, user.passwordHash);
      // ON DELETE CASCADE también limpia los pares descartados de esos contactos.
      await client.query('DELETE FROM contacts WHERE owner_id = $1', [userId]);
      for (const data of user.contacts) {
        await insertContact(client, userId, data);
      }
      summary.push({ email: user.email, contacts: user.contacts.length });
    }

    await client.query('COMMIT');
    return summary;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function upsertUser(client: PoolClient, name: string, email: string, passwordHash: string): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO users (name, email, password) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password = EXCLUDED.password
     RETURNING id`,
    [name, email, passwordHash],
  );
  const row = rows[0];
  if (!row) throw new Error(`No se pudo crear el usuario ${email}`);
  return row.id;
}

async function insertContact(client: PoolClient, ownerId: number, data: ContactData): Promise<void> {
  const record = normalizeContact(data);
  await client.query(
    `INSERT INTO contacts
       (owner_id, full_name, email, phone, company, notes, normalized_name, normalized_email, normalized_phone)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      ownerId,
      record.fullName,
      record.email,
      record.phone,
      record.company,
      record.notes,
      record.normalizedName,
      record.normalizedEmail,
      record.normalizedPhone,
    ],
  );
}
