import { BasePage, byTestId, fieldIn } from './BasePage';

export interface ContactFields {
  fullName?: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
}

/** Ventana modal para crear o editar un contacto (incluye el aviso de duplicados y el conflicto 409). */
export class ContactForm extends BasePage {
  async waitUntilOpen(): Promise<this> {
    await this.find(fieldIn('contact-fullName'));
    return this;
  }

  async fill(fields: ContactFields): Promise<void> {
    for (const [field, value] of Object.entries(fields)) {
      if (value !== undefined) await this.type(fieldIn(`contact-${field}`), value);
    }
  }

  async save(): Promise<void> {
    await this.click(byTestId('contact-submit'));
  }

  /** Espera el aviso amarillo de contactos parecidos y devuelve su texto. */
  async similarContactsWarning(): Promise<string> {
    return this.textOf(byTestId('similar-alert'));
  }

  async waitForConflict(): Promise<void> {
    await this.find(byTestId('contact-conflict'));
  }

  /** Filas de la tabla "Tu versión / Versión actual" (solo los campos que difieren). */
  async conflictRows(): Promise<string[]> {
    const rows = await this.driver.findElements(byTestId('conflict-row'));
    return Promise.all(rows.map((r) => r.getText()));
  }

  async useCurrentVersion(): Promise<void> {
    await this.click(byTestId('conflict-use-current'));
    await this.waitUntilOpen();
  }

  async keepMyChanges(): Promise<void> {
    await this.click(byTestId('conflict-overwrite'));
  }

  async fieldValue(field: keyof ContactFields): Promise<string> {
    return (await (await this.find(fieldIn(`contact-${field}`))).getAttribute('value')) ?? '';
  }
}
