import { z } from 'zod';
import { grants, scope } from '../access.js';
import { ok, uuid } from '../primitives.js';
import { endpoint } from './endpoint.js';
import { roleAssignment, userRow } from './identity.js';

export const ROLE_TEMPLATES = ['employee', 'manager', 'hr', 'payroll_admin', 'finance', 'cxo'] as const;
export type RoleTemplateKey = (typeof ROLE_TEMPLATES)[number];

export const role = z.object({
  id: uuid,
  name: z.string(),
  description: z.string().nullable(),
  templateKey: z.string().nullable(),
  /** The workspace owner's role: every right, cannot be edited or deleted. */
  system: z.boolean(),
  pages: z.array(z.string()),
  grants,
  /** Workflows can route tasks to this role; with no holder, they go to the fallback. */
  taskQueue: z.boolean(),
  fallbackEmployeeId: uuid.nullable(),
  memberCount: z.number().int(),
});
export type Role = z.infer<typeof role>;

export const roleInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullable().optional(),
  pages: z.array(z.string()).default([]),
  grants: grants.default({}),
  taskQueue: z.boolean().default(false),
  fallbackEmployeeId: uuid.nullable().optional(),
});
export type RoleInput = z.input<typeof roleInput>;

export const roleTemplate = z.object({
  key: z.enum(ROLE_TEMPLATES),
  name: z.string(),
  description: z.string(),
  pages: z.array(z.string()),
  grants,
});

export const queueAssignee = z.object({
  employeeId: uuid.nullable(),
  userId: uuid,
  name: z.string(),
  via: z.enum(['holder', 'fallback']),
});

export const accessApi = {
  roles: endpoint({
    method: 'GET',
    path: '/api/v1/roles',
    auth: true,
    response: z.object({ items: z.array(role) }),
    summary: 'Roles',
  }),
  templates: endpoint({
    method: 'GET',
    path: '/api/v1/roles/templates',
    auth: true,
    response: z.object({ items: z.array(roleTemplate) }),
    summary: 'Built-in role templates to start a role from',
  }),
  createRole: endpoint({
    method: 'POST',
    path: '/api/v1/roles',
    auth: true,
    body: roleInput.extend({ templateKey: z.enum(ROLE_TEMPLATES).nullable().optional() }),
    response: role,
    summary: 'Create a custom role',
  }),
  getRole: endpoint({
    method: 'GET',
    path: '/api/v1/roles/:id',
    auth: true,
    params: z.object({ id: uuid }),
    response: role,
    summary: 'One role',
  }),
  updateRole: endpoint({
    method: 'PATCH',
    path: '/api/v1/roles/:id',
    auth: true,
    params: z.object({ id: uuid }),
    body: roleInput.partial(),
    response: role,
    summary: 'Change a role’s pages, rights or task queue settings',
  }),
  deleteRole: endpoint({
    method: 'DELETE',
    path: '/api/v1/roles/:id',
    auth: true,
    params: z.object({ id: uuid }),
    response: ok,
    summary: 'Delete a role (its assignments go with it)',
  }),
  members: endpoint({
    method: 'GET',
    path: '/api/v1/roles/:id/members',
    auth: true,
    params: z.object({ id: uuid }),
    response: z.object({ items: z.array(z.object({ userId: uuid, name: z.string(), email: z.string(), entityId: uuid.nullable() })) }),
    summary: 'Users holding a role',
  }),
  queue: endpoint({
    method: 'GET',
    path: '/api/v1/roles/:id/queue',
    auth: true,
    params: z.object({ id: uuid }),
    response: z.object({ items: z.array(queueAssignee) }),
    summary: 'Who receives a task routed to this role now',
  }),
  setUserRoles: endpoint({
    method: 'PUT',
    path: '/api/v1/users/:id/roles',
    auth: true,
    params: z.object({ id: uuid }),
    body: z.object({ assignments: z.array(roleAssignment) }),
    response: userRow,
    summary: 'Replace a user’s role assignments',
  }),
  check: endpoint({
    method: 'GET',
    path: '/api/v1/access/check',
    auth: true,
    query: z.object({ resource: z.string(), action: z.string(), employeeId: uuid.optional() }),
    response: z.object({ allowed: z.boolean(), scopes: z.array(scope) }),
    summary: 'Whether the current user may do an action (on one employee)',
  }),
};
