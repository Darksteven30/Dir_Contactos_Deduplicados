import { createApp } from './app';
import { env } from './config/env';
import { runMigrations } from './database/migrator';
import { pool } from './database/pool';

async function start(): Promise<void> {
  try {
    const applied = await runMigrations(pool);
    applied.forEach((name) => console.log(`Migración aplicada: ${name}`));

    const app = createApp({ pool, port: env.PORT });
    app.listen(env.PORT, () => {
      console.log(`Servidor en http://localhost:${env.PORT}`);
      console.log(`Swagger en  http://localhost:${env.PORT}/api-docs`);
    });
  } catch (err) {
    console.error('Error al iniciar:', (err as Error).message);
    await pool.end();
    process.exit(1);
  }
}

void start();
