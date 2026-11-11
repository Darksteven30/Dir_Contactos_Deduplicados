import { Pool, type PoolConfig } from 'pg';
import { env } from '../config/env';

// En la nube se usa la cadena de conexión (con `?sslmode=require`, la conexión va cifrada).
// En local, los datos por separado del .env.
const connection: PoolConfig = env.DATABASE_URL
  ? { connectionString: env.DATABASE_URL }
  : {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    };

// Límites de tiempo: si la base no responde (p. ej. Neon despertando o caído), la petición
// falla con un error en vez de quedarse colgada, y /health puede informar el problema.
const TIMEOUTS: PoolConfig = {
  // Espera máxima para obtener una conexión (abrir una nueva o tomar una libre del pool).
  connectionTimeoutMillis: 10_000,
  // Duración máxima de cada consulta en el servidor (incluye esperar un bloqueo FOR UPDATE).
  statement_timeout: 15_000,
};

export const pool = new Pool({ ...connection, ...TIMEOUTS });

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
});
