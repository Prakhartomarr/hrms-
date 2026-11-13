import { z } from 'zod';
import { isoDateTime, uuid } from '../primitives.js';
import { endpoint } from './endpoint.js';

export const fieldChange = z.object({
  field: z.string(),
  before: z.unknown(),
  after: z.unknown(),
});
export type FieldChange = z.infer<typeof fieldChange>;

export const auditEntry = z.object({
  id: uuid,
  occurredAt: isoDateTime,
  action: z.enum(['create', 'update', 'delete']),
  entityType: z.string(),
  entityId: z.string(),
  entityLabel: z.string().nullable(),
  actor: z.object({ id: uuid.nullable(), name: z.string().nullable() }),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  changes: z.array(fieldChange),
});
export type AuditEntry = z.infer<typeof auditEntry>;

export const auditApi = {
  list: endpoint({
    method: 'GET',
    path: '/api/v1/audit',
    auth: true,
    query: z.object({
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      actorId: uuid.optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    }),
    response: z.object({ items: z.array(auditEntry), total: z.number().int() }),
    summary: 'Field-level change history of master data and settings',
  }),
};
