-- Employee code pattern and running number per legal entity (see @hrms/domain code-series).
CREATE TABLE code_series (
  entity_id    uuid PRIMARY KEY REFERENCES legal_entities (id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  pattern      text NOT NULL,
  next_number  int NOT NULL DEFAULT 1 CHECK (next_number >= 1),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
SELECT app_enable_tenant_rls('code_series');
