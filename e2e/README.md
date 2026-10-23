# Pruebas E2E con Selenium WebDriver

Pruebas de **extremo a extremo** (*end-to-end*): un navegador real, controlado por código, usa la aplicación como lo haría una persona (escribe, hace clic, recarga) y verifica lo que ve en pantalla.

**Stack:** [Selenium WebDriver](https://www.selenium.dev/documentation/webdriver/) (`selenium-webdriver`) · [Mocha](https://mochajs.org/) (ejecutor) · [Chai](https://www.chaijs.com/) (aserciones `expect`) · [Mochawesome](https://github.com/adamgruber/mochawesome) (reporte HTML) · TypeScript.

## Cómo ejecutarlas

Requisitos: PostgreSQL con la base `contactos_test` (la misma de las pruebas de integración) y Chrome instalado.

```bash
npm run install:all        # una vez: instala raíz, backend, frontend y e2e
npm run test:e2e           # desde la raíz: compila la app y corre las pruebas
```

`npm run test:e2e` compila frontend y backend, levanta la app en `http://localhost:4300` contra `contactos_test`, abre Chrome **visible** (lo verás trabajar solo), corre las pruebas y apaga todo al terminar.

| Variable | Para qué |
|---|---|
| `HEADLESS=true` | Sin ventana (así corre en GitHub Actions) |
| `E2E_BROWSER=edge` | Usar Microsoft Edge en lugar de Chrome |
| `E2E_BASE_URL=https://...` | Probar una app ya levantada o desplegada (no levanta nada) |
| `E2E_DB_NAME` / `E2E_DATABASE_URL` | Otra base de pruebas (su nombre debe contener "test") |

En Git Bash, por ejemplo: `HEADLESS=true npm test --prefix e2e`. Para correr un solo archivo: `npx mocha tests/auth.e2e.ts` dentro de `e2e/`.

**Resultado:** `e2e/reports/reporte-e2e.html` (ábrelo en el navegador). Si una prueba falla, en `e2e/reports/screenshots/` queda una captura de la pantalla en ese momento.

## Estructura

```
e2e/
├── config.ts              URL, navegador, tiempos de espera y la cuenta demo
├── support/               Infraestructura (no son pruebas)
│   ├── app.ts             Levanta la app compilada y espera a /health
│   ├── data.ts            resetDemoData(): deja la cuenta demo como nueva (npm run seed)
│   ├── driver.ts          Crea Chrome/Edge con sus opciones
│   ├── browser.ts         useBrowser(): un navegador nuevo por prueba + captura si falla
│   └── hooks.ts           Arranque y apagado global de la app
├── pages/                 PAGE OBJECTS: una clase por pantalla
│   ├── BasePage.ts        Esperas explícitas y acciones comunes
│   ├── LoginPage.ts  ContactsPage.ts  ContactForm.ts  DuplicatesPage.ts  AppHeader.ts
└── tests/                 Las pruebas: QUÉ se verifica, no CÓMO se encuentra cada botón
    ├── auth.e2e.ts        Sesión, recarga, rutas privadas, cerrar sesión
    ├── contacts.e2e.ts    Búsqueda difusa, crear con aviso de duplicados, validar, editar, eliminar
    ├── conflict.e2e.ts    Dos navegadores editan el mismo contacto (bloqueo optimista)
    └── duplicates.e2e.ts  Grupos, "no son duplicados", fusionar y deshacer
```

## Conceptos clave (lo que te preguntan en una entrevista de QA)

### 1. WebDriver
Es el protocolo estándar (W3C) para controlar un navegador. `selenium-webdriver` habla con un *driver* (`chromedriver`, `msedgedriver`) que controla el navegador. Desde Selenium 4.6, **Selenium Manager** descarga el driver correcto solo: no hay que instalarlo a mano.

### 2. Localizadores: preferir `data-testid`
| Localizador | Ejemplo | ¿Estable? |
|---|---|---|
| `data-testid` | `[data-testid="login-submit"]` | ✅ Es un contrato explícito con la app |
| id | `#email` | ✅ si es fijo (aquí los genera Vue: no sirven) |
| texto | `//button[normalize-space()="Fusionar"]` | ⚠️ Cambia con el idioma o la redacción |
| clases CSS | `.bg-brand-600` | ❌ Cambian con el diseño |
| XPath posicional | `//div[3]/ul/li[2]/button` | ❌ Se rompe con cualquier cambio |

En esta app se agregaron atributos `data-testid` a los elementos que usan las pruebas. XPath se usa solo donde aporta algo: por ejemplo, "la tarjeta que **contiene** a Diana Torres" (`//article[.//li[@data-name="Diana Torres"]]`, ver `DuplicatesPage.ts`).

### 3. Esperas explícitas (nunca `sleep`)
La página carga datos de forma asíncrona: el botón puede no existir todavía. `driver.wait(until.elementLocated(...))` espera **lo justo** hasta que aparece (con un tiempo máximo). Un `sleep(3000)` es lento cuando sobra y falla cuando falta: es la causa número 1 de **pruebas inestables (*flaky*)**. Todas las esperas están en `BasePage.ts`.

> Esperas implícitas vs. explícitas: la implícita (`driver.manage().setTimeouts({ implicit })`) aplica a todo `findElement`; la explícita espera una condición concreta. Se recomienda **no mezclarlas**; aquí solo se usan explícitas.

### 4. Page Object Model (POM)
Cada pantalla es una clase con métodos de negocio (`login()`, `search()`, `openMergeFor()`). La prueba dice **qué** hacer; el Page Object sabe **cómo**. Si cambia el HTML del login, se corrige `LoginPage.ts` y ninguna prueba.

### 5. Pruebas independientes
Cada prueba abre un **navegador nuevo** (sin cookies ni sesión) y las que modifican datos llaman a `resetDemoData()` antes. Así cualquier prueba se puede correr sola, en cualquier orden, y un fallo no arrastra a las demás.

### 6. Problemas reales que aparecieron al escribirlas
- **`StaleElementReferenceError`**: Vue vuelve a pintar la lista y el elemento leído antes deja de existir. Solución: volver a buscarlo (`waitUntil` en `BasePage` reintenta).
- **`clear()` no avisa al framework**: en Vue/Angular/React a veces no dispara el evento `input`. Solución: `Ctrl+A` + `Backspace`, como un usuario.
- **El elemento no estaba en pantalla**: la primera versión de "editar un contacto" falló porque la lista está **paginada** y el contacto estaba en la página 2. La captura de pantalla lo mostró al instante. Solución: buscarlo primero, igual que una persona.
- **Rate limiting**: el login permite 10 intentos cada 15 minutos por IP; las pruebas inician sesión decenas de veces. Solución: la app expone `AUTH_RATE_LIMIT_MAX` y solo el entorno de pruebas lo sube (en producción sigue en 10).
- **Aviso de "contraseña filtrada" de Chrome**: tapa la página. Se desactiva el gestor de contraseñas en las opciones del navegador (`driver.ts`).

### 7. Varias sesiones a la vez
`conflict.e2e.ts` abre **dos navegadores** (dos usuarios) que editan el mismo contacto: el segundo en guardar recibe el conflicto (409) y la prueba verifica la resolución guiada. Esto es difícil de probar a mano y muy natural con Selenium.

### 8. CI
En GitHub Actions ([`ci.yml`](../.github/workflows/ci.yml)) el trabajo **E2E** corre después de backend y frontend, en Chrome *headless*, y sube el reporte y las capturas como **artifact** descargable desde la página de la ejecución.

## Cómo escribir una prueba nueva

1. Si el elemento no tiene `data-testid`, agrégalo en el componente de Vue.
2. Agrega el método al Page Object de esa pantalla (usando `find`, `click`, `type`, `waitUntil` de `BasePage`).
3. Escribe la prueba en `tests/`: prepara (`resetDemoData`, login), actúa (métodos del Page Object), verifica (`expect`).

```ts
it('cierra la ventana de nuevo contacto con Cancelar', async () => {
  const form = await contacts.openNewContact();
  await form.cancel();                       // método nuevo en ContactForm
  expect(await contacts.summary()).to.contain('26 contactos');
});
```
