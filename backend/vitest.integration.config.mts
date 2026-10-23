import { defineConfig } from 'vitest/config';

// Pruebas de integración (`npm run test:integration`): la app completa contra PostgreSQL real.
// Usan una base exclusiva para pruebas (por defecto `contactos_test`), que se vacía y se vuelve
// a crear con las migraciones antes de correr.
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.int.test.ts'],
    globalSetup: ['tests/integration/support/globalSetup.ts'],
    // Todas comparten la misma base: se ejecutan de a un archivo para no pisarse.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
