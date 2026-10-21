import type { Pool, PoolClient } from 'pg';

/**
 * Ejecuta `work` dentro de una transacción con una conexión dedicada del pool.
 * Si `work` termina bien se hace COMMIT; si lanza un error, ROLLBACK y se relanza.
 */
export async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
