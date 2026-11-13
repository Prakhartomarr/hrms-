-- Runtime role. Login users (e.g. hrms_app) are granted this role; row-level
-- security always applies to it. The schema owner (migrations) bypasses RLS.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;

-- Current tenant for this transaction, set by the platform with
-- SELECT set_config('app.tenant_id', $1, true). NULL when unset: no rows match.
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

-- Applies the standard tenant isolation policy to a table with a tenant_id column.
-- Modules call this from their own migrations: SELECT app_enable_tenant_rls('my_table');
CREATE OR REPLACE FUNCTION app_enable_tenant_rls(tbl regclass) RETURNS void
  LANGUAGE plpgsql AS
$$ BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', tbl);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())',
    tbl);
END $$;

CREATE OR REPLACE FUNCTION app_touch_updated_at() RETURNS trigger
  LANGUAGE plpgsql AS
$$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
