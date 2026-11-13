import type { EventEnvelope } from '@hrms/contracts';
import { createKysely, type CoreDatabase, type Kysely } from '@hrms/db';
import type { AccessCatalogRegistry, ModuleContext, ModuleDefinition } from '@hrms/module-sdk';
import {
  createLogger,
  createMailer,
  createRedis,
  JobBus,
  loadConfig,
  loadIdentity,
  LocalFileStore,
  OutboxRelay,
  RateLimiter,
  runAsTenant,
  SecretBox,
  Shutdown,
  SystemDb,
  TenantDb,
  TokenService,
  type AppConfig,
  type Identity,
  type Logger,
  type Mailer,
  type Redis,
} from '@hrms/platform';
import { PRODUCT } from '@hrms/contracts';
import { isAbsolute, join } from 'node:path';
import { repoRoot } from './discovery.js';
import { accessCatalog, isProductionEnv, loadModules, type LoadedModule } from './registry.js';

export type ProcessRole = 'api' | 'worker' | 'scheduler' | 'script' | 'test';

export const PLATFORM_JOBS = { outboxRelay: 'platform.outbox-relay' } as const;
export const eventJobName = (moduleId: string) => `${moduleId}.event`;

/** How long a user's identity (roles, standing, session) may be remembered between requests. */
export const IDENTITY_TTL_MS = 5_000;

export interface Runtime {
  role: ProcessRole;
  config: AppConfig;
  logger: Logger;
  modules: LoadedModule[];
  catalog: AccessCatalogRegistry;
  db: TenantDb;
  system: SystemDb;
  adminDb: Kysely<CoreDatabase>;
  redis: Redis;
  jobs: JobBus;
  tokens: TokenService;
  secrets: SecretBox;
  mailer: Mailer;
  rateLimiter: RateLimiter;
  shutdown: Shutdown;
  contextFor(moduleId: string): ModuleContext;
  /** Who a user is now (cached for IDENTITY_TTL_MS). Null: cannot act (gone, disabled, signed out). */
  identity(tenantId: string, userId: string, sessionId?: string): Promise<Identity | null>;
  accessChanged(tenantId: string, userId?: string): void;
  relayOutbox(): Promise<number>;
  close(): Promise<void>;
}

export interface RuntimeOptions {
  role: ProcessRole;
  config?: AppConfig;
  logger?: Logger;
  /** Queue key prefix; tests pass one per run so runs never take each other's jobs. */
  jobPrefix?: string;
}

/**
 * Builds the process runtime: infrastructure clients, the module registry, one ModuleContext
 * per module, and every job registered on the job bus. Every role builds the same runtime.
 */
export async function createRuntime(opts: RuntimeOptions): Promise<Runtime> {
  const config = opts.config ?? loadConfig();
  const logger = opts.logger ?? createLogger({ name: opts.role, level: config.LOG_LEVEL, pretty: config.LOG_PRETTY });
  const prefix = PRODUCT.slug;

  const appKysely = createKysely<CoreDatabase>({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    applicationName: `${prefix}-${opts.role}`,
    onConnectionError: (m) => logger.warn(m),
    ...(opts.role === 'api' ? {} : { statementTimeoutMs: 120_000 }),
  });
  const adminDb = createKysely<CoreDatabase>({
    connectionString: config.DATABASE_ADMIN_URL,
    max: 2,
    applicationName: `${prefix}-${opts.role}-system`,
    onConnectionError: (m) => logger.warn(m),
  });
  const db = new TenantDb(appKysely);
  const system = new SystemDb(adminDb);
  const redis = createRedis(config.REDIS_URL, { name: `${prefix}-${opts.role}` });
  const secrets = new SecretBox(config.ENCRYPTION_KEY);
  const tokens = new TokenService({
    secret: config.JWT_SECRET,
    issuer: config.JWT_ISSUER,
    accessTtlSeconds: config.JWT_ACCESS_TTL_SECONDS,
    refreshTtlSeconds: config.JWT_REFRESH_TTL_SECONDS,
  });
  const rateLimiter = new RateLimiter(redis, prefix);
  const mailer = createMailer({ smtpUrl: config.SMTP_URL, from: config.MAIL_FROM, log: (o, m) => logger.info(o, m) });
  const files = new LocalFileStore(isAbsolute(config.STORAGE_DIR) ? config.STORAGE_DIR : join(repoRoot(), config.STORAGE_DIR));
  const jobs = new JobBus({
    redisUrl: config.REDIS_URL,
    prefix: opts.jobPrefix ?? (opts.role === 'test' ? `${prefix}-test` : prefix),
    logger,
    defaultTenantConcurrency: config.JOB_TENANT_CONCURRENCY,
  });

  const failFast = isProductionEnv({ ...process.env, NODE_ENV: config.NODE_ENV });
  const modules = await loadModules(config.DISABLED_MODULES, { logger, failFast });
  const definitions: ModuleDefinition[] = modules.map((m) => m.definition);
  const catalog = accessCatalog(definitions);

  // Identity cache: roles and standing are read from the database, remembered for a few seconds.
  const seen = new Map<string, { at: number; identity: Identity | null }>();
  const identity = async (tenantId: string, userId: string, sessionId?: string) => {
    const key = `${tenantId}:${userId}:${sessionId ?? ''}`;
    const hit = seen.get(key);
    if (hit && Date.now() - hit.at < IDENTITY_TTL_MS) return hit.identity;
    const found = await runAsTenant(tenantId, () => db.tx((trx) => loadIdentity(trx, userId, sessionId), tenantId));
    if (seen.size > 10_000) seen.clear();
    seen.set(key, { at: Date.now(), identity: found });
    return found;
  };
  const accessChanged = (tenantId: string, userId?: string) => {
    const p = userId ? `${tenantId}:${userId}:` : `${tenantId}:`;
    for (const k of seen.keys()) if (k.startsWith(p)) seen.delete(k);
  };

  const contexts = new Map<string, ModuleContext>();
  for (const def of definitions) {
    contexts.set(def.id, {
      moduleId: def.id,
      config,
      logger: logger.child({ module: def.id }),
      db,
      jobs: { enqueue: (name, payload, o) => jobs.enqueue(name, payload, o) },
      rateLimiter,
      files,
      secrets,
      tokens,
      mailer,
      catalog,
      accessChanged,
      forEachTenant: async (fn) => {
        for (const tenantId of await system.listTenantIds()) await runAsTenant(tenantId, () => fn(tenantId));
      },
    });
  }
  const contextFor = (id: string) => {
    const ctx = contexts.get(id);
    if (!ctx) throw new Error(`Unknown module ${id}`);
    return ctx;
  };

  for (const def of definitions) {
    const ctx = contextFor(def.id);
    for (const [local, job] of Object.entries(def.jobs ?? {})) {
      jobs.register({
        name: `${def.id}.${local}`,
        queue: job.queue ?? 'default',
        attempts: job.attempts ?? 3,
        backoffMs: job.backoffMs ?? 2000,
        ...(job.tenantConcurrency ? { tenantConcurrency: job.tenantConcurrency } : {}),
        handler: (payload, meta) => job.handler(job.schema.parse(payload), ctx, meta),
      });
    }
    const subs = def.subscriptions ?? {};
    if (Object.keys(subs).length > 0) {
      jobs.register({
        name: eventJobName(def.id),
        queue: 'events',
        attempts: 5,
        backoffMs: 1000,
        handler: async (payload) => {
          const event = (payload as { event: EventEnvelope }).event;
          for (const type of [event.type, '*']) await subs[type]?.(event, ctx);
        },
      });
    }
  }

  const relay = new OutboxRelay(
    adminDb,
    async (event) => {
      for (const def of definitions) {
        const subs = def.subscriptions ?? {};
        if (!subs[event.type] && !subs['*']) continue;
        await jobs.enqueue(eventJobName(def.id), { event }, { jobId: `evt__${event.id}__${def.id}`, tenantId: event.tenantId });
      }
    },
    logger,
  );
  jobs.register({ name: PLATFORM_JOBS.outboxRelay, queue: 'system', attempts: 1, backoffMs: 1000, handler: () => relay.drain() });

  const shutdown = new Shutdown(logger);
  shutdown.add('runtime', async () => {
    await jobs.close();
    await Promise.allSettled([appKysely.destroy(), adminDb.destroy()]);
    redis.disconnect();
  });

  for (const def of definitions) await def.onBoot?.(contextFor(def.id));
  logger.info({ role: opts.role, modules: definitions.map((d) => d.id) }, 'runtime ready');

  return {
    role: opts.role,
    config,
    logger,
    modules,
    catalog,
    db,
    system,
    adminDb,
    redis,
    jobs,
    tokens,
    secrets,
    mailer,
    rateLimiter,
    shutdown,
    contextFor,
    identity,
    accessChanged,
    relayOutbox: () => relay.relayOnce(),
    close: () => shutdown.run(),
  };
}
