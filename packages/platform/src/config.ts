import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseEnv } from 'node:util';
import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

/** Platform configuration. Every value comes from an environment variable (12-factor). */
export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: bool.default(false),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().default(4100),
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: z.string().default('false'),
  WEB_URL: z.string().default('http://localhost:5180'),
  DATABASE_URL: z.string().min(1),
  DATABASE_ADMIN_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().default(10),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().default('hrms'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'ENCRYPTION_KEY must be 32 bytes, base64'),
  SMTP_URL: optional,
  MAIL_FROM: z.string().default('HRMS <no-reply@localhost>'),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  MICROSOFT_CLIENT_ID: optional,
  MICROSOFT_CLIENT_SECRET: optional,
  MICROSOFT_TENANT: z.string().default('common'),
  SSO_REDIRECT_URL: z.string().default('http://localhost:4100/api/v1/auth/sso/callback'),
  /** Where uploaded documents are written (local disk in development). */
  STORAGE_DIR: z.string().default('storage'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
  JOB_TENANT_CONCURRENCY: z.coerce.number().int().positive().default(2),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(600),
  DISABLED_MODULES: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
});

export type AppConfig = z.infer<typeof configSchema>;

/** Walks up from `start` to the monorepo root (the folder holding pnpm-workspace.yaml). */
export function findRepoRoot(start = process.cwd()): string | undefined {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Loads `.env` from the repo root (if present) without overriding variables already set,
 * then validates. Throws a readable error listing every invalid variable.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const root = findRepoRoot();
  const file = root ? join(root, '.env') : undefined;
  if (file && existsSync(file) && env === process.env) {
    const parsed = parseEnv(readFileSync(file, 'utf8'));
    for (const [k, v] of Object.entries(parsed)) if (process.env[k] === undefined) process.env[k] = v;
  }
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}\n(see .env.example)`);
  }
  return result.data;
}

/** Module-specific settings: modules validate their own env vars with their own schema. */
export function readEnv<S extends z.ZodType>(schema: S, env: NodeJS.ProcessEnv = process.env): z.output<S> {
  return schema.parse(env);
}
