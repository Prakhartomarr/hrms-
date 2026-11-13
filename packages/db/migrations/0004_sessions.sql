-- Sign-in sessions (one per device sign-in) and their rotating refresh tokens. Core tables:
-- the request guard reads them on every call, so ending a session takes effect in seconds.
CREATE TABLE identity_sessions (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  user_agent    text,
  ip            text,
  -- password | sso:google | sso:microsoft; and whether a second factor was passed
  method        text NOT NULL DEFAULT 'password',
  mfa           boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);
CREATE INDEX identity_sessions_user_idx ON identity_sessions (tenant_id, user_id) WHERE revoked_at IS NULL;
SELECT app_enable_tenant_rls('identity_sessions');

CREATE TABLE identity_refresh_tokens (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  session_id   uuid NOT NULL REFERENCES identity_sessions (id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  replaced_by  uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX identity_refresh_tokens_session_idx ON identity_refresh_tokens (tenant_id, session_id);
SELECT app_enable_tenant_rls('identity_refresh_tokens');
