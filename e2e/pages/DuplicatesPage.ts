import { By, type Locator } from 'selenium-webdriver';
import { BasePage, byTestId } from './BasePage';

/**
 * XPath: "la tarjeta de grupo que CONTIENE un contacto con este nombre". Es un caso donde XPath
 * aporta algo que el CSS clásico no tenía: subir del hijo al padre (`[.//...]`).
 * (En CSS moderno se puede con `:has()`, pero XPath sigue siendo muy usado en entrevistas.)
 */
const group = (name: string): Locator =>
  By.xpath(`//article[@data-testid="duplicate-group"][.//li[@data-testid="group-contact" and @data-name="${name}"]]`);
const inGroup = (name: string, testId: string): Locator =>
  By.xpath(
    `//article[@data-testid="duplicate-group"][.//li[@data-testid="group-contact" and @data-name="${name}"]]//*[@data-testid="${testId}"]`,
  );

export class DuplicatesPage extends BasePage {
  async open(): Promise<this> {
    await this.visit('/duplicados');
    await this.waitUntilLoaded();
    return this;
  }

  /** Cargó cuando se ve el resumen ("8 grupos por revisar...") o el estado "directorio limpio". */
  async waitUntilLoaded(): Promise<void> {
    await this.waitUntil(
      async () =>
        (await this.isPresent(byTestId('duplicate-group'))) || (await this.isPresent(byTestId('duplicates-clean'))),
      'No cargaron los grupos de duplicados',
    );
  }

  async groupCount(): Promise<number> {
    return (await this.driver.findElements(byTestId('duplicate-group'))).length;
  }

  async waitForGroupCount(count: number): Promise<void> {
    await this.waitUntil(async () => (await this.groupCount()) === count, `No quedaron ${count} grupos`);
  }

  async summary(): Promise<string> {
    return this.textOf(byTestId('duplicates-summary'));
  }

  async hasGroupWith(name: string): Promise<boolean> {
    return this.isPresent(group(name));
  }

  async groupText(name: string): Promise<string> {
    return this.textOf(group(name));
  }

  async dismissGroupWith(name: string): Promise<void> {
    await this.click(inGroup(name, 'group-dismiss'));
  }

  async openMergeFor(name: string): Promise<MergeDialog> {
    await this.click(inGroup(name, 'group-merge'));
    return new MergeDialog(this.driver).waitUntilOpen();
  }
}

export class MergeDialog extends BasePage {
  async waitUntilOpen(): Promise<this> {
    await this.find(byTestId('merge-submit'));
    return this;
  }

  async choosePrimary(name: string): Promise<void> {
    await this.click(By.css(`[data-testid="merge-primary-option"][data-name="${name}"]`));
  }

  /** Elige, con un clic, uno de los valores que tiene el grupo para un campo (p. ej. un nombre o un email). */
  async chooseValue(value: string): Promise<void> {
    await this.click(By.xpath(`//button[@data-testid="merge-choice" and normalize-space()="${value}"]`));
  }

  async confirm(): Promise<void> {
    await this.click(byTestId('merge-submit'));
  }
}

export class MergeHistoryPage extends BasePage {
  async open(): Promise<this> {
    await this.visit('/duplicados/historial');
    await this.find(byTestId('merge-item'));
    return this;
  }

  async latestMergeText(): Promise<string> {
    return this.textOf(byTestId('merge-item'));
  }

  /** Deshace la fusión más reciente (la primera de la lista). */
  async undoLatest(): Promise<void> {
    await this.click(By.css('[data-testid="merge-item"]:first-child [data-testid="merge-undo"]'));
  }

  async waitForLatestUndone(): Promise<void> {
    await this.find(By.css('[data-testid="merge-item"]:first-child [data-testid="merge-undone"]'));
  }
}
