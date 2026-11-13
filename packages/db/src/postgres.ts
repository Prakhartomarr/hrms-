import { Kysely, PostgresDialect, type KyselyConfig } from 'kysely';
import pg from 'pg';
import type { CoreDatabase } from './schema.js';

// int8 (bigint) as JS number: counts and versions stay well inside 2^53.
// date stays a YYYY-MM-DD string: effective dating compares calendar days, never instants.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export interface PostgresOptions {
  connectionString: string;
  max?: number;
  applicationName?: string;
  log?: KyselyConfig['log'];
  /** Longest one statement may run, lock waits included. */
  statementTimeoutMs?: number;
  /** Where a lost connection is reported (the runtime passes its logger). Silent without one. */
  onConnectionError?: (message: string) => void;
}

/** Longest a request waits for a free connection, so a full pool is an error and not a hang. */
export const POOL_ACQUIRE_TIMEOUT_MS = 15_000;
export const STATEMENT_TIMEOUT_MS = 30_000;
/** The client gives up a little after the server would, for a server that has stopped answering. */
const QUERY_TIMEOUT_MARGIN_MS = 5_000;

export function createPool(opts: PostgresOptions): pg.Pool {
  const statementTimeoutMs = opts.statementTimeoutMs ?? STATEMENT_TIMEOUT_MS;
  const pool = new pg.Pool({
    connectionString: opts.connectionString,
    max: opts.max ?? 10,
    application_name: opts.applicationName ?? 'hrms',
    connectionTimeoutMillis: POOL_ACQUIRE_TIMEOUT_MS,
    statement_timeout: statementTimeoutMs,
    query_timeout: statementTimeoutMs + QUERY_TIMEOUT_MARGIN_MS,
    keepAlive: true,
  });
  // A connection that dies (Postgres restarting) must not be an uncaught error: that took the
  // whole process down. Idle ones report on the pool. One in use reports on itself as well as
  // failing its query, and the pool only listens to idle ones, so each gets a listener of its own.
  const report = opts.onConnectionError ?? (() => undefined);
  pool.on('error', (err) => report(`postgres: idle connection lost: ${err.message}`));
  pool.on('connect', (client) => {
    client.on('error', (err) => report(`postgres: connection lost: ${err.message}`));
  });
  return pool;
}

export function createKysely<DB = CoreDatabase>(opts: PostgresOptions): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: createPool(opts) }),
    ...(opts.log ? { log: opts.log } : {}),
  });
}

export type { Kysely, Transaction } from 'kysely';
export { sql, type RawBuilder, type Expression, type SqlBool, type Selectable } from 'kysely';
