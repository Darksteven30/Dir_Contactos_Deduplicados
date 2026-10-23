import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, '../..');
export const BACKEND_DIR = path.join(ROOT_DIR, 'backend');

/**
 * Base de datos de las pruebas E2E: E2E_DATABASE_URL (CI) o, en local, la base E2E_DB_NAME
 * (por defecto `contactos_test`) con el usuario y la contraseña de backend/.env.
 *
 * Las pruebas reemplazan los datos de la cuenta demo: nunca deben apuntar a la base de desarrollo.
 */
export function databaseEnv(): Record<string, string> {
  const url = process.env.E2E_DATABASE_URL;
  const name = url ? new URL(url).pathname.slice(1) : (process.env.E2E_DB_NAME ?? 'contactos_test');
  if (!/test/i.test(name)) {
    throw new Error(`La base "${name}" no parece de pruebas (su nombre debe contener "test"). Por seguridad no se usa.`);
  }
  return url ? { DATABASE_URL: url } : { DB_NAME: name };
}

export function assertAppIsBuilt(): void {
  const missing = ['backend/dist/server.js', 'frontend/dist/index.html'].filter(
    (file) => !existsSync(path.join(ROOT_DIR, file)),
  );
  if (missing.length > 0) {
    throw new Error(
      `Falta compilar la app (${missing.join(', ')}). Corre "npm run test:e2e" desde la raíz, que compila antes de probar.`,
    );
  }
}
