import { defineConfig } from 'vitest/config';

// Tests unitarios (rápidos, sin base de datos). Los de integración tienen su propia
// configuración: ver vitest.integration.config.ts y `npm run test:integration`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/__tests__/integration/**', 'node_modules/**'],
  },
});
