#!/usr/bin/env node
// Verifica que un backup se pueda RESTAURAR de verdad (un backup que nunca se restauró es
// solo una esperanza). Hace pg_dump de la base indicada en DATABASE_URL, lo restaura en una
// base temporal, compara la cantidad de filas de cada tabla y borra la base temporal.
//
// No modifica la base de origen. Requiere pg_dump/psql/createdb/dropdb (vienen con PostgreSQL)
// y que el usuario de la base pueda crear bases de datos. Uso:
//   npm run backup:verify                 (lee DATABASE_URL de backend/.env)
//   PG_BIN="C:\Program Files\PostgreSQL\17\bin" npm run backup:verify   (si no están en el PATH)
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envFile)) {
    const m = fs.readFileSync(envFile, 'utf8').match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
    if (m) return m[1];
  }
  throw new Error('No se encontró DATABASE_URL (variable de entorno o backend/.env).');
}

const url = new URL(readDatabaseUrl());
const exe = (name) => (process.env.PG_BIN ? path.join(process.env.PG_BIN, name) : name);
// La contraseña viaja por PGPASSWORD (no por argumentos) y nunca se imprime.
const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
const conn = ['-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username)];
const sourceDb = url.pathname.slice(1);
const tempDb = `${sourceDb}_restore_check`;
const dumpFile = path.join(os.tmpdir(), `${tempDb}.sql`);

const run = (name, args) => execFileSync(exe(name), args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const psql = (db, sql) => run('psql', [...conn, '-d', db, '-At', '-c', sql]).trim();

function rowCounts(db) {
  const tables = psql(db, "select tablename from pg_tables where schemaname='public' order by 1").split(/\r?\n/).filter(Boolean);
  return Object.fromEntries(tables.map((t) => [t, Number(psql(db, `select count(*) from "${t}"`))]));
}

function cleanup() {
  try { run('dropdb', [...conn, '--if-exists', tempDb]); } catch { /* ya no existe */ }
  try { fs.unlinkSync(dumpFile); } catch { /* ya no existe */ }
}

let ok = false;
try {
  cleanup();
  console.log(`1) pg_dump de "${sourceDb}"`);
  run('pg_dump', [...conn, '-d', sourceDb, '-F', 'p', '-f', dumpFile]);
  console.log(`   ${(fs.statSync(dumpFile).size / 1024).toFixed(0)} KB`);

  console.log(`2) restaurando en la base temporal "${tempDb}"`);
  run('createdb', [...conn, tempDb]);
  run('psql', [...conn, '-d', tempDb, '-v', 'ON_ERROR_STOP=1', '-q', '-f', dumpFile]);

  console.log('3) comparando filas por tabla');
  const before = rowCounts(sourceDb);
  const after = rowCounts(tempDb);
  ok = true;
  for (const table of Object.keys(before)) {
    const same = before[table] === after[table];
    if (!same) ok = false;
    console.log(`   ${same ? 'OK ' : 'DIF'} ${table.padEnd(26)} origen=${before[table]} restaurada=${after[table]}`);
  }
} catch (error) {
  console.error('ERROR:', error.stderr ? String(error.stderr).trim() : error.message);
} finally {
  cleanup();
}

console.log(ok ? '\nRESULTADO: el backup se restauró y los datos coinciden.' : '\nRESULTADO: FALLÓ la verificación de restauración.');
process.exit(ok ? 0 : 1);
