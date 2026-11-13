import { PAGES, RES, type Grants, type RoleTemplateKey } from '@hrms/contracts';

export interface RoleTemplate {
  key: RoleTemplateKey;
  name: string;
  description: string;
  pages: string[];
  grants: Grants;
}

const selfService: Grants = {
  [RES.directory]: { view: 'all' },
  [RES.org]: { view: 'all' },
  [RES.employees]: { view: 'self' },
  [RES.job]: { view: 'self' },
  [RES.pan]: { view: 'self' },
  [RES.aadhaar]: { view: 'self' },
  [RES.bank]: { view: 'self' },
  [RES.salary]: { view: 'self' },
};

const merge = (...parts: Grants[]): Grants => {
  const out: Grants = {};
  for (const p of parts) for (const [r, a] of Object.entries(p)) out[r] = { ...out[r], ...a };
  return out;
};

/**
 * The six starting roles. A workspace gets a copy of each on creation and may change them.
 * Our own defaults, written from common Indian HR practice; HR sees identity documents but not
 * salary, payroll sees salary and bank but cannot restructure the org.
 */
export const ROLE_TEMPLATE_DEFS: RoleTemplate[] = [
  {
    key: 'employee',
    name: 'Employee',
    description: 'Self-service: own profile, the company directory.',
    pages: [PAGES.home, PAGES.directory, PAGES.myProfile],
    grants: selfService,
  },
  {
    key: 'manager',
    name: 'Manager',
    description: 'Self-service plus the profiles and job history of their team.',
    pages: [PAGES.home, PAGES.directory, PAGES.myProfile, PAGES.org],
    grants: merge(selfService, {
      [RES.employees]: { view: 'team', approve: 'team' },
      [RES.job]: { view: 'team' },
      [RES.org]: { view: 'all' },
    }),
  },
  {
    key: 'hr',
    name: 'HR',
    description: 'Runs the employee master: add, edit, import, export. Salary stays masked.',
    pages: [PAGES.home, PAGES.directory, PAGES.myProfile, PAGES.org, PAGES.import, PAGES.audit, PAGES.policies],
    grants: merge(selfService, {
      [RES.employees]: { view: 'all', add: 'all', edit: 'all', delete: 'all', approve: 'all', export: 'all' },
      [RES.job]: { view: 'all', edit: 'all' },
      [RES.pan]: { view: 'all', edit: 'all' },
      [RES.aadhaar]: { view: 'all', edit: 'all' },
      [RES.bank]: { view: 'self' },
      [RES.import]: { add: 'all' },
      [RES.customFields]: { view: 'all', add: 'all', edit: 'all' },
      [RES.org]: { view: 'all', add: 'all', edit: 'all', delete: 'all' },
      [RES.audit]: { view: 'all' },
      [RES.policies]: { view: 'all', add: 'all', edit: 'all' },
    }),
  },
  {
    key: 'payroll_admin',
    name: 'Payroll admin',
    description: 'Salary, bank and statutory identifiers for everyone; no org changes.',
    pages: [PAGES.home, PAGES.directory, PAGES.myProfile, PAGES.policies],
    grants: merge(selfService, {
      [RES.employees]: { view: 'all', export: 'all' },
      [RES.job]: { view: 'all', edit: 'all' },
      [RES.pan]: { view: 'all', edit: 'all' },
      [RES.bank]: { view: 'all', edit: 'all' },
      [RES.salary]: { view: 'all', edit: 'all' },
      [RES.policies]: { view: 'all', add: 'all', edit: 'all' },
      [RES.org]: { view: 'all' },
    }),
  },
  {
    key: 'finance',
    name: 'Finance',
    description: 'Read-only cost view: salary and cost centres, exports for reporting.',
    pages: [PAGES.home, PAGES.directory, PAGES.myProfile, PAGES.org],
    grants: merge(selfService, {
      [RES.employees]: { view: 'all', export: 'all' },
      [RES.job]: { view: 'all' },
      [RES.salary]: { view: 'all' },
      [RES.org]: { view: 'all' },
    }),
  },
  {
    key: 'cxo',
    name: 'CXO',
    description: 'Sees the whole organisation, salary included; changes nothing.',
    pages: [PAGES.home, PAGES.directory, PAGES.myProfile, PAGES.org, PAGES.audit],
    grants: merge(selfService, {
      [RES.employees]: { view: 'all', approve: 'all', export: 'all' },
      [RES.job]: { view: 'all' },
      [RES.salary]: { view: 'all' },
      [RES.org]: { view: 'all' },
      [RES.audit]: { view: 'all' },
    }),
  },
];

export const ADMIN_ROLE = {
  name: 'Administrator',
  description: 'Every page, action and record. Given to whoever creates the workspace.',
} as const;
