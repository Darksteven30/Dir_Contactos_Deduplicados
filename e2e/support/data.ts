import { spawnSync } from 'node:child_process';
import { BACKEND_DIR, databaseEnv } from './environment';

/**
 * Deja la cuenta demo exactamente como la crea `npm run seed`: 26 contactos y 8 grupos de
 * duplicados. Se llama antes de cada prueba que modifica datos, para que las pruebas sean
 * INDEPENDIENTES: el resultado de una nunca depende de lo que hizo la anterior.
 */
export function resetDemoData(): void {
  const result = spawnSync('npm run seed', {
    cwd: BACKEND_DIR,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, ...databaseEnv(), NODE_ENV: 'test' },
  });
  if (result.status !== 0) {
    throw new Error(`No se pudieron cargar los datos de prueba:\n${result.stderr || result.stdout}`);
  }
}
