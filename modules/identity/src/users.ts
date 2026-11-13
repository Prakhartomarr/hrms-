import { randomUUID } from 'node:crypto';
import { api, RES, type UserRow } from '@hrms/contracts';
import { employeeName } from '@hrms/domain';
import { route, type ModuleApp, type ModuleContext } from '@hrms/module-sdk';
import { AppError, badRequest, currentAccess, hashPassword, notFound, recordAudit, requireGlobal, requireTenantId, requireUserId } from '@hrms/platform';
import { endUserSessions } from './sessions.js';
import type { Trx } from './tables.js';

const I = api.identity;

export async function userRows(trx: Trx, ids?: string[]): Promise<UserRow[]> {
  let q = trx
    .selectFrom('users as u')
    .leftJoin('employees as e', 'e.id', 'u.employee_id')
    .leftJoin('identity_mfa as m', 'm.user_id', 'u.id')
    .select(['u.id', 'u.email', 'u.name', 'u.disabled_at', 'u.created_at', 'e.id as eid', 'e.code', 'e.first_name', 'e.middle_name', 'e.last_name', 'e.display_name', 'm.enabled_at'])
    .orderBy('u.name');
  if (ids) q = q.where('u.id', 'in', ids.length ? ids : [randomUUID()]);
  const users = await q.execute();
  const roles = await trx
    .selectFrom('user_roles as ur')
    .innerJoin('roles as r', 'r.id', 'ur.role_id')
    .select(['ur.user_id', 'ur.role_id', 'ur.entity_id', 'r.name'])
    .where('ur.user_id', 'in', users.length ? users.map((u) => u.id) : [randomUUID()])
    .orderBy('r.name')
    .execute();
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    status: u.disabled_at ? ('disabled' as const) : ('active' as const),
    employee: u.eid ? { id: u.eid, code: u.code!, name: employeeName({ first_name: u.first_name!, middle_name: u.middle_name, last_name: u.last_name, display_name: u.display_name }) } : null,
    roles: roles.filter((r) => r.user_id === u.id).map((r) => ({ roleId: r.role_id, name: r.name, entityId: r.entity_id })),
    twoFactorEnabled: !!u.enabled_at,
    createdAt: new Date(u.created_at).toISOString(),
  }));
}

async function oneUser(trx: Trx, id: string): Promise<UserRow> {
  const [row] = await userRows(trx, [id]);
  if (!row) throw notFound('User');
  return row;
}

/**
 * Role assignment rules that stop privilege escalation: only administrators hand out the
 * Administrator role, and nobody changes their own roles.
 */
async function writeAssignments(trx: Trx, userId: string, assignments: { roleId: string; entityId: string | null }[]): Promise<void> {
  const access = currentAccess();
  if (userId === requireUserId()) throw new AppError('forbidden', 403, 'You cannot change your own roles');
  const roleIds = [...new Set(assignments.map((a) => a.roleId))];
  const roles = roleIds.length ? await trx.selectFrom('roles').select(['id', 'is_admin', 'name']).where('id', 'in', roleIds).execute() : [];
  if (roles.length !== roleIds.length) throw badRequest('Unknown role');
  const currentAdmin = await trx
    .selectFrom('user_roles as ur')
    .innerJoin('roles as r', 'r.id', 'ur.role_id')
    .select('r.id')
    .where('ur.user_id', '=', userId)
    .where('r.is_admin', '=', true)
    .executeTakeFirst();
  const grantsAdmin = roles.some((r) => r.is_admin);
  if ((grantsAdmin || currentAdmin) && !access.admin) throw new AppError('forbidden', 403, 'Only an administrator can give or take the Administrator role');
  const before = await trx.selectFrom('user_roles as ur').innerJoin('roles as r', 'r.id', 'ur.role_id').select(['r.name', 'ur.entity_id']).where('ur.user_id', '=', userId).execute();
  await trx.deleteFrom('user_roles').where('user_id', '=', userId).execute();
  const seen = new Set<string>();
  for (const a of assignments) {
    const key = `${a.roleId}:${a.entityId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await trx.insertInto('user_roles').values({ id: randomUUID(), tenant_id: requireTenantId(), user_id: userId, role_id: a.roleId, entity_id: a.entityId }).execute();
  }
  const label = (rs: { name: string; entity_id: string | null }[]) => rs.map((r) => (r.entity_id ? `${r.name} (${r.entity_id})` : r.name)).sort().join(', ');
  const after = assignments.map((a) => ({ name: roles.find((r) => r.id === a.roleId)!.name, entity_id: a.entityId }));
  await recordAudit(trx, { action: 'update', entityType: 'user.roles', entityId: userId, before: { roles: label(before) }, after: { roles: label(after) } });
}

export function userRoutes(app: ModuleApp, ctx: ModuleContext): void {
  route(app, I.users, { page: 'users', access: { resource: RES.users, action: 'view' } }, async () => ({
    items: await ctx.db.tx((trx: Trx) => userRows(trx)),
  }));

  route(app, I.createUser, { page: 'users', access: { resource: RES.users, action: 'add' }, status: 201 }, async ({ body }) => {
    requireGlobal(RES.users, 'add');
    const passwordHash = await hashPassword(body.password);
    return ctx.db.tx(async (trx: Trx) => {
      const id = randomUUID();
      if (body.employeeId) {
        const e = await trx.selectFrom('employees').select('id').where('id', '=', body.employeeId).executeTakeFirst();
        if (!e) throw badRequest('Unknown employee');
      }
      await trx.insertInto('users').values({ id, tenant_id: requireTenantId(), email: body.email, name: body.name, password_hash: passwordHash, employee_id: body.employeeId }).execute();
      await recordAudit(trx, { action: 'create', entityType: 'user', entityId: id, entityLabel: body.email, after: { email: body.email, name: body.name, employeeId: body.employeeId } });
      if (body.roles.length) await writeAssignments(trx, id, body.roles);
      return oneUser(trx, id);
    });
  });

  route(app, I.updateUser, { page: 'users', access: { resource: RES.users, action: 'edit' } }, async ({ params, body }) => {
    requireGlobal(RES.users, 'edit');
    if (body.disabled && params.id === requireUserId()) throw badRequest('You cannot disable your own account');
    const row = await ctx.db.tx(async (trx: Trx) => {
      const u = await trx.selectFrom('users').selectAll().where('id', '=', params.id).forUpdate().executeTakeFirst();
      if (!u) throw notFound('User');
      const next = {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.employeeId !== undefined ? { employee_id: body.employeeId } : {}),
        ...(body.disabled !== undefined ? { disabled_at: body.disabled ? (u.disabled_at ?? new Date()) : null } : {}),
      };
      if (Object.keys(next).length) await trx.updateTable('users').set(next).where('id', '=', u.id).execute();
      if (body.disabled) await endUserSessions(trx, u.id);
      await recordAudit(trx, {
        action: 'update',
        entityType: 'user',
        entityId: u.id,
        entityLabel: u.email,
        before: { name: u.name, employeeId: u.employee_id, disabled: !!u.disabled_at },
        after: { name: body.name ?? u.name, employeeId: body.employeeId !== undefined ? body.employeeId : u.employee_id, disabled: body.disabled ?? !!u.disabled_at },
      });
      return oneUser(trx, u.id);
    });
    ctx.accessChanged(requireTenantId(), params.id);
    return row;
  });

  route(app, I.setUserRoles, { page: 'users', access: { resource: RES.users, action: 'edit' } }, async ({ params, body }) => {
    requireGlobal(RES.users, 'edit');
    const row = await ctx.db.tx(async (trx: Trx) => {
      const u = await trx.selectFrom('users').select('id').where('id', '=', params.id).executeTakeFirst();
      if (!u) throw notFound('User');
      await writeAssignments(trx, u.id, body.assignments);
      return oneUser(trx, u.id);
    });
    ctx.accessChanged(requireTenantId(), params.id);
    return row;
  });
}
