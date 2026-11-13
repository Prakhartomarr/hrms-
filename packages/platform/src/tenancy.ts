import { randomUUID } from 'node:crypto';
import type { CoreDatabase, Transaction } from '@hrms/db';
import { ADMIN_ROLE, ROLE_TEMPLATE_DEFS } from '@hrms/domain';

export interface TenantSettings {
  /** Every user must pass TOTP 2FA to sign in. */
  require2fa?: boolean;
  /** Set when the setup wizard finished. */
  setupCompletedAt?: string;
}

/**
 * Creates a workspace inside a transaction already bound to `tenantId`: the tenant, the
 * Administrator role, a copy of each of the six role templates, and the owner's account.
 */
export async function createTenant<DB>(
  db: Transaction<DB>,
  input: { tenantId: string; name: string; slug: string; owner: { name: string; email: string; passwordHash: string | null } },
): Promise<{ userId: string; adminRoleId: string; roleIds: Record<string, string> }> {
  const trx = db as unknown as Transaction<CoreDatabase>;
  const t = input.tenantId;
  await trx.insertInto('tenants').values({ id: t, name: input.name, slug: input.slug, settings: '{}' }).execute();
  const adminRoleId = randomUUID();
  await trx
    .insertInto('roles')
    .values({ id: adminRoleId, tenant_id: t, name: ADMIN_ROLE.name, description: ADMIN_ROLE.description, template_key: null, is_system: true, is_admin: true, pages: [], grants: '{}' })
    .execute();
  const roleIds: Record<string, string> = {};
  for (const tpl of ROLE_TEMPLATE_DEFS) {
    const id = randomUUID();
    roleIds[tpl.key] = id;
    await trx
      .insertInto('roles')
      .values({ id, tenant_id: t, name: tpl.name, description: tpl.description, template_key: tpl.key, pages: tpl.pages, grants: JSON.stringify(tpl.grants) })
      .execute();
  }
  const userId = randomUUID();
  await trx
    .insertInto('users')
    .values({ id: userId, tenant_id: t, email: input.owner.email, name: input.owner.name, password_hash: input.owner.passwordHash, employee_id: null })
    .execute();
  await trx.insertInto('user_roles').values({ id: randomUUID(), tenant_id: t, user_id: userId, role_id: adminRoleId, entity_id: null }).execute();
  return { userId, adminRoleId, roleIds };
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'workspace'
  );
}
