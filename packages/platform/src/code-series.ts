import type { CoreDatabase, Transaction } from '@hrms/db';
import { DEFAULT_CODE_PATTERN, formatCode } from '@hrms/domain';
import { badRequest } from './errors.js';
import { requireTenantId } from './context.js';

/**
 * Takes the next employee code for an entity, inside the caller's transaction (the row lock
 * serialises concurrent hires). Skips numbers whose code is already taken (imported codes).
 */
export async function nextEmployeeCode<DB>(db: Transaction<DB>, entityId: string, dateOfJoining: string): Promise<string> {
  const trx = db as unknown as Transaction<CoreDatabase>;
  const entity = await trx.selectFrom('legal_entities').select(['code']).where('id', '=', entityId).executeTakeFirst();
  if (!entity) throw badRequest('Unknown legal entity');
  let series = await trx.selectFrom('code_series').selectAll().where('entity_id', '=', entityId).forUpdate().executeTakeFirst();
  if (!series) {
    await trx.insertInto('code_series').values({ entity_id: entityId, tenant_id: requireTenantId(), pattern: DEFAULT_CODE_PATTERN, next_number: 1 }).onConflict((oc) => oc.doNothing()).execute();
    series = await trx.selectFrom('code_series').selectAll().where('entity_id', '=', entityId).forUpdate().executeTakeFirstOrThrow();
  }
  for (let n = series.next_number; ; n++) {
    const code = formatCode(series.pattern, { entityCode: entity.code, seq: n, date: dateOfJoining });
    const taken = await trx.selectFrom('employees').select('id').where('code', '=', code).executeTakeFirst();
    if (!taken) {
      await trx.updateTable('code_series').set({ next_number: n + 1, updated_at: new Date() }).where('entity_id', '=', entityId).execute();
      return code;
    }
  }
}
