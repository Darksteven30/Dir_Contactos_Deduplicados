import { env } from '../config/env';
import { BcryptPasswordHasher } from '../shared/security/passwordHasher';
import { runMigrations } from './migrator';
import { pool } from './pool';
import { seedDatabase } from './seeder';
import { DEMO_PASSWORD, SEED_USERS } from './seeds/demoData';

// Carga los datos de prueba: `npm run seed`
async function main(): Promise<void> {
  try {
    // El seed borra y recrea contactos: nunca debe tocar datos reales.
    if (env.NODE_ENV === 'production') {
      throw new Error('El seed no se ejecuta con NODE_ENV=production.');
    }

    // Así funciona también sobre una base recién creada.
    await runMigrations(pool);

    const summary = await seedDatabase(pool, new BcryptPasswordHasher(), SEED_USERS);
    summary.forEach(({ email, contacts }) => console.log(`Usuario ${email}: ${contacts} contactos`));
    console.log(`Contraseña de los usuarios de prueba: ${DEMO_PASSWORD}`);
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
