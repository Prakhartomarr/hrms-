-- Tenants and user accounts. Every tenant-owned table carries tenant_id and the
-- tenant_isolation policy (row-level security), forced even for the table owner.

CREATE TABLE tenants (
  id          uuid PRIMARY KEY,
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  -- require2fa, setupCompletedAt, ...
  settings    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenants
  USING (id = app_current_tenant()) WITH CHECK (id = app_current_tenant());

CREATE TABLE users (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  email          text NOT NULL,
  name           text NOT NULL,
  password_hash  text,
  employee_id    uuid,
  disabled_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);
CREATE INDEX users_email_idx ON users (lower(email));
SELECT app_enable_tenant_rls('users');

-- Field-level audit log: one row per create, update or delete of master data or settings.
-- Append-only: the runtime role may insert and read, never update or delete.
CREATE TABLE audit_log (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_name    text,
  action        text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  entity_type   text NOT NULL,
  entity_id     text NOT NULL,
  entity_label  text,
  -- [{ field, before, after }]; sensitive values are redacted
  changes       jsonb NOT NULL DEFAULT '[]',
  ip            text,
  user_agent    text,
  request_id    text
);
CREATE INDEX audit_log_entity_idx ON audit_log (tenant_id, entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_log_time_idx ON audit_log (tenant_id, occurred_at DESC);
SELECT app_enable_tenant_rls('audit_log');
REVOKE UPDATE, DELETE ON audit_log FROM app_runtime;

-- Transactional outbox: written in the same transaction as the change it announces,
-- relayed to module subscribers by the outbox relay job.
CREATE TABLE outbox_event (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  type          text NOT NULL,
  payload       jsonb NOT NULL,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz,
  attempts      int NOT NULL DEFAULT 0,
  last_error    text
);
CREATE INDEX outbox_unpublished_idx ON outbox_event (occurred_at) WHERE published_at IS NULL;
SELECT app_enable_tenant_rls('outbox_event');
