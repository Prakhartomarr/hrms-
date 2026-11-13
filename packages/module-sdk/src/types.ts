import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Action, EventEnvelope, PageDef, ResourceDef } from '@hrms/contracts';
import type {
  AppConfig,
  EnqueueOptions,
  FileStore,
  JobMeta,
  Logger,
  Mailer,
  RateLimiter,
  SecretBox,
  TenantDb,
  TokenService,
} from '@hrms/platform';
import type { FastifyBaseLogger, FastifyInstance, RawServerDefault } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { z } from 'zod';

/** Fastify instance handed to a module's routes(), with zod schemas for validation and typing. */
export type ModuleApp = FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, FastifyBaseLogger, ZodTypeProvider>;

export interface JobDispatcher {
  /** Queue a job by fully qualified name (`<module>.<job>`). Tenant comes from the context. */
  enqueue<P>(name: string, payload: P, opts?: EnqueueOptions): Promise<string>;
}

/** Every page and resource the loaded modules declare (the role editor's rows). */
export interface AccessCatalogRegistry {
  resources(): ResourceDef[];
  pages(): PageDef[];
}

/**
 * Services a module may use. Built once per module by the host; identical in the api, worker
 * and scheduler roles. Modules never construct infrastructure clients themselves.
 */
export interface ModuleContext {
  moduleId: string;
  config: AppConfig;
  logger: Logger;
  /** Tenant-scoped Postgres (RLS). Use `db.tx(trx => ...)`. */
  db: TenantDb;
  jobs: JobDispatcher;
  rateLimiter: RateLimiter;
  files: FileStore;
  /** Encrypt/decrypt values at rest (PAN, Aadhaar, account numbers, TOTP secrets). */
  secrets: SecretBox;
  tokens: TokenService;
  mailer: Mailer;
  catalog: AccessCatalogRegistry;
  /** Forget cached access for a user (after their roles change), in this process at once. */
  accessChanged(tenantId: string, userId?: string): void;
  /** Runs `fn` once per tenant, inside that tenant's context (scheduled jobs). */
  forEachTenant(fn: (tenantId: string) => Promise<void>): Promise<void>;
}

export interface NavDef {
  id: string;
  label: string;
  /** Web route, e.g. `/people`. */
  path: string;
  /** Page id from the module's `pages`; the item shows only with page access. */
  page: string;
  section?: string;
  order?: number;
}

export interface JobDef<S extends z.ZodType = z.ZodType> {
  schema: S;
  /** Queue name (separate queues scale separately). Default `default`. */
  queue?: string;
  attempts?: number;
  backoffMs?: number;
  tenantConcurrency?: number;
  handler(payload: z.output<S>, ctx: ModuleContext, meta: JobMeta): Promise<unknown>;
}

export interface ScheduleDef {
  id: string;
  /** Job name: local (`refresh`) or fully qualified (`people.refresh`). */
  job: string;
  everyMs?: number;
  cron?: string;
  payload?: unknown;
}

export type EventHandler = (event: EventEnvelope, ctx: ModuleContext) => Promise<void>;

/** Access a route needs before its handler runs. Data scope is checked inside the handler. */
export interface RouteAccess {
  resource: string;
  action: Action;
}

export interface ModuleDefinition {
  /** Stable id, kebab-case. Prefixes job names, resources, events and migration scope. */
  id: string;
  name: string;
  version?: string;
  description?: string;
  dependsOn?: string[];
  /** Absolute path to a folder of `NNNN_name.sql` Postgres migrations. */
  migrations?: string;
  /** Protected resources (rows of the role editor). Ids start with `<module id>.`. */
  resources?: ResourceDef[];
  /** Screens (page access). */
  pages?: PageDef[];
  nav?: NavDef[];
  routes?(app: ModuleApp, ctx: ModuleContext): Promise<void> | void;
  jobs?: Record<string, JobDef>;
  schedules?: ScheduleDef[];
  /** Outbox event type (or `*`) -> handler. Runs in the worker, in tenant context. */
  subscriptions?: Record<string, EventHandler>;
  onBoot?(ctx: ModuleContext): Promise<void>;
}
