import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/** A directory of `NNNN_name.sql` files owned by one scope (core or a module id). */
export interface MigrationSource {
  scope: string;
  dir: string;
}

export const coreMigrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));

export interface MigrationResult {
  applied: { scope: string; name: string }[];
  skipped: number;
}

/**
 * Applies SQL migrations in order: sources in the order given (core first, then modules
 * in dependency order), files by name. Each file runs in its own transaction and is
 * recorded in `schema_migrations`. A changed checksum for an applied file is an error.
 * Runs with the schema-owner connection (DATABASE_ADMIN_URL).
 */
export async function runMigrations(
  connectionString: string,
  sources: MigrationSource[],
  log: (msg: string) => void = () => {},
): Promise<MigrationResult> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  const result: MigrationResult = { applied: [], skipped: 0 };
  try {
    // Serialise concurrent migrators (e.g. several containers starting at once).
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      scope text NOT NULL, name text NOT NULL, checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (scope, name))`);
    const { rows } = await client.query<{ scope: string; name: string; checksum: string }>(
      'SELECT scope, name, checksum FROM schema_migrations',
    );
    const done = new Map(rows.map((r) => [`${r.scope}/${r.name}`, r.checksum]));

    for (const source of sources) {
      let files: string[];
      try {
        files = (await readdir(source.dir)).filter((f) => f.endsWith('.sql')).sort();
      } catch {
        continue;
      }
      for (const file of files) {
        const body = await readFile(join(source.dir, file), 'utf8');
        const checksum = createHash('sha256').update(body).digest('hex');
        const key = `${source.scope}/${file}`;
        const prior = done.get(key);
        if (prior) {
          if (prior !== checksum) {
            throw new Error(
              `Migration ${key} changed after it was applied. Add a new migration instead.`,
            );
          }
          result.skipped++;
          continue;
        }
        log(`applying ${key}`);
        await client.query('BEGIN');
        try {
          await client.query(body);
          await client.query(
            'INSERT INTO schema_migrations (scope, name, checksum) VALUES ($1, $2, $3)',
            [source.scope, file, checksum],
          );
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw new Error(`Migration ${key} failed: ${(err as Error).message}`, { cause: err });
        }
        result.applied.push({ scope: source.scope, name: file });
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    await client.end();
  }
  return result;
}
