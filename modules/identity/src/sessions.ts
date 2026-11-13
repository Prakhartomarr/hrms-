import { randomUUID } from 'node:crypto';
import type { LoginResult, TokenPair } from '@hrms/contracts';
import type { ModuleContext } from '@hrms/module-sdk';
import { currentContext, unauthorized } from '@hrms/platform';
import type { Trx } from './tables.js';

/** Starts a session (one device sign-in) and issues its first token pair. */
export async function startSession(
  ctx: ModuleContext,
  trx: Trx,
  user: { id: string; tenantId: string },
  opts: { method?: string; mfa?: boolean } = {},
): Promise<TokenPair> {
  const c = currentContext();
  const sessionId = randomUUID();
  await trx
    .insertInto('identity_sessions')
    .values({
      id: sessionId,
      tenant_id: user.tenantId,
      user_id: user.id,
      user_agent: c?.userAgent ?? null,
      ip: c?.ip ?? null,
      method: opts.method ?? 'password',
      mfa: opts.mfa ?? false,
    })
    .execute();
  return issuePair(ctx, trx, user, sessionId);
}

async function issuePair(ctx: ModuleContext, trx: Trx, user: { id: string; tenantId: string }, sessionId: string): Promise<TokenPair> {
  const refresh = await ctx.tokens.signRefresh({ userId: user.id, tenantId: user.tenantId });
  await trx
    .insertInto('identity_refresh_tokens')
    .values({
      id: refresh.tokenId,
      tenant_id: user.tenantId,
      user_id: user.id,
      session_id: sessionId,
      expires_at: new Date(Date.now() + ctx.tokens.refreshTtlSeconds * 1000),
      revoked_at: null,
      replaced_by: null,
    })
    .execute();
  return {
    accessToken: await ctx.tokens.signAccess({ userId: user.id, tenantId: user.tenantId, sessionId }),
    refreshToken: refresh.token,
    expiresIn: ctx.tokens.accessTtlSeconds,
  };
}

export const ok = (tokens: TokenPair): LoginResult => ({ status: 'ok', tokens });

/**
 * Rotates a refresh token. A token that was already rotated or revoked being presented again
 * means it was copied: the whole session is ended (reuse detection).
 */
export async function rotate(ctx: ModuleContext, refreshToken: string): Promise<TokenPair> {
  const claims = await ctx.tokens.verifyRefresh(refreshToken);
  const result = await ctx.db.tx(async (trx: Trx) => {
    const row = await trx.selectFrom('identity_refresh_tokens').selectAll().where('id', '=', claims.tokenId).forUpdate().executeTakeFirst();
    if (!row || row.user_id !== claims.userId) return { error: 'invalid' as const };
    const session = await trx.selectFrom('identity_sessions').selectAll().where('id', '=', row.session_id).executeTakeFirst();
    const user = await trx.selectFrom('users').select(['id', 'disabled_at']).where('id', '=', row.user_id).executeTakeFirst();
    if (!session || session.revoked_at || !user || user.disabled_at) return { error: 'ended' as const };
    if (row.revoked_at || new Date(row.expires_at) < new Date()) {
      await endSession(trx, session.id);
      return { error: 'reused' as const };
    }
    const pair = await issuePair(ctx, trx, { id: row.user_id, tenantId: row.tenant_id }, session.id);
    const next = await ctx.tokens.verifyRefresh(pair.refreshToken);
    await trx.updateTable('identity_refresh_tokens').set({ revoked_at: new Date(), replaced_by: next.tokenId }).where('id', '=', row.id).execute();
    const c = currentContext();
    await trx
      .updateTable('identity_sessions')
      .set({ last_seen_at: new Date(), ...(c?.ip ? { ip: c.ip } : {}), ...(c?.userAgent ? { user_agent: c.userAgent } : {}) })
      .where('id', '=', session.id)
      .execute();
    return { pair };
  }, claims.tenantId);
  if ('error' in result) throw unauthorized('Your session has ended. Sign in again.');
  return result.pair;
}

export async function endSession(trx: Trx, sessionId: string): Promise<void> {
  const now = new Date();
  await trx.updateTable('identity_sessions').set({ revoked_at: now }).where('id', '=', sessionId).where('revoked_at', 'is', null).execute();
  await trx.updateTable('identity_refresh_tokens').set({ revoked_at: now }).where('session_id', '=', sessionId).where('revoked_at', 'is', null).execute();
}

/** Ends every session of a user except `keep`. Returns how many ended. */
export async function endUserSessions(trx: Trx, userId: string, keep?: string): Promise<number> {
  let q = trx.selectFrom('identity_sessions').select('id').where('user_id', '=', userId).where('revoked_at', 'is', null);
  if (keep) q = q.where('id', '!=', keep);
  const ids = (await q.execute()).map((r) => r.id);
  for (const id of ids) await endSession(trx, id);
  return ids.length;
}
