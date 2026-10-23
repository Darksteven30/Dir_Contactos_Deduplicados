import { expect } from 'chai';
import { config } from '../config';
import { ContactsPage } from '../pages/ContactsPage';
import { LoginPage } from '../pages/LoginPage';
import { useBrowser } from '../support/browser';
import { resetDemoData } from '../support/data';

describe('Contactos', function () {
  const browser = useBrowser();
  let contacts: ContactsPage;

  // Cada prueba empieza con los mismos 26 contactos de la demo: así son independientes entre sí.
  beforeEach(async () => {
    resetDemoData();
    await new LoginPage(browser()).open().then((page) => page.loginAsDemo());
    contacts = new ContactsPage(browser());
    await contacts.waitForTotal(config.demo.contacts);
  });

  it('la búsqueda difusa encuentra contactos aunque se escriban con errores', async () => {
    await contacts.search('jose peres');

    const names = await contacts.visibleNames();
    expect(names).to.include.members(['José Pérez', 'jose perez', 'JOSÉ PÉREZ']);
    expect(await contacts.scoreOf('José Pérez')).to.match(/^\d+%$/);
  });

  it('la búsqueda queda en la URL: se conserva al recargar la página', async () => {
    await contacts.search('diana');

    await browser().navigate().refresh();

    await contacts.waitUntilLoaded();
    expect(await contacts.currentPath()).to.contain('q=diana');
    expect(await contacts.summary()).to.contain('«diana»');
  });

  it('al crear un contacto avisa si ya existe alguien parecido, y se puede guardar igual', async () => {
    const form = await contacts.openNewContact();

    await form.fill({ fullName: 'Diana Torres' });
    const warning = await form.similarContactsWarning();
    expect(warning).to.contain('Diana Carolina Torres');

    await form.fill({ fullName: 'Valeria Prueba Selenium', email: 'valeria@e2e.test' });
    await form.save();

    await contacts.waitForToast('Contacto creado');
    await contacts.waitForTotal(config.demo.contacts + 1);
    await contacts.search('valeria');
    await contacts.waitForRow('Valeria Prueba Selenium');
  });

  it('valida los campos antes de enviar y muestra los errores junto a cada campo', async () => {
    const form = await contacts.openNewContact();

    await form.fill({ fullName: 'Sin email válido', email: 'esto-no-es-un-email' });
    await form.save();

    const page = await browser().getPageSource();
    expect(page).to.contain('Email inválido');
    expect(await contacts.summary()).to.contain(`${config.demo.contacts} contactos`);
  });

  // La lista está paginada (10 por página, en orden alfabético): igual que haría una persona,
  // primero se busca el contacto y después se actúa sobre él.
  it('edita un contacto y la lista muestra el cambio', async () => {
    await contacts.search('Felipe Moreno');
    const form = await contacts.edit('Felipe Moreno');

    await form.fill({ company: 'Universidad Santiago de Cali' });
    await form.save();

    await contacts.waitForToast('Cambios guardados');
    expect(await contacts.rowText('Felipe Moreno')).to.contain('Universidad Santiago de Cali');
  });

  it('elimina un contacto tras confirmar', async () => {
    await contacts.search('Santiago Herrera');
    await contacts.delete('Santiago Herrera');

    await contacts.waitForToast('Se eliminó a Santiago Herrera');
    await contacts.waitForRowToDisappear('Santiago Herrera');
    await contacts.open();
    await contacts.waitForTotal(config.demo.contacts - 1);
  });
});
