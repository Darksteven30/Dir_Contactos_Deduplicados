import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),

  JWT_ACCESS_SECRET: z.string().min(32, 'Debe tener al menos 32 caracteres'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: z.stringbool().default(true),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Número de proxies delante de la app (p. ej. 1 en Render/Railway). 0 = conexión directa.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  TOKEN_CLEANUP_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variables de entorno inválidas:', z.flattenError(parsed.error).fieldErrors);
  console.error('Revisa tu archivo backend/.env (usa .env.example como guía).');
  process.exit(1);
}

export const env: Env = parsed.data;
