import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const migrationPath = path.resolve(
  repoRoot,
  process.argv[2] ?? 'scripts/database/001_knowledge_store.sql',
);

const connectionString = process.env.BATTLEFLOW_DATABASE_URL;
if (!connectionString) {
  console.error('BATTLEFLOW_DATABASE_URL is not set.');
  process.exit(1);
}

const sslMode = process.env.BATTLEFLOW_DATABASE_SSL;
const ssl = sslMode && sslMode !== 'false' && sslMode !== 'disable'
  ? { rejectUnauthorized: process.env.BATTLEFLOW_DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
  : undefined;

const client = new Client({
  connectionString,
  ssl,
  connectionTimeoutMillis: 10000,
  statement_timeout: 120000,
});

try {
  const sql = await readFile(migrationPath, 'utf8');
  await client.connect();
  await client.query(sql);
  console.log(`Applied Postgres migration: ${path.relative(repoRoot, migrationPath)}`);
} catch (error) {
  console.error('Failed to apply Postgres migration.');
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
