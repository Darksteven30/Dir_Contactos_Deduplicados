import { config } from '../config';
import { BasePage, byTestId, fieldIn } from './BasePage';

export class LoginPage extends BasePage {
  async open(): Promise<this> {
    await this.visit('/login');
    await this.waitUntilLoaded();
    return this;
  }

  async waitUntilLoaded(): Promise<void> {
    await this.find(byTestId('login-submit'));
  }

  async login(email: string, password: string): Promise<void> {
    await this.type(fieldIn('login-email'), email);
    await this.type(fieldIn('login-password'), password);
    await this.click(byTestId('login-submit'));
  }

  /** Atajo: entra con la cuenta demo y espera a llegar al directorio. */
  async loginAsDemo(): Promise<void> {
    await this.login(config.demo.email, config.demo.password);
    await this.waitForPath('/contactos');
  }

  async errorMessage(): Promise<string> {
    return this.textOf(byTestId('login-error'));
  }

  async sessionExpiredNotice(): Promise<string> {
    return this.textOf(byTestId('login-expired'));
  }
}
