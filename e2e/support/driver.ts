import { Builder, type WebDriver } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import edge from 'selenium-webdriver/edge.js';
import { config } from '../config';

// Opciones comunes a Chrome y Edge (los dos son Chromium).
const ARGS = ['--window-size=1366,900', '--lang=es-CO', '--disable-search-engine-choice-screen'];
// Sin el gestor de contraseñas: su aviso de "contraseña filtrada" (demo12345) taparía la página.
const PREFS = {
  credentials_enable_service: false,
  'profile.password_manager_enabled': false,
  'profile.password_manager_leak_detection': false,
};

/**
 * Crea un navegador nuevo y limpio (sin cookies ni sesión). Selenium Manager, incluido en
 * selenium-webdriver, descarga solo el driver que corresponde a la versión del navegador.
 */
export async function createDriver(): Promise<WebDriver> {
  const args = config.headless ? [...ARGS, '--headless=new'] : ARGS;

  if (config.browser === 'edge') {
    const options = new edge.Options();
    options.addArguments(...args);
    options.setUserPreferences(PREFS);
    return new Builder().forBrowser('MicrosoftEdge').setEdgeOptions(options).build();
  }
  const options = new chrome.Options();
  options.addArguments(...args);
  options.setUserPreferences(PREFS);
  return new Builder().forBrowser('chrome').setChromeOptions(options).build();
}
