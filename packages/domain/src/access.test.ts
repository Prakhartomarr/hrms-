import type { Action, Scope, ScopeGrant } from '@hrms/contracts';
import { RES } from '@hrms/contracts';
import { describe, expect, it } from 'vitest';
import { covers, grantCovers, mergeAccess, scopesFor, type Target, type Viewer } from './access.js';
import { ROLE_TEMPLATE_DEFS } from './templates.js';

const tpl = (key: string) => {
  const t = ROLE_TEMPLATE_DEFS.find((x) => x.key === key)!;
  return { admin: false, pages: t.pages, grants: t.grants, entityId: null };
};

// A small org: ceo <- mgr <- (lead <- dev), mgr also functionally manages `fx` in another dept.
const viewer: Viewer = { employeeId: 'mgr', entityId: 'A', departmentId: 'eng' };
const T = (id: string, over: Partial<Target> = {}): Target => ({ id, entityId: 'A', departmentId: 'eng', managerChain: [], functionalManagerId: null, ...over });
const people = {
  self: T('mgr', { managerChain: ['ceo'] }),
  direct: T('lead', { managerChain: ['mgr', 'ceo'] }),
  indirect: T('dev', { managerChain: ['lead', 'mgr', 'ceo'] }),
  functional: T('fx', { departmentId: 'ops', managerChain: ['opsmgr'], functionalManagerId: 'mgr' }),
  sameDept: T('peer', { managerChain: ['ceo'] }),
  sameEntity: T('acct', { departmentId: 'fin', managerChain: ['cfo'] }),
  otherEntity: T('far', { entityId: 'B', departmentId: 'eng', managerChain: ['bboss'] }),
};

describe('scope matrix', () => {
  // scope -> who it covers, from the manager's point of view
  const matrix: Record<Scope, (keyof typeof people)[]> = {
    self: ['self'],
    team: ['self', 'direct', 'indirect', 'functional'],
    ou: ['self', 'direct', 'indirect', 'sameDept', 'otherEntity'],
    entity: ['self', 'direct', 'indirect', 'functional', 'sameDept', 'sameEntity'],
    all: Object.keys(people) as (keyof typeof people)[],
  };
  for (const [scope, yes] of Object.entries(matrix) as [Scope, (keyof typeof people)[]][]) {
    for (const who of Object.keys(people) as (keyof typeof people)[]) {
      const expected = yes.includes(who);
      it(`${scope} ${expected ? 'covers' : 'does not cover'} ${who}`, () => {
        expect(grantCovers({ scope, entityId: null }, viewer, people[who])).toBe(expected);
      });
    }
  }

  it('an entity-restricted grant only covers that entity', () => {
    const g: ScopeGrant = { scope: 'all', entityId: 'B' };
    expect(grantCovers(g, viewer, people.otherEntity)).toBe(true);
    expect(grantCovers(g, viewer, people.direct)).toBe(false);
  });

  it('a viewer with no employee record has no relative scope', () => {
    const nobody: Viewer = { employeeId: null, entityId: null, departmentId: null };
    for (const s of ['self', 'team', 'ou', 'entity'] as Scope[]) expect(grantCovers({ scope: s, entityId: null }, nobody, people.self)).toBe(false);
    expect(grantCovers({ scope: 'all', entityId: null }, nobody, people.self)).toBe(true);
  });
});

describe('mergeAccess()', () => {
  it('unions pages and keeps scope sets per action', () => {
    const a = mergeAccess([tpl('employee'), tpl('manager')]);
    expect(a.pages).toContain('org');
    expect(scopesFor(a, RES.employees, 'view').map((g) => g.scope).sort()).toEqual(['self', 'team']);
  });

  it('an unrestricted all absorbs narrower scopes', () => {
    const a = mergeAccess([tpl('manager'), tpl('hr')]);
    expect(scopesFor(a, RES.employees, 'view')).toEqual([{ scope: 'all', entityId: null }]);
  });

  it('keeps an entity-restricted all next to team', () => {
    const a = mergeAccess([tpl('manager'), { ...tpl('hr'), entityId: 'B' }]);
    const view = scopesFor(a, RES.employees, 'view');
    expect(view).toEqual(expect.arrayContaining([{ scope: 'team', entityId: null }, { scope: 'all', entityId: 'B' }]));
    expect(covers(view, viewer, people.indirect)).toBe(true);
    expect(covers(view, viewer, people.otherEntity)).toBe(true);
    expect(covers(view, viewer, people.sameEntity)).toBe(false);
  });

  it('admins hold everything', () => {
    const a = mergeAccess([{ admin: true, pages: [], grants: {}, entityId: null }]);
    expect(scopesFor(a, 'anything', 'delete')).toEqual([{ scope: 'all', entityId: null }]);
  });
});

describe('role templates', () => {
  // template -> resource/action -> expected scopes (empty = denied)
  const expectations: [string, string, Action, Scope[]][] = [
    ['employee', RES.employees, 'view', ['self']],
    ['employee', RES.employees, 'edit', []],
    ['employee', RES.salary, 'view', ['self']],
    ['employee', RES.import, 'add', []],
    ['manager', RES.employees, 'view', ['team']],
    ['manager', RES.salary, 'view', ['self']],
    ['manager', RES.employees, 'export', []],
    ['hr', RES.employees, 'edit', ['all']],
    ['hr', RES.pan, 'view', ['all']],
    ['hr', RES.salary, 'view', ['self']],
    ['hr', RES.import, 'add', ['all']],
    ['payroll_admin', RES.salary, 'view', ['all']],
    ['payroll_admin', RES.bank, 'view', ['all']],
    ['payroll_admin', RES.org, 'edit', []],
    ['finance', RES.salary, 'view', ['all']],
    ['finance', RES.employees, 'edit', []],
    ['cxo', RES.salary, 'view', ['all']],
    ['cxo', RES.employees, 'edit', []],
    ['cxo', RES.aadhaar, 'view', ['self']],
  ];
  it.each(expectations)('%s: %s %s -> %j', (key, res, act, scopes) => {
    const a = mergeAccess([tpl(key)]);
    expect(scopesFor(a, res, act).map((g) => g.scope)).toEqual(scopes);
  });

  it('there are exactly six templates', () => {
    expect(ROLE_TEMPLATE_DEFS.map((t) => t.key)).toEqual(['employee', 'manager', 'hr', 'payroll_admin', 'finance', 'cxo']);
  });
});
