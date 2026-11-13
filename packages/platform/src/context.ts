import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { EffectiveAccess } from '@hrms/contracts';
import type { Viewer } from '@hrms/domain';
import { AppError } from './errors.js';

/**
 * Execution context carried through every request and job with AsyncLocalStorage. The tenant
 * id is what every database transaction binds to (row-level security). `access` and `viewer`
 * are what the central guard checks. It is mutable so auth can fill it after the request starts.
 */
export interface ExecutionContext {
  requestId: string;
  tenantId?: string;
  userId?: string;
  userName?: string;
  /** The sign-in the request's token belongs to. */
  sessionId?: string;
  /** Merged rights of every role the user holds. Absent: no user (system work). */
  access?: EffectiveAccess;
  /** The user's own employee record and place in the org (relative data scopes). */
  viewer?: Viewer;
  ip?: string;
  userAgent?: string;
  jobId?: string;
  jobName?: string;
}

const storage = new AsyncLocalStorage<ExecutionContext>();

export function runWithContext<T>(ctx: Partial<ExecutionContext>, fn: () => T): T {
  return storage.run({ requestId: ctx.requestId ?? randomUUID(), ...ctx }, fn);
}

/**
 * Runs `fn` in a tenant as the system: no user and no access, so nothing narrows reads. For
 * scheduled jobs and seeding. What comes out must never go straight into a response to a person.
 */
export function runAsTenant<T>(tenantId: string, fn: () => T, extra: Partial<ExecutionContext> = {}): T {
  const parent = storage.getStore();
  return storage.run(
    {
      requestId: parent?.requestId ?? randomUUID(),
      ...(parent?.jobId ? { jobId: parent.jobId, jobName: parent.jobName } : {}),
      ...extra,
      tenantId,
    },
    fn,
  );
}

export function currentContext(): ExecutionContext | undefined {
  return storage.getStore();
}

export function requireContext(): ExecutionContext {
  const ctx = storage.getStore();
  if (!ctx) throw new AppError('no_context', 500, 'No execution context');
  return ctx;
}

export function requireTenantId(): string {
  const id = storage.getStore()?.tenantId;
  if (!id) throw new AppError('no_tenant', 500, 'No tenant in the execution context');
  return id;
}

export function requireUserId(): string {
  const id = storage.getStore()?.userId;
  if (!id) throw new AppError('unauthorized', 401, 'Authentication required');
  return id;
}
