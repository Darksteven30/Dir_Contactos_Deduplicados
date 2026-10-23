import { expect } from 'chai';
import { ContactsPage } from '../pages/ContactsPage';
import { LoginPage } from '../pages/LoginPage';
import { useBrowser, withExtraBrowser } from '../support/browser';
import { resetDemoData } from '../support/data';

/**
 * Bloqueo optimista visto desde la interfaz: dos personas (dos navegadores, dos sesiones) editan
 * el mismo contacto a la vez. La segunda en guardar no pisa los cambios de la primera: la app
 * le muestra las diferencias y la deja decidir.
 */
describe('Conflicto de edición entre dos sesiones', function () {
  const browser = useBrowser();

  beforeEach(() => resetDemoData());

  it('quien guarda segundo ve las diferencias y puede tomar la versión actual antes de guardar', async () => {
    await withExtraBrowser(async (other) => {
      // Las dos sesiones abren el mismo contacto (ambas tienen la versión 1).
      await new LoginPage(browser()).open().then((page) => page.loginAsDemo());
      await new LoginPage(other).open().then((page) => page.loginAsDemo());
      const first = new ContactsPage(browser());
      const second = new ContactsPage(other);
      await first.search('Laura Castillo');
      await second.search('Laura Castillo');
      const firstForm = await first.edit('Laura Castillo');
      const secondForm = await second.edit('Laura Castillo');

      // Sesión 1 guarda primero: el contacto pasa a la versión 2.
      await firstForm.fill({ email: 'laura.nueva@gmail.com' });
      await firstForm.save();
      await first.waitForToast('Cambios guardados');

      // Sesión 2 guarda con la versión 1, ya vieja: el servidor responde 409 y la app muestra el conflicto.
      await secondForm.fill({ company: 'Colombina S.A.' });
      await secondForm.save();
      await secondForm.waitForConflict();
      const differences = (await secondForm.conflictRows()).join('\n');
      expect(differences).to.contain('laura.nueva@gmail.com');
      expect(differences).to.contain('Colombina S.A.');

      // Toma la versión actual (con el email nuevo), vuelve a aplicar su cambio y guarda.
      await secondForm.useCurrentVersion();
      expect(await secondForm.fieldValue('email')).to.equal('laura.nueva@gmail.com');
      await secondForm.fill({ company: 'Colombina S.A.' });
      await secondForm.save();
      await second.waitForToast('Cambios guardados');

      // Al final se conservan los cambios de las dos sesiones.
      await first.open();
      await first.search('Laura Castillo');
      const row = await first.rowText('Laura Castillo');
      expect(row).to.contain('laura.nueva@gmail.com');
      expect(row).to.contain('Colombina S.A.');
    });
  });
});
