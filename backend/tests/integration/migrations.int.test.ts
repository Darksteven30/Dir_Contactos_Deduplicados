import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/database/migrator';
import { createTestPool } from './support/testDatabase';

describe('migraciones (PostgreSQL real)', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('aplicó las 6 migraciones en orden, una sola vez', async () => {
    const { rows } = await pool.query<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version');

    expect(rows.map((r) => r.version)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(await runMigrations(pool)).toEqual([]);
  });

  it('instaló pg_trgm y el índice GIN de trigramas para la búsqueda difusa', async () => {
    const extension = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'");
    const index = await pool.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'contacts_normalized_name_trgm_idx'",
    );

    expect(extension.rowCount).toBe(1);
    expect(index.rows[0]?.indexdef).toMatch(/USING gin \(normalized_name gin_trgm_ops\)/);
  });

  it('dos procesos migrando a la vez no se pisan (advisory lock)', async () => {
    const other = createTestPool();
    try {
      await pool.query(
        `DROP TABLE contact_merges, contact_duplicate_dismissals, contacts, refresh_tokens, users, schema_migrations CASCADE`,
      );

      const [first, second] = await Promise.all([runMigrations(pool), runMigrations(other)]);

      // Uno aplica las 6 y el otro, al obtener el bloqueo, ya no encuentra nada pendiente.
      expect([...first, ...second]).toHaveLength(6);
      const { rows } = await pool.query('SELECT version FROM schema_migrations');
      expect(rows).toHaveLength(6);
    } finally {
      await other.end();
    }
  });
});
