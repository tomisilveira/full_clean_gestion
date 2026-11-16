import { execFileSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { sourceDatabaseUrl, testDatabaseName, testDatabaseUrl } from './testDb';

// Crea una base limpia, le aplica TODAS las migraciones reales (así los tests también
// validan que las migraciones funcionen desde cero) y la borra al terminar.
const identifier = () => `"${testDatabaseName().replace(/"/g, '')}"`;

async function withAdminClient<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  // Se conecta a la base "origen" solo para poder ejecutar CREATE/DROP DATABASE.
  const admin = new PrismaClient({ datasources: { db: { url: sourceDatabaseUrl() } } });
  try {
    return await fn(admin);
  } finally {
    await admin.$disconnect();
  }
}

export async function setup() {
  const testUrl = testDatabaseUrl(); // valida que termine en _test
  await withAdminClient(async (admin) => {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${identifier()} WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE ${identifier()}`);
  });

  const prismaCli = require.resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: path.join(__dirname, '../../..'),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });
}

export async function teardown() {
  await withAdminClient((admin) => admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${identifier()} WITH (FORCE)`));
}
