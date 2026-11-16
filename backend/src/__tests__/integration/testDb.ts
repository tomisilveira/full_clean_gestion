import fs from 'fs';
import path from 'path';

// Resuelve las URLs de la base de datos para los tests de integración.
// La de TEST es la de desarrollo con el nombre de base + "_test". Hay una guarda dura: si
// por cualquier motivo el nombre no termina en "_test", se aborta antes de tocar nada.

export function sourceDatabaseUrl(): string {
  if (process.env.TEST_ADMIN_DATABASE_URL) return process.env.TEST_ADMIN_DATABASE_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = path.join(__dirname, '../../../.env');
  if (fs.existsSync(envFile)) {
    const m = fs.readFileSync(envFile, 'utf8').match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
    if (m) return m[1];
  }
  throw new Error('No se encontró DATABASE_URL (variable de entorno o backend/.env) para los tests de integración.');
}

export function testDatabaseName(): string {
  const name = new URL(sourceDatabaseUrl()).pathname.slice(1);
  return name.endsWith('_test') ? name : `${name}_test`;
}

export function testDatabaseUrl(): string {
  const url = new URL(sourceDatabaseUrl());
  url.pathname = `/${testDatabaseName()}`;
  const name = url.pathname.slice(1);
  if (!name.endsWith('_test')) throw new Error(`Se rechaza correr tests contra una base que no termina en _test: ${name}`);
  return url.toString();
}
