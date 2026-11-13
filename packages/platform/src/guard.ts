/**
 * The central access guard. Every protected route and every query over employees goes through
 * here; nothing trusts the client. Three layers:
 *   page     requirePage()              which screens (and the API calls behind them)
 *   action   requireAction()            view / add / edit / delete / approve / export a resource
 *   scope    employeeScope(), requireOnEmployee(), visibleAmong()
 *            whose records: self, team, own department, own entity, all
 * The scope rules are written once as SQL here and once as a pure function in @hrms/domain
 * (`grantCovers`); tests hold the two to the same matrix.
 */
import type { Action, EffectiveAccess, ScopeGrant } from '@hrms/contracts';
import { sql, type CoreDatabase, type RawBuilder, type Transaction } from '@hrms/db';
import { canPage, mergeAccess, scopesFor, type Viewer } from '@hrms/domain';
import { currentContext } from './context.js';
import { AppError, unauthorized } from './errors.js';

type Trx = Transaction<CoreDatabase>;
const asCore = <DB>(trx: Transaction<DB>) => trx as unknown as Trx;

export interface Identity {
  userId: string;
  name: string;
  access: EffectiveAccess;
  viewer: Viewer;
}

/**
 * Reads who a user is now: their roles (merged), and their employee record's place in the org.
 * Null when the user is gone or disabled, or when the session has ended.
 */
export async function loadIdentity<DB>(db: Transaction<DB>, userId: string, sessionId?: string): Promise<Identity | null> {
  const trx = asCore(db);
  const u = await trx
    .selectFrom('users as u')
    .leftJoin('employees as e', 'e.id', 'u.employee_id')
    .select(['u.id', 'u.name', 'u.disabled_at', 'u.employee_id', 'e.entity_id', 'e.department_id'])
    .where('u.id', '=', userId)
    .executeTakeFirst();
  if (!u || u.disabled_at) return null;
  if (sessionId) {
    const live = await trx
      .selectFrom('identity_sessions')
      .select('id')
      .where('id', '=', sessionId)
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    if (!live) return null;
  }
  const roles = await trx
    .selectFrom('user_roles as ur')
    .innerJoin('roles as r', 'r.id', 'ur.role_id')
    .select(['r.is_admin', 'r.pages', 'r.grants', 'ur.entity_id'])
    .where('ur.user_id', '=', userId)
    .execute();
  const access = mergeAccess(
    roles.map((r) => ({ admin: r.is_admin, pages: r.pages, grants: r.grants as never, entityId: r.entity_id })),
  );
  return {
    userId,
    name: u.name,
    access,
    viewer: { employeeId: u.employee_id, entityId: u.entity_id ?? null, departmentId: u.department_id ?? null },
  };
}

function requireAccess(): { access: EffectiveAccess; viewer: Viewer } {
  const ctx = currentContext();
  if (!ctx?.access || !ctx.viewer) throw unauthorized();
  return { access: ctx.access, viewer: ctx.viewer };
}

/** The current user's merged access (401 when there is no user). */
export function currentAccess(): EffectiveAccess {
  return requireAccess().access;
}

export function hasPage(page: string): boolean {
  const ctx = currentContext();
  return !!ctx?.access && canPage(ctx.access, page);
}

export function requirePage(page: string): void {
  if (!canPage(requireAccess().access, page))
    throw new AppError('forbidden', 403, `You do not have access to the ${page} page`, { page });
}

export function scopesOf(resource: string, action: Action): ScopeGrant[] {
  const ctx = currentContext();
  if (!ctx?.access) return [];
  return scopesFor(ctx.access, resource, action);
}

export function hasAction(resource: string, action: Action): boolean {
  return scopesOf(resource, action).length > 0;
}

/** Throws 403 unless the user may do `action` on `resource` for at least someone. */
export function requireAction(resource: string, action: Action): ScopeGrant[] {
  requireAccess();
  const scopes = scopesOf(resource, action);
  if (scopes.length === 0)
    throw new AppError('forbidden', 403, `You do not have the right to ${action} ${resource}`, { resource, action });
  return scopes;
}

/** Throws 403 unless the user holds an unrestricted `all` (settings-like resources). */
export function requireGlobal(resource: string, action: Action): void {
  const scopes = requireAction(resource, action);
  if (!scopes.some((s) => s.scope === 'all' && s.entityId === null))
    throw new AppError('forbidden', 403, `You need organisation-wide ${action} rights on ${resource}`, { resource, action });
}

const lit = (id: string | null) => (id ? sql`${id}::uuid` : sql`NULL::uuid`);

/**
 * SQL predicate over an `employees` row aliased `alias`: true when the current user may do
 * `action` on `resource` for that employee. Use it in every query that lists employees.
 */
export function employeeScope(resource: string, action: Action, alias = 'e'): RawBuilder<boolean> {
  const ctx = currentContext();
  if (!ctx?.access || !ctx.viewer) return sql<boolean>`false`;
  return scopeSql(scopesFor(ctx.access, resource, action), ctx.viewer, alias);
}

export function scopeSql(grants: ScopeGrant[], viewer: Viewer, alias = 'e'): RawBuilder<boolean> {
  if (grants.length === 0) return sql<boolean>`false`;
  const e = sql.ref(alias);
  const me = viewer.employeeId;
  const parts = grants.map((g) => {
    let p: RawBuilder<unknown>;
    switch (g.scope) {
      case 'all':
        p = sql`true`;
        break;
      case 'entity':
        p = viewer.entityId ? sql`${e}.entity_id = ${lit(viewer.entityId)}` : sql`false`;
        break;
      case 'ou':
        p = viewer.departmentId ? sql`${e}.department_id = ${lit(viewer.departmentId)}` : sql`false`;
        break;
      case 'self':
        p = me ? sql`${e}.id = ${lit(me)}` : sql`false`;
        break;
      case 'team':
        p = me
          ? sql`(${e}.id = ${lit(me)} OR ${e}.functional_manager_id = ${lit(me)} OR ${e}.id IN (
              WITH RECURSIVE reports AS (
                SELECT r.id FROM employees r WHERE r.manager_id = ${lit(me)}
                UNION
                SELECT c.id FROM employees c JOIN reports ON c.manager_id = reports.id
              ) SELECT id FROM reports))`
          : sql`false`;
        break;
    }
    return g.entityId ? sql`(${p} AND ${e}.entity_id = ${lit(g.entityId)})` : sql`(${p})`;
  });
  return sql<boolean>`(${sql.join(parts, sql` OR `)})`;
}

export async function canOnEmployee<DB>(db: Transaction<DB>, resource: string, action: Action, employeeId: string): Promise<boolean> {
  const scopes = scopesOf(resource, action);
  if (scopes.length === 0) return false;
  const { rows } = await sql`SELECT 1 FROM employees e WHERE e.id = ${employeeId} AND ${employeeScope(resource, action)}`.execute(asCore(db));
  return rows.length > 0;
}

/** Throws 403 unless the user may do `action` on `resource` for this employee. */
export async function requireOnEmployee<DB>(db: Transaction<DB>, resource: string, action: Action, employeeId: string): Promise<void> {
  requireAction(resource, action);
  if (!(await canOnEmployee(db, resource, action, employeeId)))
    throw new AppError('forbidden', 403, `You may not ${action} this employee's ${resource.split('.').pop()}`, { resource, action });
}

/** Of `ids`, those the user may do `action` on (for masking a page of results in one query). */
export async function visibleAmong<DB>(db: Transaction<DB>, resource: string, action: Action, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0 || scopesOf(resource, action).length === 0) return new Set();
  const { rows } = await sql<{ id: string }>`SELECT e.id FROM employees e
    WHERE e.id = ANY(${ids}::uuid[]) AND ${employeeScope(resource, action)}`.execute(asCore(db));
  return new Set(rows.map((r) => r.id));
}
