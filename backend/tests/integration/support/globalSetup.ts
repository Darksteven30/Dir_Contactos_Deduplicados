import { createTestPool, recreateSchema } from './testDatabase';

// Se ejecuta una vez antes de todas las pruebas de integración: esquema recién creado.
export default async function setup(): Promise<void> {
  const pool = createTestPool();
  try {
    await recreateSchema(pool);
  } finally {
    await pool.end();
  }
}
