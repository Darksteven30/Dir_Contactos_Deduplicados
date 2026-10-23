import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    // Base de datos: o una cadena de conexión completa (la que entregan Neon, Render, Railway...)
    // o los datos por separado (instalación local con DBeaver). DATABASE_URL tiene prioridad.
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'Debe empezar por postgresql://')
      .optional(),
    DB_HOST: z.string().min(1).default('localhost'),
    DB_PORT: z.coerce.number().int().positive().default(5432),
    DB_NAME: z.string().min(1).optional(),
    DB_USER: z.string().min(1).optional(),
    DB_PASSWORD: z.string().optional(),

    JWT_ACCESS_SECRET: z.string().min(32, 'Debe tener al menos 32 caracteres'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    COOKIE_SECURE: z.stringbool().default(true),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    // Número de proxies delante de la app (1 en Render). 0 = conexión directa.
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    TOKEN_CLEANUP_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
    // Intentos de login/registro por IP cada 15 minutos. Solo las pruebas E2E lo suben.
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    // Encabezado con la IP real del usuario que pone el CDN (en Render, que va detrás de Cloudflare:
    // cf-connecting-ip). El rate limit cuenta por esa IP; sin él, por la IP que resuelve trust proxy.
    CLIENT_IP_HEADER: z.string().min(1).toLowerCase().optional(),

    // Carpeta del frontend compilado (Vue). Si existe, el backend lo sirve en el mismo dominio
    // que la API: así la cookie del refresh token (SameSite=Strict) funciona en producción.
    FRONTEND_DIST_DIR: z.string().min(1).optional(),
  })
  .refine((e) => e.DATABASE_URL || (e.DB_NAME && e.DB_USER && e.DB_PASSWORD !== undefined), {
    message: 'Define DATABASE_URL, o bien DB_NAME, DB_USER y DB_PASSWORD',
    path: ['DATABASE_URL'],
  });

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variables de entorno inválidas:', z.flattenError(parsed.error).fieldErrors);
  console.error('Revisa tu archivo backend/.env (usa .env.example como guía).');
  process.exit(1);
}

export const env: Env = parsed.data;
