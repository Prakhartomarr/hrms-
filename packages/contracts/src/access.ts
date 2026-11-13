import { z } from 'zod';

/**
 * The access model: three layers.
 * 1. Page access: which screens a user may open (`pages`).
 * 2. Action rights: what they may do with a resource (`view`, `add`, ...).
 * 3. Data scope: on whose records (`self` ... `all`), per resource and action.
 * Every rule is enforced on the server by the central guard; the web app only hides.
 */
export const ACTIONS = ['view', 'add', 'edit', 'delete', 'approve', 'export'] as const;
export type Action = (typeof ACTIONS)[number];
export const action = z.enum(ACTIONS);

/** Ordered narrow to wide, for display. Sets are unioned, not ranked (see ADR 0005). */
export const SCOPES = ['self', 'team', 'ou', 'entity', 'all'] as const;
export type Scope = (typeof SCOPES)[number];
export const scope = z.enum(SCOPES);

export const SCOPE_LABELS: Record<Scope, string> = {
  self: 'Self',
  team: 'Team (direct and indirect reports)',
  ou: 'Own department',
  entity: 'Own legal entity',
  all: 'Everyone',
};

/** A role's rights: resource id -> action -> scope. */
export const grants = z.record(z.string(), z.partialRecord(action, scope));
export type Grants = z.infer<typeof grants>;

/** One scope a user holds for a resource action, optionally limited to one legal entity. */
export interface ScopeGrant {
  scope: Scope;
  /** Set when the role was assigned for one legal entity only. */
  entityId: string | null;
}

/** A user's merged rights across all their roles. */
export interface EffectiveAccess {
  /** Administrators hold every page, action and scope. */
  admin: boolean;
  pages: string[];
  grants: Record<string, Partial<Record<Action, ScopeGrant[]>>>;
}

export const effectiveAccess = z.object({
  admin: z.boolean(),
  pages: z.array(z.string()),
  grants: z.record(
    z.string(),
    z.partialRecord(action, z.array(z.object({ scope, entityId: z.uuid().nullable() }))),
  ),
});

/** A resource a module protects, shown as a row in the role editor. */
export const resourceDef = z.object({
  id: z.string(),
  label: z.string(),
  group: z.string(),
  actions: z.array(action),
  /** False for settings-like resources where only `all` makes sense. */
  scoped: z.boolean(),
  /** Masked unless granted (PAN, Aadhaar, bank, salary). */
  sensitive: z.boolean().optional(),
});
export type ResourceDef = z.infer<typeof resourceDef>;

export const pageDef = z.object({ id: z.string(), label: z.string(), group: z.string().optional() });
export type PageDef = z.infer<typeof pageDef>;

/** Resource ids used across modules. Kept here so templates and guards agree. */
export const RES = {
  directory: 'people.directory',
  employees: 'people.employees',
  job: 'people.job',
  pan: 'people.pan',
  aadhaar: 'people.aadhaar',
  bank: 'people.bank',
  salary: 'people.salary',
  import: 'people.import',
  customFields: 'people.custom-fields',
  org: 'org.structure',
  roles: 'access.roles',
  users: 'identity.users',
  security: 'identity.security',
  audit: 'audit.log',
  policies: 'policy.policies',
} as const;

/** Sensitive field groups and the resource that unmasks each. */
export const SENSITIVE = {
  pan: RES.pan,
  aadhaar: RES.aadhaar,
  bank: RES.bank,
  salary: RES.salary,
} as const;
export type SensitiveField = keyof typeof SENSITIVE;

export const PAGES = {
  home: 'home',
  directory: 'directory',
  myProfile: 'profile.me',
  org: 'org',
  import: 'import',
  roles: 'roles',
  users: 'users',
  audit: 'audit',
  policies: 'policies',
  settings: 'settings',
} as const;
