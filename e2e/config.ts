// Parámetros de ejecución, configurables con variables de entorno (útil en CI).

export const config = {
  /** Puerto donde se levanta la app compilada para las pruebas (distinto al de desarrollo). */
  port: Number(process.env.E2E_PORT ?? 4300),
  get baseUrl(): string {
    return process.env.E2E_BASE_URL ?? `http://localhost:${this.port}`;
  },
  /** chrome (por defecto) o edge. */
  browser: (process.env.E2E_BROWSER ?? 'chrome') as 'chrome' | 'edge',
  /** true = sin ventana (CI). En local se ve el navegador trabajando. */
  headless: process.env.HEADLESS === 'true',
  /** Tiempo máximo que una espera explícita aguarda a que algo aparezca. */
  waitTimeoutMs: Number(process.env.E2E_WAIT_TIMEOUT_MS ?? 10_000),
  /** Cuenta de demostración que crea `npm run seed`. */
  demo: { email: 'demo@example.com', password: 'demo12345', name: 'Usuario Demo', contacts: 26, groups: 8 },
} as const;
