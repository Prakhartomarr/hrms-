import type { ColumnType, Generated, JSONColumnType } from 'kysely';

/** A column with a database default: optional on insert. */
type Default<T> = ColumnType<T, T | undefined, T>;
type Ts = ColumnType<Date, Date | string | undefined, Date | string>;
type Json<T> = ColumnType<T, string | undefined, string>;

export interface TenantsTable {
  id: string;
  name: string;
  slug: string;
  settings: Json<Record<string, unknown>>;
  created_at: Generated<Date>;
}

export interface UsersTable {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  password_hash: string | null;
  employee_id: string | null;
  disabled_at: Ts | null;
  created_at: Generated<Date>;
}

export interface AuditLogTable {
  id: string;
  tenant_id: string;
  occurred_at: Generated<Date>;
  actor_user_id: string | null;
  actor_name: string | null;
  action: 'create' | 'update' | 'delete';
  entity_type: string;
  entity_id: string;
  entity_label: string | null;
  changes: JSONColumnType<{ field: string; before: unknown; after: unknown }[], string, string>;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
}

export interface OutboxEventTable {
  id: string;
  tenant_id: string;
  type: string;
  payload: JSONColumnType<Record<string, unknown>, string, string>;
  occurred_at: Generated<Date>;
  published_at: Ts | null;
  attempts: Generated<number>;
  last_error: string | null;
}

export interface LegalEntitiesTable {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  pan: string | null;
  tan: string | null;
  gstin: string | null;
  state: string | null;
  address: string | null;
  active: Default<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OrgUnitsTable {
  id: string;
  tenant_id: string;
  kind: string;
  code: string;
  name: string;
  parent_id: string | null;
  entity_id: string | null;
  head_employee_id: string | null;
  active: Default<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EmployeesTable {
  id: string;
  tenant_id: string;
  code: string;
  entity_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  display_name: string | null;
  gender: string | null;
  date_of_birth: string | null;
  marital_status: string | null;
  blood_group: string | null;
  nationality: string | null;
  father_name: string | null;
  work_email: string | null;
  personal_email: string | null;
  mobile: string | null;
  alternate_mobile: string | null;
  current_address: string | null;
  permanent_address: string | null;
  pan_enc: string | null;
  pan_hash: string | null;
  pan_masked: string | null;
  aadhaar_enc: string | null;
  aadhaar_hash: string | null;
  aadhaar_masked: string | null;
  passport_number: string | null;
  passport_expiry: string | null;
  uan: string | null;
  esic_number: string | null;
  bank_name: string | null;
  bank_account_enc: string | null;
  bank_account_masked: string | null;
  ifsc: string | null;
  account_holder_name: string | null;
  date_of_joining: string;
  employment_type: string;
  status: string;
  probation_end_date: string | null;
  exit_date: string | null;
  custom: Json<Record<string, Record<string, unknown>>>;
  designation_id: string | null;
  grade_id: string | null;
  business_unit_id: string | null;
  department_id: string | null;
  sub_department_id: string | null;
  location_id: string | null;
  cost_centre_id: string | null;
  manager_id: string | null;
  functional_manager_id: string | null;
  ctc_annual_paise: number | null;
  job_as_of: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EmployeeJobEventsTable {
  id: string;
  tenant_id: string;
  employee_id: string;
  effective_from: string;
  changes: JSONColumnType<Record<string, string | number | null>, string, string>;
  reason: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface RolesTable {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  template_key: string | null;
  is_system: Default<boolean>;
  is_admin: Default<boolean>;
  pages: Default<string[]>;
  grants: Json<Record<string, Record<string, string>>>;
  task_queue: Default<boolean>;
  fallback_employee_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UserRolesTable {
  id: string;
  tenant_id: string;
  user_id: string;
  role_id: string;
  entity_id: string | null;
  created_at: Generated<Date>;
}

export interface IdentitySessionsTable {
  id: string;
  tenant_id: string;
  user_id: string;
  user_agent: string | null;
  ip: string | null;
  method: Default<string>;
  mfa: Default<boolean>;
  created_at: Generated<Date>;
  last_seen_at: Default<Date>;
  revoked_at: Ts | null;
}

export interface IdentityRefreshTokensTable {
  id: string;
  tenant_id: string;
  user_id: string;
  session_id: string;
  expires_at: Ts;
  revoked_at: Ts | null;
  replaced_by: string | null;
  created_at: Generated<Date>;
}

export interface CodeSeriesTable {
  entity_id: string;
  tenant_id: string;
  pattern: string;
  next_number: Default<number>;
  updated_at: Default<Date>;
}

/** Core tables, owned by packages/db/migrations. Modules add their own via `db.as<T>()`. */
export interface CoreDatabase {
  tenants: TenantsTable;
  users: UsersTable;
  audit_log: AuditLogTable;
  outbox_event: OutboxEventTable;
  legal_entities: LegalEntitiesTable;
  org_units: OrgUnitsTable;
  employees: EmployeesTable;
  employee_job_events: EmployeeJobEventsTable;
  roles: RolesTable;
  user_roles: UserRolesTable;
  identity_sessions: IdentitySessionsTable;
  identity_refresh_tokens: IdentityRefreshTokensTable;
  code_series: CodeSeriesTable;
}
