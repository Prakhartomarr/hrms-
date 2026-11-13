import { z } from 'zod';
import { effectiveAccess } from '../access.js';
import { emailInput, isoDateTime, ok, password, uuid } from '../primitives.js';
import { endpoint } from './endpoint.js';

export const tokenPair = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Access token lifetime in seconds. */
  expiresIn: z.number().int(),
});
export type TokenPair = z.infer<typeof tokenPair>;

/** What a sign-in step answers. A second factor, or setting one up, may be needed first. */
export const loginResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), tokens: tokenPair }),
  z.object({ status: z.literal('mfa_required'), mfaToken: z.string() }),
  /** The organisation requires 2FA and this user has not set it up yet. */
  z.object({ status: z.literal('mfa_setup_required'), mfaToken: z.string() }),
  /** The email has accounts in several workspaces: send again with `tenantSlug`. */
  z.object({
    status: z.literal('choose_workspace'),
    workspaces: z.array(z.object({ slug: z.string(), name: z.string() })),
  }),
]);
export type LoginResult = z.infer<typeof loginResult>;

export const totpSetup = z.object({
  /** Base32 secret, for typing into an authenticator by hand. */
  secret: z.string(),
  otpauthUrl: z.string(),
  /** The otpauth URL as an SVG QR code. */
  qrSvg: z.string(),
});
export type TotpSetup = z.infer<typeof totpSetup>;

const totpCode = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');

export const me = z.object({
  user: z.object({ id: uuid, email: z.string(), name: z.string() }),
  tenant: z.object({
    id: uuid,
    name: z.string(),
    slug: z.string(),
    setupCompleted: z.boolean(),
  }),
  employee: z.object({ id: uuid, code: z.string(), name: z.string() }).nullable(),
  access: effectiveAccess,
  twoFactor: z.object({ enabled: z.boolean(), required: z.boolean() }),
});
export type Me = z.infer<typeof me>;

export const session = z.object({
  id: uuid,
  device: z.string(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  createdAt: isoDateTime,
  lastSeenAt: isoDateTime,
  current: z.boolean(),
});
export type Session = z.infer<typeof session>;

export const ssoProvider = z.object({
  id: z.enum(['google', 'microsoft']),
  label: z.string(),
  enabled: z.boolean(),
});

export const userRow = z.object({
  id: uuid,
  email: z.string(),
  name: z.string(),
  status: z.enum(['active', 'disabled']),
  employee: z.object({ id: uuid, code: z.string(), name: z.string() }).nullable(),
  roles: z.array(z.object({ roleId: uuid, name: z.string(), entityId: uuid.nullable() })),
  twoFactorEnabled: z.boolean(),
  createdAt: isoDateTime,
});
export type UserRow = z.infer<typeof userRow>;

export const roleAssignment = z.object({ roleId: uuid, entityId: uuid.nullable().default(null) });

export const securitySettings = z.object({ require2fa: z.boolean() });

export const identityApi = {
  signup: endpoint({
    method: 'POST',
    path: '/api/v1/auth/signup',
    auth: false,
    body: z.object({
      workspaceName: z.string().trim().min(2).max(120),
      name: z.string().trim().min(1).max(120),
      email: emailInput,
      password,
    }),
    response: loginResult,
    summary: 'Create a workspace and its first administrator',
  }),
  login: endpoint({
    method: 'POST',
    path: '/api/v1/auth/login',
    auth: false,
    body: z.object({ email: emailInput, password: z.string().min(1), tenantSlug: z.string().optional() }),
    response: loginResult,
    summary: 'Sign in with email and password',
  }),
  login2fa: endpoint({
    method: 'POST',
    path: '/api/v1/auth/login/2fa',
    auth: false,
    body: z.object({ mfaToken: z.string(), code: totpCode }),
    response: loginResult,
    summary: 'Finish sign-in with an authenticator code',
  }),
  login2faSetup: endpoint({
    method: 'POST',
    path: '/api/v1/auth/login/2fa/setup',
    auth: false,
    body: z.object({ mfaToken: z.string() }),
    response: totpSetup,
    summary: 'Start 2FA setup during sign-in (organisation requires 2FA)',
  }),
  login2faEnable: endpoint({
    method: 'POST',
    path: '/api/v1/auth/login/2fa/enable',
    auth: false,
    body: z.object({ mfaToken: z.string(), code: totpCode }),
    response: loginResult,
    summary: 'Confirm 2FA setup during sign-in and finish signing in',
  }),
  refresh: endpoint({
    method: 'POST',
    path: '/api/v1/auth/refresh',
    auth: false,
    body: z.object({ refreshToken: z.string() }),
    response: tokenPair,
    summary: 'Rotate the refresh token',
  }),
  logout: endpoint({
    method: 'POST',
    path: '/api/v1/auth/logout',
    auth: true,
    response: ok,
    summary: 'End this session',
  }),
  forgot: endpoint({
    method: 'POST',
    path: '/api/v1/auth/forgot-password',
    auth: false,
    body: z.object({ email: emailInput }),
    response: ok,
    summary: 'Email a password reset link (same answer whether or not the email exists)',
  }),
  reset: endpoint({
    method: 'POST',
    path: '/api/v1/auth/reset-password',
    auth: false,
    body: z.object({ token: z.string().min(20).max(200), password }),
    response: ok,
    summary: 'Set a new password with a reset link; ends every session',
  }),
  ssoProviders: endpoint({
    method: 'GET',
    path: '/api/v1/auth/sso/providers',
    auth: false,
    response: z.object({ items: z.array(ssoProvider) }),
    summary: 'Single sign-on providers and whether each is configured',
  }),
  ssoStart: endpoint({
    method: 'GET',
    path: '/api/v1/auth/sso/:provider/start',
    auth: false,
    params: z.object({ provider: z.enum(['google', 'microsoft']) }),
    response: z.object({ url: z.string() }),
    summary: 'Where to send the browser to sign in with a provider (stub)',
  }),
  me: endpoint({
    method: 'GET',
    path: '/api/v1/me',
    auth: true,
    response: me,
    summary: 'The signed-in user, their workspace and their effective access',
  }),
  totpSetup: endpoint({
    method: 'POST',
    path: '/api/v1/me/2fa/setup',
    auth: true,
    response: totpSetup,
    summary: 'Start setting up an authenticator app',
  }),
  totpEnable: endpoint({
    method: 'POST',
    path: '/api/v1/me/2fa/enable',
    auth: true,
    body: z.object({ code: totpCode }),
    response: ok,
    summary: 'Confirm the authenticator code and turn 2FA on',
  }),
  totpDisable: endpoint({
    method: 'POST',
    path: '/api/v1/me/2fa/disable',
    auth: true,
    body: z.object({ code: totpCode }),
    response: ok,
    summary: 'Turn 2FA off (refused while the organisation requires it)',
  }),
  sessions: endpoint({
    method: 'GET',
    path: '/api/v1/me/sessions',
    auth: true,
    response: z.object({ items: z.array(session) }),
    summary: 'Devices signed in to this account',
  }),
  revokeSession: endpoint({
    method: 'DELETE',
    path: '/api/v1/me/sessions/:id',
    auth: true,
    params: z.object({ id: uuid }),
    response: ok,
    summary: 'Sign out one device',
  }),
  revokeOtherSessions: endpoint({
    method: 'POST',
    path: '/api/v1/me/sessions/revoke-others',
    auth: true,
    response: z.object({ revoked: z.number().int() }),
    summary: 'Sign out every other device',
  }),
  getSecurity: endpoint({
    method: 'GET',
    path: '/api/v1/settings/security',
    auth: true,
    response: securitySettings,
    summary: 'Organisation security settings',
  }),
  putSecurity: endpoint({
    method: 'PUT',
    path: '/api/v1/settings/security',
    auth: true,
    body: securitySettings,
    response: securitySettings,
    summary: 'Change organisation security settings (require 2FA)',
  }),
  users: endpoint({
    method: 'GET',
    path: '/api/v1/users',
    auth: true,
    response: z.object({ items: z.array(userRow) }),
    summary: 'User accounts of the workspace',
  }),
  createUser: endpoint({
    method: 'POST',
    path: '/api/v1/users',
    auth: true,
    body: z.object({
      email: emailInput,
      name: z.string().trim().min(1).max(120),
      password,
      employeeId: uuid.nullable().default(null),
      roles: z.array(roleAssignment).default([]),
    }),
    response: userRow,
    summary: 'Create a user account with an initial password',
  }),
  updateUser: endpoint({
    method: 'PATCH',
    path: '/api/v1/users/:id',
    auth: true,
    params: z.object({ id: uuid }),
    body: z.object({
      name: z.string().trim().min(1).max(120).optional(),
      disabled: z.boolean().optional(),
      employeeId: uuid.nullable().optional(),
    }),
    response: userRow,
    summary: 'Rename, disable or link a user to an employee',
  }),
  setUserRoles: endpoint({
    method: 'PUT',
    path: '/api/v1/users/:id/roles',
    auth: true,
    params: z.object({ id: uuid }),
    body: z.object({ assignments: z.array(roleAssignment) }),
    response: userRow,
    summary: 'Replace a user’s role assignments',
  }),
};
