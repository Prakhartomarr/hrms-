import { randomUUID } from 'node:crypto';
import type { EventEnvelope } from '@hrms/contracts';
import { sql, type CoreDatabase, type Kysely, type Transaction } from '@hrms/db';
import { requireTenantId } from './context.js';
import type { Logger } from './logger.js';

/**
 * Writes an event to the transactional outbox inside the caller's transaction (ADR-0007).
 * The event becomes visible to subscribers only if the transaction commits.
 */
export async function publishEvent<
  P extends Record<string, unknown>,
  DB extends CoreDatabase = CoreDatabase,
>(db: Transaction<DB>, type: string, payload: P): Promise<string> {
  const id = randomUUID();
  const trx = db as unknown as Transaction<CoreDatabase>;
  await trx
    .insertInto('outbox_event')
    .values({ id, tenant_id: requireTenantId(), type, payload: JSON.stringify(payload) })
    .execute();
  return id;
}

export type EventDispatcher = (event: EventEnvelope) => Promise<void>;

/**
 * Moves committed outbox events to their consumers. Uses the schema-owner connection
 * (cross-tenant) and `FOR UPDATE SKIP LOCKED`, so several relays can run at once.
 * Delivery is at least once; consumers dedupe on event id (job ids do this for BullMQ).
 */
export class OutboxRelay {
  constructor(
    private readonly db: Kysely<CoreDatabase>,
    private readonly dispatch: EventDispatcher,
    private readonly logger: Logger,
  ) {}

  /**
   * Relays until the backlog is gone or `budgetMs` has passed. One batch a tick caps the relay at
   * 200 events a second however far behind it is: a burst of 50,000 took over four minutes to
   * reach anyone, and the next tick picks up whatever is left.
   */
  async drain(budgetMs = 5000, limit = 200): Promise<number> {
    const until = Date.now() + budgetMs;
    let total = 0;
    for (;;) {
      const { published, fetched } = await this.relayBatch(limit);
      total += published;
      if (fetched < limit || published === 0 || Date.now() >= until) return total;
    }
  }

  async relayOnce(limit = 200): Promise<number> {
    return (await this.relayBatch(limit)).published;
  }

  private async relayBatch(limit: number): Promise<{ published: number; fetched: number }> {
    return this.db.transaction().execute(async (trx) => {
      const rows = await trx
        .selectFrom('outbox_event')
        .selectAll()
        .where('published_at', 'is', null)
        .where('attempts', '<', 25)
        .orderBy('occurred_at')
        .limit(limit)
        .forUpdate()
        .skipLocked()
        .execute();
      const done: string[] = [];
      for (const row of rows) {
        const event: EventEnvelope = {
          id: row.id,
          tenantId: row.tenant_id,
          type: row.type,
          payload: row.payload,
          occurredAt: new Date(row.occurred_at).toISOString(),
        };
        try {
          await this.dispatch(event);
          done.push(row.id);
        } catch (err) {
          this.logger.error({ err, eventId: row.id, type: row.type }, 'outbox dispatch failed');
          await trx
            .updateTable('outbox_event')
            .set({ attempts: sql`attempts + 1` as never, last_error: (err as Error).message })
            .where('id', '=', row.id)
            .execute();
        }
      }
      if (done.length > 0)
        await trx
          .updateTable('outbox_event')
          .set({ published_at: sql`now()` as never })
          .where('id', 'in', done)
          .execute();
      return { published: done.length, fetched: rows.length };
    });
  }
}
