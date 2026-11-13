import { randomUUID } from 'node:crypto';
import type { CoreDatabase, Transaction } from '@hrms/db';
import { diffFields } from '@hrms/domain';
import { currentContext, requireTenantId } from './context.js';

export interface AuditInput {
  action: 'create' | 'update' | 'delete';
  /** e.g. `employee`, `org_unit`, `role`, `settings.security`. */
  entityType: string;
  entityId: string;
  entityLabel?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Field names whose values are never written to the log (only that they changed). */
  redact?: Iterable<string>;
}

/** Fields redacted from every audit entry. */
export const ALWAYS_REDACTED = ['pan', 'aadhaar', 'accountNumber', 'password', 'passwordHash', 'secret'];

/**
 * Appends a field-level audit entry inside the caller's transaction, so it commits or rolls
 * back with the change. Actor, IP, user agent and request id come from the execution context.
 * An update that changed nothing is not logged.
 */
export async function recordAudit<DB>(db: Transaction<DB>, input: AuditInput): Promise<void> {
  const trx = db as unknown as Transaction<CoreDatabase>;
  const ctx = currentContext();
  const redact = new Set([...ALWAYS_REDACTED, ...(input.redact ?? [])]);
  const changes = diffFields(input.action === 'create' ? null : (input.before ?? null), input.action === 'delete' ? null : (input.after ?? null), redact);
  if (input.action === 'update' && changes.length === 0) return;
  await trx
    .insertInto('audit_log')
    .values({
      id: randomUUID(),
      tenant_id: requireTenantId(),
      actor_user_id: ctx?.userId ?? null,
      actor_name: ctx?.userName ?? (ctx?.jobName ? `system (${ctx.jobName})` : null),
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId,
      entity_label: input.entityLabel ?? null,
      changes: JSON.stringify(changes),
      ip: ctx?.ip ?? null,
      user_agent: ctx?.userAgent ?? null,
      request_id: ctx?.requestId ?? null,
    })
    .execute();
}
