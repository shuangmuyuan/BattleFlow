import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import dotenv from 'dotenv';

let envLoaded = false;
let postgresPool: Pool | undefined;

interface PostgresConfig {
  connectionString: string;
  maxConnections: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  statementTimeoutMillis: number;
  ssl?: PoolConfig['ssl'];
}

function loadDatabaseEnv(): void {
  if (envLoaded || process.env.BATTLEFLOW_DATABASE_URL) {
    return;
  }

  try {
    dotenv.config();
  } catch {
    // dotenv is optional; deployment environments can provide variables directly.
  }

  envLoaded = true;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getSslConfig(): PoolConfig['ssl'] | undefined {
  const mode = process.env.BATTLEFLOW_DATABASE_SSL;
  if (!mode || mode === 'false' || mode === 'disable') {
    return undefined;
  }

  return {
    rejectUnauthorized: process.env.BATTLEFLOW_DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
  };
}

export function getPostgresDatabaseUrl(): string | undefined {
  loadDatabaseEnv();
  return process.env.BATTLEFLOW_DATABASE_URL;
}

export function hasPostgresDatabaseConfig(): boolean {
  return Boolean(getPostgresDatabaseUrl());
}

export function getPostgresConfig(): PostgresConfig {
  const connectionString = getPostgresDatabaseUrl();
  if (!connectionString) {
    throw new Error('BATTLEFLOW_DATABASE_URL is not set');
  }

  return {
    connectionString,
    maxConnections: parsePositiveInteger(process.env.BATTLEFLOW_DATABASE_POOL_MAX, 5),
    connectionTimeoutMillis: parsePositiveInteger(process.env.BATTLEFLOW_DATABASE_CONNECTION_TIMEOUT_MS, 5000),
    idleTimeoutMillis: parsePositiveInteger(process.env.BATTLEFLOW_DATABASE_IDLE_TIMEOUT_MS, 30000),
    statementTimeoutMillis: parsePositiveInteger(process.env.BATTLEFLOW_DATABASE_STATEMENT_TIMEOUT_MS, 30000),
    ssl: getSslConfig(),
  };
}

export function getPostgresPool(): Pool {
  if (postgresPool) {
    return postgresPool;
  }

  const config = getPostgresConfig();
  postgresPool = new Pool({
    connectionString: config.connectionString,
    max: config.maxConnections,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    idleTimeoutMillis: config.idleTimeoutMillis,
    statement_timeout: config.statementTimeoutMillis,
    ssl: config.ssl,
  });

  return postgresPool;
}

export async function queryPostgres<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return getPostgresPool().query<T>(text, params);
}

export async function closePostgresPool(): Promise<void> {
  if (!postgresPool) {
    return;
  }

  const pool = postgresPool;
  postgresPool = undefined;
  await pool.end();
}
