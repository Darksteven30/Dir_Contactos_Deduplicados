import { Pool, type PoolConfig } from 'pg';
import { env } from '../config/env';

// En la nube se usa la cadena de conexión (con `?sslmode=require`, la conexión va cifrada).
// En local, los datos por separado del .env.
const config: PoolConfig = env.DATABASE_URL
  ? { connectionString: env.DATABASE_URL }
  : {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    };

export const pool = new Pool(config);

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
});
