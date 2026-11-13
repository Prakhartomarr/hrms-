import { sql, type CoreDatabase, type Kysely, type Transaction } from '@hrms/db';
import { requireTenantId } from './context.js';

/**
 * Tenant-scoped database access. Every transaction runs `set_config('app.tenant_id', $1, true)`
 * so Postgres row-level security limits it to the current tenant. There is no way to get an
 * unscoped runtime connection from here.
 *
 * Modules with their own tables: `db.as<MyTables>().tx((trx) => ...)`.
 */
export class TenantDb {
  constructor(private readonly kysely: Kysely<CoreDatabase>) {}

  async tx<DB = CoreDatabase, T = unknown>(
    fn: (trx: Transaction<DB & CoreDatabase>) => Promise<T>,
    tenantId: string = requireTenantId(),
  ): Promise<T> {
    return this.kysely.transaction().execute(async (trx) => {
      await sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`.execute(trx);
      return fn(trx as unknown as Transaction<DB & CoreDatabase>);
    });
  }

  as<DB>(): { tx<T>(fn: (trx: Transaction<DB & CoreDatabase>) => Promise<T>, tenantId?: string): Promise<T> } {
    return {
      tx: <T>(fn: (trx: Transaction<DB & CoreDatabase>) => Promise<T>, tenantId?: string) =>
        this.tx<DB, T>(fn, tenantId ?? requireTenantId()),
    };
  }

  async destroy(): Promise<void> {
    await this.kysely.destroy();
  }
}

/**
 * Schema-owner access that bypasses RLS. Platform internals only (outbox relay, tenant
 * enumeration for schedules). Not exposed to feature modules.
 */
export class SystemDb {
  constructor(readonly kysely: Kysely<CoreDatabase>) {}

  async listTenantIds(): Promise<string[]> {
    const rows = await this.kysely.selectFrom('tenants').select('id').orderBy('created_at').execute();
    return rows.map((r) => r.id);
  }
}
