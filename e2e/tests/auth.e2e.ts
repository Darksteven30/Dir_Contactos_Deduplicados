import { expect } from 'chai';
import { config } from '../config';
import { AppHeader } from '../pages/AppHeader';
import { ContactsPage } from '../pages/ContactsPage';
import { LoginPage } from '../pages/LoginPage';
import { useBrowser } from '../support/browser';
import { resetDemoData } from '../support/data';

describe('Sesión (doble token, cookie HttpOnly y guards)', function () {
  const browser = useBrowser();

  before(() => resetDemoData());

  it('muestra un error con credenciales incorrectas y no deja entrar', async () => {
    const login = await new LoginPage(browser()).open();

    await login.login(config.demo.email, 'clave-equivocada');

    expect(await login.errorMessage()).to.contain('Email o contraseña incorrectos');
    expect(await login.currentPath()).to.match(/^\/login/);
  });

  it('inicia sesión y llega al directorio con los contactos de la cuenta', async () => {
    await new LoginPage(browser()).open().then((page) => page.loginAsDemo());

    const contacts = new ContactsPage(browser());
    await contacts.waitForTotal(config.demo.contacts);
  });

  it('al recargar la página sigue con la sesión iniciada (refresh token en cookie HttpOnly)', async () => {
    await new LoginPage(browser()).open().then((page) => page.loginAsDemo());

    // El access token vivía solo en memoria: al recargar se pierde y la app lo recupera con la cookie.
    await browser().navigate().refresh();

    const contacts = new ContactsPage(browser());
    await contacts.waitUntilLoaded();
    expect(await contacts.currentPath()).to.equal('/contactos');
  });

  it('el token de acceso no queda guardado en el navegador (localStorage / sessionStorage)', async () => {
    await new LoginPage(browser()).open().then((page) => page.loginAsDemo());

    const stored = await browser().executeScript<string>(
      'return JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })',
    );

    expect(stored).not.to.match(/eyJ[\w-]+\.[\w-]+/); // forma de un JWT
  });

  it('una página privada sin sesión manda al login y, al entrar, vuelve a esa página', async () => {
    const login = new LoginPage(browser());
    await browser().get(`${config.baseUrl}/duplicados`);

    await login.waitForPath('/login?redirect=');
    await login.login(config.demo.email, config.demo.password);

    await login.waitForPath('/duplicados');
  });

  it('al cerrar sesión ya no se puede volver a las páginas privadas', async () => {
    await new LoginPage(browser()).open().then((page) => page.loginAsDemo());

    await new AppHeader(browser()).logout();
    await browser().get(`${config.baseUrl}/contactos`);

    await new LoginPage(browser()).waitForPath('/login');
  });
});
