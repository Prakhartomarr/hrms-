import { z } from 'zod';
import { isoDate, isoDateTime, ok, uuid } from '../primitives.js';
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES } from './people.js';
import { endpoint } from './endpoint.js';

/** Policy types. Later modules add their own (leave, attendance, pay group, ...). */
export const policyType = z.string().regex(/^[a-z][a-z0-9_.-]{1,60}$/);

/**
 * Who a policy applies to. Step 1 picks org units (empty list = any). Step 2 narrows further.
 * A department in the list covers its sub-departments.
 */
export const applicability = z.object({
  entityIds: z.array(uuid).default([]),
  businessUnitIds: z.array(uuid).default([]),
  departmentIds: z.array(uuid).default([]),
  locationIds: z.array(uuid).default([]),
  gradeIds: z.array(uuid).default([]),
  designationIds: z.array(uuid).default([]),
  narrowing: z
    .object({
      /** Branch = location. */
      branchIds: z.array(uuid).default([]),
      employmentTypes: z.array(z.enum(EMPLOYMENT_TYPES)).default([]),
      statuses: z.array(z.enum(EMPLOYEE_STATUSES)).default([]),
      /** Months of joining, 1-12. */
      joiningMonths: z.array(z.number().int().min(1).max(12)).default([]),
      /** Tenure in days on the resolution date, inclusive. */
      tenureDays: z.object({ from: z.number().int().min(0).optional(), to: z.number().int().min(0).optional() }).nullable().default(null),
    })
    .default({ branchIds: [], employmentTypes: [], statuses: [], joiningMonths: [], tenureDays: null }),
});
export type Applicability = z.output<typeof applicability>;

export const policyVersion = z.object({
  id: uuid,
  effectiveFrom: isoDate,
  /** Exclusive end; null = open. Set automatically when a later version starts. */
  effectiveTo: isoDate.nullable(),
  config: z.record(z.string(), z.unknown()),
  createdAt: isoDateTime,
});
export type PolicyVersion = z.infer<typeof policyVersion>;

export const policy = z.object({
  id: uuid,
  type: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** Lower number wins. Resolution takes the first applicable policy in priority order. */
  priority: z.number().int(),
  active: z.boolean(),
  applicability,
  versions: z.array(policyVersion),
});
export type Policy = z.infer<typeof policy>;

export const policyInput = z.object({
  type: policyType,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  priority: z.number().int().min(0).max(100000),
  applicability: applicability.default({
    entityIds: [], businessUnitIds: [], departmentIds: [], locationIds: [], gradeIds: [], designationIds: [],
    narrowing: { branchIds: [], employmentTypes: [], statuses: [], joiningMonths: [], tenureDays: null },
  }),
  version: z.object({ effectiveFrom: isoDate, config: z.record(z.string(), z.unknown()).default({}) }),
});

export const policyOverride = z.object({
  id: uuid,
  employeeId: uuid,
  type: z.string(),
  policyId: uuid,
  effectiveFrom: isoDate,
  effectiveTo: isoDate.nullable(),
  reason: z.string().nullable(),
});

export const resolution = z.object({
  policy: z.object({ id: uuid, name: z.string(), priority: z.number().int() }).nullable(),
  version: policyVersion.nullable(),
  via: z.enum(['override', 'applicability', 'none']),
});
export type Resolution = z.infer<typeof resolution>;

export const policyApi = {
  list: endpoint({
    method: 'GET',
    path: '/api/v1/policies',
    auth: true,
    query: z.object({ type: z.string().optional() }),
    response: z.object({ items: z.array(policy) }),
    summary: 'Policies, in priority order',
  }),
  create: endpoint({
    method: 'POST',
    path: '/api/v1/policies',
    auth: true,
    body: policyInput,
    response: policy,
    summary: 'Create a policy with its first version',
  }),
  get: endpoint({
    method: 'GET',
    path: '/api/v1/policies/:id',
    auth: true,
    params: z.object({ id: uuid }),
    response: policy,
    summary: 'One policy with its versions',
  }),
  update: endpoint({
    method: 'PATCH',
    path: '/api/v1/policies/:id',
    auth: true,
    params: z.object({ id: uuid }),
    body: policyInput.omit({ type: true, version: true }).partial().extend({ active: z.boolean().optional() }),
    response: policy,
    summary: 'Change name, priority, applicability or status',
  }),
  addVersion: endpoint({
    method: 'POST',
    path: '/api/v1/policies/:id/versions',
    auth: true,
    params: z.object({ id: uuid }),
    body: z.object({ effectiveFrom: isoDate, config: z.record(z.string(), z.unknown()) }),
    response: policy,
    summary: 'Add a version effective from a date (closes the previous one)',
  }),
  overrides: endpoint({
    method: 'GET',
    path: '/api/v1/policy-overrides',
    auth: true,
    query: z.object({ employeeId: uuid.optional(), type: z.string().optional() }),
    response: z.object({ items: z.array(policyOverride) }),
    summary: 'Per-employee policy overrides',
  }),
  createOverride: endpoint({
    method: 'POST',
    path: '/api/v1/policy-overrides',
    auth: true,
    body: z.object({
      employeeId: uuid,
      policyId: uuid,
      effectiveFrom: isoDate,
      effectiveTo: isoDate.nullable().default(null),
      reason: z.string().trim().max(300).nullable().default(null),
    }),
    response: policyOverride,
    summary: 'Pin one employee to a policy, whatever applicability says',
  }),
  deleteOverride: endpoint({
    method: 'DELETE',
    path: '/api/v1/policy-overrides/:id',
    auth: true,
    params: z.object({ id: uuid }),
    response: ok,
    summary: 'Remove an override',
  }),
  resolve: endpoint({
    method: 'GET',
    path: '/api/v1/policies/resolve',
    auth: true,
    query: z.object({ employeeId: uuid, type: policyType, date: isoDate }),
    response: resolution,
    summary: 'The policy that applies to an employee on a date',
  }),
};
