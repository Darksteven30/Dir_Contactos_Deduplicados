import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';

/**
 * Migraciones versionadas.
 *
 * Cada archivo de `backend/migrations` con formato `NNN_descripcion.sql` es una versión.
 * Se aplican en orden, una sola vez, cada una dentro de su propia transacción, y se
 * registran en la tabla `schema_migrations`. Nunca se edita una migración ya aplicada:
 * cualquier cambio de esquema se hace con un archivo nuevo.
 */

export const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

// Clave arbitraria para el advisory lock: evita que dos procesos migren a la vez.
const MIGRATION_LOCK_KEY = 726_354_001;

const MIGRATION_FILE_PATTERN = /^(\d+)_[\w-]+\.sql$/;

interface MigrationFile {
  version: number;
  name: string;
  filePath: string;
}

async function loadMigrationFiles(dir: string): Promise<MigrationFile[]> {
  const files = await readdir(dir);
  const migrations: MigrationFile[] = [];

  for (const name of files) {
    const match = MIGRATION_FILE_PATTERN.exec(name);
    if (!match?.[1]) continue;
    migrations.push({ version: Number(match[1]), name, filePath: path.join(dir, name) });
  }

  migrations.sort((a, b) => a.version - b.version);

  for (let i = 1; i < migrations.length; i++) {
    const prev = migrations[i - 1];
    const curr = migrations[i];
    if (prev && curr && prev.version === curr.version) {
      throw new Error(`Versión de migración duplicada: ${prev.name} y ${curr.name}`);
    }
  }

  return migrations;
}

export async function runMigrations(pool: Pool, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    INTEGER PRIMARY KEY,
        name       VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await client.query<{ version: number }>('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(rows.map((r) => r.version));

    for (const migration of await loadMigrationFiles(dir)) {
      if (appliedVersions.has(migration.version)) continue;

      const sql = await readFile(migration.filePath, 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [
          migration.version,
          migration.name,
        ]);
        await client.query('COMMIT');
        applied.push(migration.name);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Falló la migración ${migration.name}: ${(err as Error).message}`, { cause: err });
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    client.release();
  }

  return applied;
}
