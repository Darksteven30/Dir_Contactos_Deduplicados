import { config } from '../config';
import { startApp, stopApp } from './app';

/**
 * "Global fixtures" de Mocha: se ejecutan una sola vez, antes y después de TODAS las pruebas.
 * Levantan la app compilada contra la base de pruebas. Si se define E2E_BASE_URL (por ejemplo,
 * la app ya desplegada), no se levanta nada y se prueba esa URL.
 */
export async function mochaGlobalSetup(): Promise<void> {
  if (process.env.E2E_BASE_URL) return;
  await startApp();
  console.log(`App de pruebas en ${config.baseUrl} (navegador: ${config.browser}${config.headless ? ', headless' : ''})`);
}

export async function mochaGlobalTeardown(): Promise<void> {
  await stopApp();
}
