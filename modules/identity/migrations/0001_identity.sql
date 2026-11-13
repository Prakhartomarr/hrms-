-- TOTP second factor per user. The secret is sealed with the platform key (AES-256-GCM).
CREATE TABLE identity_mfa (
  user_id             uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  tenant_id           uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  secret_enc          text,
  pending_secret_enc  text,
  enabled_at          timestamptz,
  -- Last accepted time step: a code is never accepted twice.
  last_counter        bigint,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
SELECT app_enable_tenant_rls('identity_mfa');

CREATE TABLE identity_password_resets (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
SELECT app_enable_tenant_rls('identity_password_resets');

-- Sign-in happens before a tenant is known, so the email lookup crosses tenants. These
-- SECURITY DEFINER functions are the only cross-tenant reads the runtime role can make, and
-- they return only what sign-in and password reset need.
CREATE OR REPLACE FUNCTION identity_find_login(p_email text)
RETURNS TABLE (user_id uuid, tenant_id uuid, tenant_slug text, tenant_name text, password_hash text, disabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT u.id, u.tenant_id, t.slug, t.name, u.password_hash, u.disabled_at IS NOT NULL
    FROM users u JOIN tenants t ON t.id = u.tenant_id
   WHERE lower(u.email) = lower(p_email)
$$;
REVOKE ALL ON FUNCTION identity_find_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity_find_login(text) TO app_runtime;

CREATE OR REPLACE FUNCTION identity_find_reset(p_token_hash text)
RETURNS TABLE (reset_id uuid, tenant_id uuid, user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT r.id, r.tenant_id, r.user_id FROM identity_password_resets r WHERE r.token_hash = p_token_hash $$;
REVOKE ALL ON FUNCTION identity_find_reset(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity_find_reset(text) TO app_runtime;

-- Workspace slugs are unique across tenants; signup must check one it cannot see.
CREATE OR REPLACE FUNCTION identity_slug_taken(p_slug text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM tenants WHERE slug = p_slug) $$;
REVOKE ALL ON FUNCTION identity_slug_taken(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity_slug_taken(text) TO app_runtime;
