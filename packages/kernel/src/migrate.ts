import { coreMigrationsDir, runMigrations, type MigrationSource } from '@hrms/db';
import { createLogger, loadConfig, type AppConfig, type Logger } from '@hrms/platform';
import { isProductionEnv, loadModules } from './registry.js';

/** Applies Postgres migrations: core first, then each module's in dependency order. */
export async function migrateAll(
  config: AppConfig = loadConfig(),
  logger: Logger = createLogger({ name: 'migrate', level: config.LOG_LEVEL, pretty: config.LOG_PRETTY }),
): Promise<{ applied: string[] }> {
  const failFast = isProductionEnv({ ...process.env, NODE_ENV: config.NODE_ENV });
  const modules = await loadModules(config.DISABLED_MODULES, { logger, failFast });
  const sources: MigrationSource[] = [
    { scope: 'core', dir: coreMigrationsDir },
    ...modules.filter((m) => m.definition.migrations).map((m) => ({ scope: m.definition.id, dir: m.definition.migrations! })),
  ];
  const pg = await runMigrations(config.DATABASE_ADMIN_URL, sources, (msg) => logger.info(msg));
  const applied = pg.applied.map((a) => `${a.scope}/${a.name}`);
  logger.info({ applied: applied.length, skipped: pg.skipped }, 'migrations complete');
  return { applied };
}
