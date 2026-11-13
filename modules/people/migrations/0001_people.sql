-- Repeatable profile sections: family and nominees, education, experience, emergency
-- contacts and documents. `data` is validated by the section's schema in @hrms/contracts.
CREATE TABLE employee_records (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  employee_id  uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  section      text NOT NULL CHECK (section IN ('family', 'education', 'experience', 'emergency', 'documents')),
  data         jsonb NOT NULL,
  -- documents only: where the uploaded file is stored
  file_key     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employee_records_idx ON employee_records (tenant_id, employee_id, section);
CREATE TRIGGER employee_records_updated_at BEFORE UPDATE ON employee_records
  FOR EACH ROW EXECUTE FUNCTION app_touch_updated_at();
SELECT app_enable_tenant_rls('employee_records');

-- Custom fields per profile section; values live in employees.custom[section][key].
CREATE TABLE custom_field_defs (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  section     text NOT NULL,
  key         text NOT NULL,
  label       text NOT NULL,
  type        text NOT NULL CHECK (type IN ('text', 'number', 'date', 'select', 'boolean', 'email')),
  required    boolean NOT NULL DEFAULT false,
  options     jsonb NOT NULL DEFAULT '[]',
  validation  jsonb NOT NULL DEFAULT '{}',
  position    int NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, section, key)
);
SELECT app_enable_tenant_rls('custom_field_defs');
