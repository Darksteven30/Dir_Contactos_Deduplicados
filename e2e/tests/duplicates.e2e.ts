import { expect } from 'chai';
import { config } from '../config';
import { AppHeader } from '../pages/AppHeader';
import { ContactsPage } from '../pages/ContactsPage';
import { DuplicatesPage, MergeHistoryPage } from '../pages/DuplicatesPage';
import { LoginPage } from '../pages/LoginPage';
import { useBrowser } from '../support/browser';
import { resetDemoData } from '../support/data';

describe('Duplicados y fusión', function () {
  const browser = useBrowser();
  let duplicates: DuplicatesPage;

  beforeEach(async () => {
    resetDemoData();
    await new LoginPage(browser()).open().then((page) => page.loginAsDemo());
    duplicates = await new DuplicatesPage(browser()).open();
  });

  it('detecta los 8 grupos de duplicados de la demo y explica por qué se parecen', async () => {
    await duplicates.waitForGroupCount(config.demo.groups);

    expect(await duplicates.summary()).to.contain(`${config.demo.groups} grupos por revisar`);
    const diana = await duplicates.groupText('Diana Torres');
    expect(diana).to.contain('Diana Carolina Torres');
    expect(diana).to.contain('mismo teléfono');
  });

  it('"No son duplicados" quita el grupo y no vuelve a sugerirse', async () => {
    await duplicates.dismissGroupWith('Daniel Rojas');

    await duplicates.waitForGroupCount(config.demo.groups - 1);
    await browser().navigate().refresh();
    await duplicates.waitUntilLoaded();
    expect(await duplicates.hasGroupWith('Daniel Rojas')).to.equal(false);
  });

  it('fusiona un grupo eligiendo los datos, y se puede deshacer desde el historial', async () => {
    // Fusionar "Diana Torres" + "Diana Carolina Torres", eligiendo el nombre corto.
    const dialog = await duplicates.openMergeFor('Diana Torres');
    await dialog.chooseValue('Diana Torres');
    await dialog.confirm();
    await duplicates.waitForToast('Se fusionaron 2 contactos en Diana Torres');
    await duplicates.waitForGroupCount(config.demo.groups - 1);

    // En el directorio queda una sola Diana.
    await new AppHeader(browser()).goTo('contacts');
    const contacts = new ContactsPage(browser());
    await contacts.waitForTotal(config.demo.contacts - 1);
    await contacts.search('diana');
    expect(await contacts.visibleNames()).to.deep.equal(['Diana Torres']);

    // Deshacer desde el historial: vuelven los dos contactos.
    const history = await new MergeHistoryPage(browser()).open();
    expect(await history.latestMergeText()).to.contain('2 contactos fusionados');
    await history.undoLatest();
    await history.waitForToast('Fusión deshecha');
    await history.waitForLatestUndone();

    await contacts.open();
    await contacts.waitForTotal(config.demo.contacts);
  });
});
