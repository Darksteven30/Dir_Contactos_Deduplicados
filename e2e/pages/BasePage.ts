import { By, error, Key, until, type Locator, type WebDriver, type WebElement } from 'selenium-webdriver';
import { config } from '../config';

/** Localizador por `data-testid`: el contrato estable entre la app y las pruebas. */
export const byTestId = (id: string): Locator => By.css(`[data-testid="${id}"]`);

/** El <input>/<textarea> dentro de un campo (el data-testid está en el contenedor del componente). */
export const fieldIn = (id: string): Locator =>
  By.css(`[data-testid="${id}"] input, [data-testid="${id}"] textarea`);

/**
 * Base de todos los Page Objects. Encapsula las ESPERAS EXPLÍCITAS: antes de usar un elemento se
 * espera a que exista, sea visible y esté habilitado. Nunca se usa `sleep`: una espera fija es
 * lenta cuando sobra y falla cuando falta (la causa típica de pruebas "inestables").
 */
export abstract class BasePage {
  constructor(protected readonly driver: WebDriver) {}

  protected async visit(path: string): Promise<void> {
    await this.driver.get(`${config.baseUrl}${path}`);
  }

  /** Espera a que el elemento exista y sea visible, y lo devuelve. */
  protected async find(locator: Locator, timeoutMs = config.waitTimeoutMs): Promise<WebElement> {
    const element = await this.driver.wait(until.elementLocated(locator), timeoutMs, `No apareció ${locator}`);
    await this.driver.wait(until.elementIsVisible(element), timeoutMs, `${locator} no se hizo visible`);
    return element;
  }

  protected async click(locator: Locator): Promise<void> {
    const element = await this.find(locator);
    await this.driver.wait(until.elementIsEnabled(element), config.waitTimeoutMs, `${locator} sigue deshabilitado`);
    await element.click();
  }

  /**
   * Escribe en un campo reemplazando su contenido. No se usa `clear()`: en apps con Vue/Angular/React
   * no siempre dispara el evento `input`, y el framework no se entera de que el campo quedó vacío.
   * Seleccionar todo y borrar con el teclado se comporta como un usuario real.
   */
  protected async type(locator: Locator, text: string): Promise<void> {
    const element = await this.find(locator);
    await element.sendKeys(Key.chord(Key.CONTROL, 'a'), Key.BACK_SPACE);
    if (text) await element.sendKeys(text);
  }

  protected async textOf(locator: Locator): Promise<string> {
    return (await this.find(locator)).getText();
  }

  protected async isPresent(locator: Locator): Promise<boolean> {
    return (await this.driver.findElements(locator)).length > 0;
  }

  /**
   * Espera hasta que `condition` sea verdadera. Tolera elementos "stale": cuando Vue vuelve a
   * pintar una lista, los elementos leídos antes dejan de existir en el DOM y Selenium lanza
   * StaleElementReferenceError; en ese caso simplemente se vuelve a intentar.
   */
  protected async waitUntil(condition: () => Promise<boolean>, message: string): Promise<void> {
    await this.driver.wait(
      async () => {
        try {
          return await condition();
        } catch (err) {
          if (err instanceof error.StaleElementReferenceError || err instanceof error.NoSuchElementError) return false;
          throw err;
        }
      },
      config.waitTimeoutMs,
      message,
    );
  }

  async currentPath(): Promise<string> {
    const url = new URL(await this.driver.getCurrentUrl());
    return url.pathname + url.search;
  }

  async waitForPath(path: string): Promise<void> {
    await this.waitUntil(async () => (await this.currentPath()).startsWith(path), `La URL no llegó a ${path}`);
  }

  /** Espera un aviso flotante (toast) que contenga el texto. */
  async waitForToast(text: string): Promise<void> {
    await this.waitUntil(async () => {
      const toasts = await this.driver.findElements(byTestId('toast'));
      const texts = await Promise.all(toasts.map((toast) => toast.getText()));
      return texts.some((t) => t.includes(text));
    }, `No apareció el aviso "${text}"`);
  }
}
