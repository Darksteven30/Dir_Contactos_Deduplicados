import { pool } from './pool';
import { runMigrations } from './migrator';

// Ejecuta las migraciones pendientes: `npm run migrate`
async function main(): Promise<void> {
  try {
    const applied = await runMigrations(pool);
    if (applied.length === 0) {
      console.log('No hay migraciones pendientes.');
    } else {
      applied.forEach((name) => console.log(`Migración aplicada: ${name}`));
    }
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
