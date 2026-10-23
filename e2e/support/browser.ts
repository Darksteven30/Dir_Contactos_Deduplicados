import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { WebDriver } from 'selenium-webdriver';
import { createDriver } from './driver';
import { ROOT_DIR } from './environment';

const SCREENSHOTS_DIR = path.join(ROOT_DIR, 'e2e', 'reports', 'screenshots');

/**
 * Registra en el `describe` actual un navegador nuevo por prueba:
 * - beforeEach: abre un navegador limpio (cada prueba empieza sin sesión ni cookies).
 * - afterEach: si la prueba falló, guarda una captura de pantalla con su nombre, y cierra el navegador.
 *
 * Uso:  const browser = useBrowser();   ...   await browser().get(url)
 */
export function useBrowser(): () => WebDriver {
  let driver: WebDriver | undefined;

  beforeEach(async function () {
    driver = await createDriver();
  });

  afterEach(async function () {
    if (!driver) return;
    try {
      if (this.currentTest?.state === 'failed') await saveScreenshot(driver, this.currentTest.fullTitle());
    } finally {
      await driver.quit();
      driver = undefined;
    }
  });

  return () => {
    if (!driver) throw new Error('El navegador solo existe dentro de una prueba (it)');
    return driver;
  };
}

/** Abre navegadores adicionales dentro de una prueba (p. ej. dos sesiones a la vez) y los cierra al final. */
export async function withExtraBrowser<T>(work: (driver: WebDriver) => Promise<T>): Promise<T> {
  const driver = await createDriver();
  try {
    return await work(driver);
  } finally {
    await driver.quit();
  }
}

export async function saveScreenshot(driver: WebDriver, title: string): Promise<string> {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const file = path.join(SCREENSHOTS_DIR, `${title.replace(/[^\w\-áéíóúñ ]+/gi, '').slice(0, 120)}.png`);
  writeFileSync(file, await driver.takeScreenshot(), 'base64');
  return file;
}
