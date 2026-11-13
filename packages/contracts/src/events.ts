import { z } from 'zod';

/** What a module receives for every outbox event it subscribes to. */
export const eventEnvelope = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  occurredAt: z.string(),
});
export type EventEnvelope<P = Record<string, unknown>> = Omit<z.infer<typeof eventEnvelope>, 'payload'> & { payload: P };

/** Well-known events (modules may publish more, prefixed with their id). */
export const EVENTS = {
  employeeCreated: 'people.employee.created',
  employeeUpdated: 'people.employee.updated',
  employeesImported: 'people.employees.imported',
  jobChanged: 'people.job.changed',
  roleChanged: 'access.role.changed',
} as const;
