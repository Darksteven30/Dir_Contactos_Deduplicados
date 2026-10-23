import { BasePage, byTestId } from './BasePage';

export type Section = 'contacts' | 'duplicates' | 'account';

/** Componente compartido por todas las pantallas privadas (un "Page Object" de un componente). */
export class AppHeader extends BasePage {
  async goTo(section: Section): Promise<void> {
    await this.click(byTestId(`nav-${section}`));
  }

  async logout(): Promise<void> {
    await this.click(byTestId('logout'));
    await this.waitForPath('/login');
  }
}
