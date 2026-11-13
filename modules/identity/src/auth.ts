import { randomUUID } from 'node:crypto';
import { api, PRODUCT, type LoginResult } from '@hrms/contracts';
import { sql } from '@hrms/db';
import { route, type ModuleApp, type ModuleContext } from '@hrms/module-sdk';
import {
  AppError,
  createTenant,
  hashPassword,
  notImplemented,
  otpauthUrl,
  randomToken,
  runAsTenant,
  sha256,
  slugify,
  unauthorized,
  verifyPassword,
  verifyTotp,
  generateTotpSecret,
  badRequest,
  type TenantSettings,
} from '@hrms/platform';
import QRCode from 'qrcode';
import { endUserSessions, ok, rotate, startSession } from './sessions.js';
import { NO_TENANT, type Trx } from './tables.js';

const I = api.identity;
const RESET_TTL_MS = 60 * 60_000;

interface LoginAccount {
  user_id: string;
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
  password_hash: string | null;
  disabled: boolean;
}

// Verified against when no account matches, so a miss costs as much as a hit.
const DUMMY_HASH = hashPassword(randomUUID());

async function accountsFor(ctx: ModuleContext, email: string): Promise<LoginAccount[]> {
  return ctx.db.tx(async (trx) => (await sql<LoginAccount>`SELECT * FROM identity_find_login(${email})`.execute(trx)).rows, NO_TENANT);
}

/** After the password: a second factor, setting one up, or straight in. */
async function afterPassword(ctx: ModuleContext, a: { userId: string; tenantId: string }): Promise<LoginResult> {
  return runAsTenant(a.tenantId, () =>
    ctx.db.tx(async (trx: Trx) => {
      const mfa = await trx.selectFrom('identity_mfa').select(['enabled_at']).where('user_id', '=', a.userId).executeTakeFirst();
      if (mfa?.enabled_at) return { status: 'mfa_required' as const, mfaToken: await ctx.tokens.signMfa({ ...a, purpose: 'verify' }) };
      const t = await trx.selectFrom('tenants').select('settings').where('id', '=', a.tenantId).executeTakeFirstOrThrow();
      if ((t.settings as TenantSettings).require2fa)
        return { status: 'mfa_setup_required' as const, mfaToken: await ctx.tokens.signMfa({ ...a, purpose: 'setup' }) };
      return ok(await startSession(ctx, trx, { id: a.userId, tenantId: a.tenantId }));
    }, a.tenantId),
  );
}

export async function totpSetupFor(ctx: ModuleContext, trx: Trx, user: { id: string; tenantId: string; email: string }) {
  const secret = generateTotpSecret();
  await trx
    .insertInto('identity_mfa')
    .values({ user_id: user.id, tenant_id: user.tenantId, secret_enc: null, pending_secret_enc: ctx.secrets.seal(secret), enabled_at: null, last_counter: null })
    .onConflict((oc) => oc.column('user_id').doUpdateSet({ pending_secret_enc: ctx.secrets.seal(secret), updated_at: new Date() }))
    .execute();
  const url = otpauthUrl({ issuer: PRODUCT.name, account: user.email, secret });
  return { secret, otpauthUrl: url, qrSvg: await QRCode.toString(url, { type: 'svg', margin: 1, width: 192 }) };
}

/** Checks a code against the enabled (or, when confirming setup, the pending) secret. */
export async function checkTotp(ctx: ModuleContext, trx: Trx, userId: string, code: string, which: 'enabled' | 'pending'): Promise<boolean> {
  const row = await trx.selectFrom('identity_mfa').selectAll().where('user_id', '=', userId).forUpdate().executeTakeFirst();
  const sealed = which === 'enabled' ? row?.secret_enc : row?.pending_secret_enc;
  if (!row || !sealed) return false;
  const counter = verifyTotp(ctx.secrets.open<string>(sealed), code);
  if (counter === null || (row.last_counter !== null && counter <= row.last_counter)) return false;
  await trx
    .updateTable('identity_mfa')
    .set({
      last_counter: counter,
      updated_at: new Date(),
      ...(which === 'pending' ? { secret_enc: sealed, pending_secret_enc: null, enabled_at: new Date() } : {}),
    })
    .where('user_id', '=', userId)
    .execute();
  return true;
}

export function authRoutes(app: ModuleApp, ctx: ModuleContext): void {
  route(app, I.signup, { rateLimitPerMinute: 10 }, async ({ body }) => {
    const tenantId = randomUUID();
    let slug = slugify(body.workspaceName);
    for (let i = 2; ; i++) {
      const taken = await ctx.db.tx(async (trx) => (await sql<{ t: boolean }>`SELECT identity_slug_taken(${slug}) AS t`.execute(trx)).rows[0]!.t, NO_TENANT);
      if (!taken) break;
      slug = `${slugify(body.workspaceName)}-${i}`;
    }
    const passwordHash = await hashPassword(body.password);
    return runAsTenant(tenantId, () =>
      ctx.db.tx(async (trx: Trx) => {
        const { userId } = await createTenant(trx, { tenantId, name: body.workspaceName, slug, owner: { name: body.name, email: body.email, passwordHash } });
        return ok(await startSession(ctx, trx, { id: userId, tenantId }));
      }, tenantId),
    );
  });

  route(app, I.login, { rateLimitPerMinute: 20 }, async ({ body }) => {
    const all = (await accountsFor(ctx, body.email)).filter((a) => !body.tenantSlug || a.tenant_slug === body.tenantSlug);
    const withHash = all.filter((a) => a.password_hash);
    if (withHash.length === 0) {
      await verifyPassword(body.password, await DUMMY_HASH);
      throw unauthorized('Email or password is incorrect');
    }
    const okAll = await Promise.all(withHash.map((a) => verifyPassword(body.password, a.password_hash!)));
    const proven = withHash.filter((_, i) => okAll[i] && !withHash[i]!.disabled);
    if (proven.length === 0) throw unauthorized('Email or password is incorrect');
    if (proven.length > 1) return { status: 'choose_workspace' as const, workspaces: proven.map((a) => ({ slug: a.tenant_slug, name: a.tenant_name })) };
    return afterPassword(ctx, { userId: proven[0]!.user_id, tenantId: proven[0]!.tenant_id });
  });

  route(app, I.login2fa, { rateLimitPerMinute: 20 }, async ({ body }) => {
    const c = await ctx.tokens.verifyMfa(body.mfaToken);
    if (c.purpose !== 'verify') throw unauthorized('Invalid or expired token');
    return runAsTenant(c.tenantId, () =>
      ctx.db.tx(async (trx: Trx) => {
        if (!(await checkTotp(ctx, trx, c.userId, body.code, 'enabled'))) throw new AppError('invalid_code', 401, 'That code is not right. Try the newest one.');
        return ok(await startSession(ctx, trx, { id: c.userId, tenantId: c.tenantId }, { mfa: true }));
      }, c.tenantId),
    );
  });

  route(app, I.login2faSetup, { rateLimitPerMinute: 20 }, async ({ body }) => {
    const c = await ctx.tokens.verifyMfa(body.mfaToken);
    if (c.purpose !== 'setup') throw unauthorized('Invalid or expired token');
    return runAsTenant(c.tenantId, () =>
      ctx.db.tx(async (trx: Trx) => {
        const u = await trx.selectFrom('users').select(['email']).where('id', '=', c.userId).executeTakeFirstOrThrow();
        return totpSetupFor(ctx, trx, { id: c.userId, tenantId: c.tenantId, email: u.email });
      }, c.tenantId),
    );
  });

  route(app, I.login2faEnable, { rateLimitPerMinute: 20 }, async ({ body }) => {
    const c = await ctx.tokens.verifyMfa(body.mfaToken);
    if (c.purpose !== 'setup') throw unauthorized('Invalid or expired token');
    return runAsTenant(c.tenantId, () =>
      ctx.db.tx(async (trx: Trx) => {
        if (!(await checkTotp(ctx, trx, c.userId, body.code, 'pending'))) throw new AppError('invalid_code', 401, 'That code is not right. Try the newest one.');
        return ok(await startSession(ctx, trx, { id: c.userId, tenantId: c.tenantId }, { mfa: true }));
      }, c.tenantId),
    );
  });

  route(app, I.refresh, { rateLimitPerMinute: 120 }, async ({ body }) => {
    return rotate(ctx, body.refreshToken);
  });

  route(app, I.forgot, { rateLimitPerMinute: 5 }, async ({ body }) => {
    const accounts = (await accountsFor(ctx, body.email)).filter((a) => !a.disabled);
    for (const a of accounts) {
      const token = randomToken();
      await runAsTenant(a.tenant_id, () =>
        ctx.db.tx(async (trx: Trx) => {
          await trx
            .insertInto('identity_password_resets')
            .values({ id: randomUUID(), tenant_id: a.tenant_id, user_id: a.user_id, token_hash: sha256(token), expires_at: new Date(Date.now() + RESET_TTL_MS), used_at: null })
            .execute();
        }, a.tenant_id),
      );
      const link = `${ctx.config.WEB_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
      await runAsTenant(a.tenant_id, () =>
        ctx.jobs.enqueue('identity.sendResetEmail', { to: body.email, workspace: a.tenant_name, link }),
      );
    }
    return { ok: true as const };
  });

  route(app, I.reset, { rateLimitPerMinute: 10 }, async ({ body }) => {
    const hit = await ctx.db.tx(
      async (trx) => (await sql<{ reset_id: string; tenant_id: string; user_id: string }>`SELECT * FROM identity_find_reset(${sha256(body.token)})`.execute(trx)).rows[0],
      NO_TENANT,
    );
    if (!hit) throw badRequest('This reset link is not valid. Ask for a new one.');
    const passwordHash = await hashPassword(body.password);
    await runAsTenant(hit.tenant_id, () =>
      ctx.db.tx(async (trx: Trx) => {
        const r = await trx.selectFrom('identity_password_resets').selectAll().where('id', '=', hit.reset_id).forUpdate().executeTakeFirstOrThrow();
        if (r.used_at || new Date(r.expires_at) < new Date()) throw badRequest('This reset link has expired. Ask for a new one.');
        await trx.updateTable('identity_password_resets').set({ used_at: new Date() }).where('id', '=', r.id).execute();
        await trx.updateTable('users').set({ password_hash: passwordHash }).where('id', '=', r.user_id).execute();
        // A new password ends every sign-in, including whoever had the old one.
        await endUserSessions(trx, r.user_id);
      }, hit.tenant_id),
    );
    ctx.accessChanged(hit.tenant_id, hit.user_id);
    return { ok: true as const };
  });

  // Single sign-on: stubs behind config. A provider shows as enabled once its client id is set;
  // the code exchange is not built yet (docs/build-queue.md).
  const providers = () => [
    { id: 'google' as const, label: 'Google', enabled: !!ctx.config.GOOGLE_CLIENT_ID },
    { id: 'microsoft' as const, label: 'Microsoft', enabled: !!ctx.config.MICROSOFT_CLIENT_ID },
  ];
  route(app, I.ssoProviders, {}, async () => ({ items: providers() }));
  route(app, I.ssoStart, {}, async ({ params }) => {
    const p = providers().find((x) => x.id === params.provider)!;
    if (!p.enabled) throw new AppError('sso_not_configured', 404, `${p.label} sign-in is not set up for this server`);
    const state = randomToken(16);
    const redirect = ctx.config.SSO_REDIRECT_URL;
    const q = new URLSearchParams({ response_type: 'code', redirect_uri: redirect, scope: 'openid email profile', state });
    if (p.id === 'google') {
      q.set('client_id', ctx.config.GOOGLE_CLIENT_ID!);
      return { url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` };
    }
    q.set('client_id', ctx.config.MICROSOFT_CLIENT_ID!);
    return { url: `https://login.microsoftonline.com/${encodeURIComponent(ctx.config.MICROSOFT_TENANT)}/oauth2/v2.0/authorize?${q}` };
  });
  app.get('/api/v1/auth/sso/callback', { config: { public: true }, schema: { hide: true } }, async () => {
    throw notImplemented('Single sign-on is not finished yet: the code exchange is still to be built.');
  });
}
