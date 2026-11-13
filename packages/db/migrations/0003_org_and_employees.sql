-- Org structure and the employee master. These are core tables because the central access
-- guard reads them (data scope: team, department, entity) for every module.

CREATE TABLE legal_entities (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  code        text NOT NULL,
  name        text NOT NULL,
  pan         text,
  tan         text,
  gstin       text,
  state       text,
  address     text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE TRIGGER legal_entities_updated_at BEFORE UPDATE ON legal_entities
  FOR EACH ROW EXECUTE FUNCTION app_touch_updated_at();
SELECT app_enable_tenant_rls('legal_entities');

-- One table for every kind of org unit (ADR 0004). Sub-departments have a department parent.
CREATE TABLE org_units (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  kind              text NOT NULL CHECK (kind IN ('business_unit', 'location', 'department', 'sub_department', 'grade', 'designation', 'cost_centre')),
  code              text NOT NULL,
  name              text NOT NULL,
  parent_id         uuid REFERENCES org_units (id) ON DELETE RESTRICT,
  entity_id         uuid REFERENCES legal_entities (id) ON DELETE RESTRICT,
  head_employee_id  uuid,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind, code),
  CHECK (kind <> 'sub_department' OR parent_id IS NOT NULL)
);
CREATE INDEX org_units_kind_idx ON org_units (tenant_id, kind);
CREATE TRIGGER org_units_updated_at BEFORE UPDATE ON org_units
  FOR EACH ROW EXECUTE FUNCTION app_touch_updated_at();
SELECT app_enable_tenant_rls('org_units');

CREATE TABLE employees (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  code                 text NOT NULL,
  entity_id            uuid NOT NULL REFERENCES legal_entities (id) ON DELETE RESTRICT,
  -- personal
  first_name           text NOT NULL,
  middle_name          text,
  last_name            text,
  display_name         text,
  gender               text,
  date_of_birth        date,
  marital_status       text,
  blood_group          text,
  nationality          text,
  father_name          text,
  -- contact
  work_email           text,
  personal_email       text,
  mobile               text,
  alternate_mobile     text,
  current_address      text,
  permanent_address    text,
  -- identity: PAN and Aadhaar are encrypted at rest (AES-256-GCM), with a keyed hash for
  -- uniqueness and a stored mask for display (ADR 0006)
  pan_enc              text,
  pan_hash             text,
  pan_masked           text,
  aadhaar_enc          text,
  aadhaar_hash         text,
  aadhaar_masked       text,
  passport_number      text,
  passport_expiry      date,
  uan                  text,
  esic_number          text,
  -- bank
  bank_name            text,
  bank_account_enc     text,
  bank_account_masked  text,
  ifsc                 text,
  account_holder_name  text,
  -- employment
  date_of_joining      date NOT NULL,
  employment_type      text NOT NULL CHECK (employment_type IN ('permanent', 'probation', 'contract', 'intern', 'consultant')),
  status               text NOT NULL CHECK (status IN ('active', 'notice', 'exited', 'inactive')),
  probation_end_date   date,
  exit_date            date,
  custom               jsonb NOT NULL DEFAULT '{}',
  -- current job: derived from employee_job_events (latest change on or before job_as_of)
  designation_id       uuid REFERENCES org_units (id),
  grade_id             uuid REFERENCES org_units (id),
  business_unit_id     uuid REFERENCES org_units (id),
  department_id        uuid REFERENCES org_units (id),
  sub_department_id    uuid REFERENCES org_units (id),
  location_id          uuid REFERENCES org_units (id),
  cost_centre_id       uuid REFERENCES org_units (id),
  manager_id           uuid REFERENCES employees (id) ON DELETE SET NULL,
  functional_manager_id uuid REFERENCES employees (id) ON DELETE SET NULL,
  ctc_annual_paise     bigint,
  job_as_of            date,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE UNIQUE INDEX employees_pan_uq ON employees (tenant_id, pan_hash) WHERE pan_hash IS NOT NULL;
CREATE UNIQUE INDEX employees_aadhaar_uq ON employees (tenant_id, aadhaar_hash) WHERE aadhaar_hash IS NOT NULL;
CREATE UNIQUE INDEX employees_work_email_uq ON employees (tenant_id, lower(work_email)) WHERE work_email IS NOT NULL;
CREATE INDEX employees_manager_idx ON employees (tenant_id, manager_id);
CREATE INDEX employees_fmanager_idx ON employees (tenant_id, functional_manager_id);
CREATE INDEX employees_entity_idx ON employees (tenant_id, entity_id);
CREATE INDEX employees_department_idx ON employees (tenant_id, department_id);
CREATE TRIGGER employees_updated_at BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION app_touch_updated_at();
SELECT app_enable_tenant_rls('employees');

ALTER TABLE users ADD CONSTRAINT users_employee_fk FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE SET NULL;
CREATE UNIQUE INDEX users_employee_uq ON users (tenant_id, employee_id) WHERE employee_id IS NOT NULL;
ALTER TABLE org_units ADD CONSTRAINT org_units_head_fk FOREIGN KEY (head_employee_id) REFERENCES employees (id) ON DELETE SET NULL;

-- Effective-dated job history. Each row sets only the attributes it changes (NULL in a
-- *_set column = unchanged), from effective_from on.
CREATE TABLE employee_job_events (
  id                     uuid PRIMARY KEY,
  tenant_id              uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  employee_id            uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  effective_from         date NOT NULL,
  -- { designationId: "...", managerId: null, ctcAnnualPaise: 1200000, ... } (only keys changed)
  changes                jsonb NOT NULL,
  reason                 text,
  created_by             uuid,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employee_job_events_idx ON employee_job_events (tenant_id, employee_id, effective_from);
CREATE INDEX employee_job_events_day_idx ON employee_job_events (tenant_id, effective_from);
SELECT app_enable_tenant_rls('employee_job_events');

-- Roles: page access + action rights with data scope, per role. Users hold several.
CREATE TABLE roles (
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name                  text NOT NULL,
  description           text,
  template_key          text,
  is_system             boolean NOT NULL DEFAULT false,
  is_admin              boolean NOT NULL DEFAULT false,
  pages                 text[] NOT NULL DEFAULT '{}',
  -- { "people.employees": { "view": "team", "edit": "self" }, ... }
  grants                jsonb NOT NULL DEFAULT '{}',
  task_queue            boolean NOT NULL DEFAULT false,
  fallback_employee_id  uuid REFERENCES employees (id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX roles_name_uq ON roles (tenant_id, lower(name));
CREATE TRIGGER roles_updated_at BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION app_touch_updated_at();
SELECT app_enable_tenant_rls('roles');

-- A role held by a user, everywhere (entity_id NULL) or inside one legal entity.
CREATE TABLE user_roles (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id     uuid NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  entity_id   uuid REFERENCES legal_entities (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_roles_uq ON user_roles (user_id, role_id, coalesce(entity_id, '00000000-0000-0000-0000-000000000000'));
CREATE INDEX user_roles_role_idx ON user_roles (tenant_id, role_id);
SELECT app_enable_tenant_rls('user_roles');
