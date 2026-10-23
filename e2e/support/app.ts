import { spawn, type ChildProcess } from 'node:child_process';
import { config } from '../config';
import { assertAppIsBuilt, BACKEND_DIR, databaseEnv } from './environment';

let app: ChildProcess | null = null;

/**
 * Levanta la app compilada (backend + frontend en el mismo servidor), igual que en producción,
 * pero contra la base de pruebas. Espera a que /health responda antes de seguir.
 */
export async function startApp(): Promise<void> {
  assertAppIsBuilt();

  app = spawn(process.execPath, ['dist/server.js'], {
    cwd: BACKEND_DIR,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env,
      ...databaseEnv(),
      NODE_ENV: 'production',
      PORT: String(config.port),
      LOG_LEVEL: 'warn',
      // En http://localhost no hay HTTPS: la cookie del refresh token no puede exigir Secure.
      COOKIE_SECURE: 'false',
      // Las pruebas inician sesión muchas veces seguidas: sin esto el rate limit respondería 429.
      AUTH_RATE_LIMIT_MAX: '10000',
    },
  });

  let stderr = '';
  app.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (app.exitCode !== null) throw new Error(`La app no pudo arrancar:\n${stderr}`);
    try {
      const res = await fetch(`${config.baseUrl}/health`);
      if (res.ok) return;
    } catch {
      // Todavía no escucha: se reintenta.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`La app no respondió en ${config.baseUrl}/health a tiempo.\n${stderr}`);
}

export async function stopApp(): Promise<void> {
  if (!app || app.exitCode !== null) return;
  const exited = new Promise((resolve) => app?.once('exit', resolve));
  app.kill();
  await exited;
}
