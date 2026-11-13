import { api, RES } from '@hrms/contracts';
import { describeDevice, employeeName } from '@hrms/domain';
import { route, type ModuleApp, type ModuleContext } from '@hrms/module-sdk';
import { AppError, currentAccess, notFound, recordAudit, requireContext, requireGlobal, requireTenantId, requireUserId, type TenantSettings } from '@hrms/platform';
import { checkTotp, totpSetupFor } from './auth.js';
import { endSession, endUserSessions } from './sessions.js';
import type { Trx } from './tables.js';

const I = api.identity;
const badCode = () => new AppError('invalid_code', 400, 'That code is not right. Try the newest one.');

export function meRoutes(app: ModuleApp, ctx: ModuleContext): void {
  route(app, I.me, {}, async () => {
    const userId = requireUserId();
    return ctx.db.tx(async (trx: Trx) => {
      const u = await trx.selectFrom('users').select(['id', 'email', 'name', 'employee_id']).where('id', '=', userId).executeTakeFirstOrThrow();
      const t = await trx.selectFrom('tenants').select(['id', 'name', 'slug', 'settings']).where('id', '=', requireTenantId()).executeTakeFirstOrThrow();
      const e = u.employee_id
        ? await trx.selectFrom('employees').select(['id', 'code', 'first_name', 'middle_name', 'last_name', 'display_name']).where('id', '=', u.employee_id).executeTakeFirst()
        : undefined;
      const mfa = await trx.selectFrom('identity_mfa').select('enabled_at').where('user_id', '=', userId).executeTakeFirst();
      const settings = t.settings as TenantSettings;
      return {
        user: { id: u.id, email: u.email, name: u.name },
        tenant: { id: t.id, name: t.name, slug: t.slug, setupCompleted: !!settings.setupCompletedAt },
        employee: e ? { id: e.id, code: e.code, name: employeeName(e) } : null,
        access: currentAccess(),
        twoFactor: { enabled: !!mfa?.enabled_at, required: !!settings.require2fa },
      };
    });
  });

  route(app, I.logout, {}, async () => {
    const { sessionId } = requireContext();
    await ctx.db.tx((trx: Trx) => endSession(trx, sessionId!));
    ctx.accessChanged(requireTenantId(), requireUserId());
    return { ok: true as const };
  });

  route(app, I.totpSetup, {}, async () =>
    ctx.db.tx(async (trx: Trx) => {
      const u = await trx.selectFrom('users').select(['id', 'email']).where('id', '=', requireUserId()).executeTakeFirstOrThrow();
      return totpSetupFor(ctx, trx, { id: u.id, tenantId: requireTenantId(), email: u.email });
    }),
  );

  route(app, I.totpEnable, {}, async ({ body }) =>
    ctx.db.tx(async (trx: Trx) => {
      if (!(await checkTotp(ctx, trx, requireUserId(), body.code, 'pending'))) throw badCode();
      await recordAudit(trx, { action: 'update', entityType: 'user.2fa', entityId: requireUserId(), before: { enabled: false }, after: { enabled: true } });
      return { ok: true as const };
    }),
  );

  route(app, I.totpDisable, {}, async ({ body }) =>
    ctx.db.tx(async (trx: Trx) => {
      const t = await trx.selectFrom('tenants').select('settings').where('id', '=', requireTenantId()).executeTakeFirstOrThrow();
      if ((t.settings as TenantSettings).require2fa) throw new AppError('2fa_required', 409, 'Your organisation requires two-factor sign-in, so it cannot be turned off.');
      if (!(await checkTotp(ctx, trx, requireUserId(), body.code, 'enabled'))) throw badCode();
      await trx.deleteFrom('identity_mfa').where('user_id', '=', requireUserId()).execute();
      await recordAudit(trx, { action: 'update', entityType: 'user.2fa', entityId: requireUserId(), before: { enabled: true }, after: { enabled: false } });
      return { ok: true as const };
    }),
  );

  route(app, I.sessions, {}, async () => {
    const { sessionId } = requireContext();
    const rows = await ctx.db.tx((trx: Trx) =>
      trx.selectFrom('identity_sessions').selectAll().where('user_id', '=', requireUserId()).where('revoked_at', 'is', null).orderBy('last_seen_at', 'desc').execute(),
    );
    return {
      items: rows.map((s) => ({
        id: s.id,
        device: describeDevice(s.user_agent),
        userAgent: s.user_agent,
        ip: s.ip,
        createdAt: new Date(s.created_at).toISOString(),
        lastSeenAt: new Date(s.last_seen_at).toISOString(),
        current: s.id === sessionId,
      })),
    };
  });

  route(app, I.revokeSession, {}, async ({ params }) => {
    await ctx.db.tx(async (trx: Trx) => {
      const s = await trx.selectFrom('identity_sessions').select('id').where('id', '=', params.id).where('user_id', '=', requireUserId()).executeTakeFirst();
      if (!s) throw notFound('Session');
      await endSession(trx, s.id);
    });
    ctx.accessChanged(requireTenantId(), requireUserId());
    return { ok: true as const };
  });

  route(app, I.revokeOtherSessions, {}, async () => {
    const revoked = await ctx.db.tx((trx: Trx) => endUserSessions(trx, requireUserId(), requireContext().sessionId));
    ctx.accessChanged(requireTenantId(), requireUserId());
    return { revoked };
  });

  route(app, I.getSecurity, { access: { resource: RES.security, action: 'view' } }, async () => {
    const t = await ctx.db.tx((trx) => trx.selectFrom('tenants').select('settings').where('id', '=', requireTenantId()).executeTakeFirstOrThrow());
    return { require2fa: !!(t.settings as TenantSettings).require2fa };
  });

  route(app, I.putSecurity, { access: { resource: RES.security, action: 'edit' } }, async ({ body }) => {
    requireGlobal(RES.security, 'edit');
    return ctx.db.tx(async (trx) => {
      const t = await trx.selectFrom('tenants').select('settings').where('id', '=', requireTenantId()).forUpdate().executeTakeFirstOrThrow();
      const before = t.settings as TenantSettings;
      const after: TenantSettings = { ...before, require2fa: body.require2fa };
      await trx.updateTable('tenants').set({ settings: JSON.stringify(after) }).where('id', '=', requireTenantId()).execute();
      await recordAudit(trx, { action: 'update', entityType: 'settings.security', entityId: requireTenantId(), entityLabel: 'Security settings', before: { require2fa: !!before.require2fa }, after: { require2fa: body.require2fa } });
      return { require2fa: body.require2fa };
    });
  });
}
