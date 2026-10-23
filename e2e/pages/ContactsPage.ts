import { By, type Locator } from 'selenium-webdriver';
import { BasePage, byTestId } from './BasePage';
import { ContactForm } from './ContactForm';

const row = (name: string): Locator => By.css(`[data-testid="contact-row"][data-name="${name}"]`);
const inRow = (name: string, testId: string): Locator =>
  By.css(`[data-testid="contact-row"][data-name="${name}"] [data-testid="${testId}"]`);

export class ContactsPage extends BasePage {
  async open(): Promise<this> {
    await this.visit('/contactos');
    await this.waitUntilLoaded();
    return this;
  }

  async waitUntilLoaded(): Promise<void> {
    await this.find(byTestId('contacts-summary'));
  }

  /** "26 contactos en tu directorio", "3 contactos para «jose peres»"... */
  async summary(): Promise<string> {
    return this.textOf(byTestId('contacts-summary'));
  }

  async waitForTotal(total: number): Promise<void> {
    await this.waitUntil(
      async () => (await this.summary()).startsWith(`${total} contacto`),
      `El total no llegó a ${total}`,
    );
  }

  /** Escribe la búsqueda y espera a que la lista muestre sus resultados (la app espera 300 ms al teclear). */
  async search(text: string): Promise<void> {
    await this.type(byTestId('contacts-search'), text);
    await this.waitUntil(async () => (await this.summary()).includes(`«${text}»`), `No se aplicó la búsqueda "${text}"`);
  }

  async visibleNames(): Promise<string[]> {
    const rows = await this.driver.findElements(byTestId('contact-row'));
    return Promise.all(rows.map(async (r) => (await r.getAttribute('data-name')) ?? ''));
  }

  async rowText(name: string): Promise<string> {
    return this.textOf(row(name));
  }

  async scoreOf(name: string): Promise<string> {
    return this.textOf(inRow(name, 'contact-score'));
  }

  async waitForRow(name: string): Promise<void> {
    await this.find(row(name));
  }

  async waitForRowToDisappear(name: string): Promise<void> {
    await this.waitUntil(async () => !(await this.isPresent(row(name))), `"${name}" sigue en la lista`);
  }

  async openNewContact(): Promise<ContactForm> {
    await this.click(byTestId('contacts-new'));
    return new ContactForm(this.driver).waitUntilOpen();
  }

  async edit(name: string): Promise<ContactForm> {
    await this.click(inRow(name, 'contact-edit'));
    return new ContactForm(this.driver).waitUntilOpen();
  }

  async delete(name: string): Promise<void> {
    await this.click(inRow(name, 'contact-delete'));
    await this.click(byTestId('delete-confirm'));
  }
}
