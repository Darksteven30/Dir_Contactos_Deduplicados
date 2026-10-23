import { configDefaults, defineConfig } from 'vitest/config';

// Pruebas unitarias (`npm test`): rápidas y sin base de datos (repositorios en memoria).
// Las de integración contra PostgreSQL real van aparte: `npm run test:integration`.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'tests/integration/**'],
  },
});
