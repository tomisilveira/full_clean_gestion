import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from './src/__tests__/integration/testDb';

// Tests de integración: levantan la API real de Express contra una base PostgreSQL
// DESCARTABLE (se crea, se migra y se borra sola; nunca toca la base de desarrollo).
// Requieren un PostgreSQL accesible con DATABASE_URL (o backend/.env) y permiso de CREATE DATABASE.
export default defineConfig({
  test: {
    include: ['src/__tests__/integration/**/*.test.ts'],
    globalSetup: ['./src/__tests__/integration/globalSetup.ts'],
    env: {
      DATABASE_URL: testDatabaseUrl(),
      JWT_SECRET: 'secreto-solo-para-tests-de-integracion',
      NODE_ENV: 'test',
    },
    // Un solo proceso y archivos en serie: comparten la misma base de datos.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
