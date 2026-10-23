import 'dotenv/config';
import { Pool } from 'pg';
import { runMigrations } from '../../../src/database/migrator';

/**
 * Cadena de conexión de la base de pruebas: TEST_DATABASE_URL (la usa GitHub Actions) o, en local,
 * los mismos datos del .env con la base TEST_DB_NAME (por defecto `contactos_test`).
 */
export function testConnectionString(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;

  const { DB_HOST = 'localhost', DB_PORT = '5432', DB_USER, DB_PASSWORD = '' } = process.env;
  if (!DB_USER) {
    throw new Error('Define TEST_DATABASE_URL, o DB_USER y DB_PASSWORD en backend/.env, para las pruebas de integración');
  }
  const database = process.env.TEST_DB_NAME ?? 'contactos_test';
  return `postgresql://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST}:${DB_PORT}/${database}`;
}

// Seguro: estas pruebas BORRAN todas las tablas. Nunca deben correr contra una base de verdad.
function assertIsTestDatabase(connectionString: string): void {
  const database = new URL(connectionString).pathname.slice(1);
  if (!/test/i.test(database)) {
    throw new Error(`La base "${database}" no parece de pruebas (su nombre debe contener "test"). Por seguridad no se toca.`);
  }
}

export function createTestPool(): Pool {
  const connectionString = testConnectionString();
  assertIsTestDatabase(connectionString);
  return new Pool({ connectionString, max: 10 });
}

/** Deja la base vacía y vuelve a crear el esquema con las migraciones del proyecto. */
export async function recreateSchema(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  if (rows.length > 0) {
    const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
    await pool.query(`DROP TABLE IF EXISTS ${tables} CASCADE`);
  }
  await runMigrations(pool);
}

/** Borra los datos de todas las tablas (no el esquema) para que cada prueba empiece limpia. */
export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(
    `TRUNCATE users, refresh_tokens, contacts, contact_duplicate_dismissals, contact_merges
     RESTART IDENTITY CASCADE`,
  );
}
