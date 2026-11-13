import {
  ACTIONS,
  type Action,
  type EffectiveAccess,
  type Grants,
  type Scope,
  type ScopeGrant,
} from '@hrms/contracts';

/** A role as the access engine sees it, plus the entity it was assigned for (if any). */
export interface AssignedRole {
  admin: boolean;
  pages: string[];
  grants: Grants;
  /** The role holds only inside this legal entity. Null: everywhere. */
  entityId: string | null;
}

/**
 * Merges a user's roles into one effective access. Pages and actions are unioned. Scopes are
 * kept as a set per action (never ranked): `team` and `entity` are different people, and a user
 * holding both sees the union. An unrestricted `all` absorbs everything else.
 */
export function mergeAccess(roles: AssignedRole[]): EffectiveAccess {
  const admin = roles.some((r) => r.admin);
  const pages = new Set<string>();
  const grants: EffectiveAccess['grants'] = {};
  for (const r of roles) {
    for (const p of r.pages) pages.add(p);
    for (const [resource, actions] of Object.entries(r.grants)) {
      for (const a of ACTIONS) {
        const s = actions[a];
        if (!s) continue;
        const list = ((grants[resource] ??= {})[a] ??= []);
        const g: ScopeGrant = { scope: s, entityId: r.entityId };
        if (!list.some((x) => x.scope === g.scope && x.entityId === g.entityId)) list.push(g);
      }
    }
  }
  for (const actions of Object.values(grants)) {
    for (const a of ACTIONS) {
      const list = actions[a];
      if (list?.some((g) => g.scope === 'all' && g.entityId === null))
        actions[a] = [{ scope: 'all', entityId: null }];
    }
  }
  return { admin, pages: [...pages].sort(), grants };
}

/** The scopes a user holds for an action; admins hold `all`. Empty: not allowed at all. */
export function scopesFor(access: EffectiveAccess, resource: string, action: Action): ScopeGrant[] {
  if (access.admin) return [{ scope: 'all', entityId: null }];
  return access.grants[resource]?.[action] ?? [];
}

export function canPage(access: EffectiveAccess, page: string): boolean {
  return access.admin || access.pages.includes(page);
}

/** The viewer's own place in the org, which the relative scopes are measured from. */
export interface Viewer {
  employeeId: string | null;
  entityId: string | null;
  departmentId: string | null;
}

/** What the scope rules need to know about the employee being looked at. */
export interface Target {
  id: string;
  entityId: string | null;
  departmentId: string | null;
  /** Primary managers upward: [manager, manager's manager, ...]. */
  managerChain: string[];
  functionalManagerId: string | null;
}

/**
 * Whether one scope grant covers a target employee.
 * - self: the viewer's own record
 * - team: self, direct and indirect reports (primary line), and functional reports
 * - ou: everyone in the viewer's department (sub-departments included)
 * - entity: everyone in the viewer's legal entity
 * - all: everyone
 * A grant assigned for one entity also requires the target to be in that entity.
 */
export function grantCovers(g: ScopeGrant, viewer: Viewer, t: Target): boolean {
  if (g.entityId && t.entityId !== g.entityId) return false;
  const me = viewer.employeeId;
  switch (g.scope) {
    case 'all':
      return true;
    case 'entity':
      return !!viewer.entityId && t.entityId === viewer.entityId;
    case 'ou':
      return !!viewer.departmentId && t.departmentId === viewer.departmentId;
    case 'team':
      return !!me && (t.id === me || t.managerChain.includes(me) || t.functionalManagerId === me);
    case 'self':
      return !!me && t.id === me;
  }
}

export function covers(grants: ScopeGrant[], viewer: Viewer, t: Target): boolean {
  return grants.some((g) => grantCovers(g, viewer, t));
}

export const SCOPE_ORDER: Scope[] = ['self', 'team', 'ou', 'entity', 'all'];
