import { randomUUID } from 'node:crypto';
import { api, PAGES, RES, type LegalEntity, type OrgUnit, type UnitKind } from '@hrms/contracts';
import { sql, type CoreDatabase, type Transaction } from '@hrms/db';
import { DEFAULT_CODE_PATTERN, employeeName, formatCode, validatePattern } from '@hrms/domain';
import { defineModule, route } from '@hrms/module-sdk';
import { badRequest, conflict, employeeScope, notFound, recordAudit, requireGlobal, requireTenantId, type TenantSettings } from '@hrms/platform';

const O = api.org;
type Trx = Transaction<CoreDatabase>;

/** Which employees column points at each kind of unit. */
const UNIT_COLUMN: Record<UnitKind, string> = {
  business_unit: 'business_unit_id',
  location: 'location_id',
  department: 'department_id',
  sub_department: 'sub_department_id',
  grade: 'grade_id',
  designation: 'designation_id',
  cost_centre: 'cost_centre_id',
};

async function unitCounts(trx: Trx): Promise<Map<string, number>> {
  const parts = Object.values(UNIT_COLUMN).map((c) => sql`SELECT ${sql.ref(c)} AS id, count(*)::int AS n FROM employees WHERE ${sql.ref(c)} IS NOT NULL GROUP BY 1`);
  const { rows } = await sql<{ id: string; n: number }>`${sql.join(parts, sql` UNION ALL `)}`.execute(trx);
  return new Map(rows.map((r) => [r.id, r.n]));
}

async function entities(trx: Trx, id?: string): Promise<LegalEntity[]> {
  let q = trx.selectFrom('legal_entities').selectAll().orderBy('code');
  if (id) q = q.where('id', '=', id);
  const rows = await q.execute();
  const counts = await trx.selectFrom('employees').select(['entity_id', sql<number>`count(*)::int`.as('n')]).groupBy('entity_id').execute();
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    pan: r.pan,
    tan: r.tan,
    gstin: r.gstin,
    state: r.state,
    address: r.address,
    active: r.active,
    employeeCount: counts.find((c) => c.entity_id === r.id)?.n ?? 0,
  }));
}

async function units(trx: Trx, filter: { kind?: UnitKind; id?: string } = {}): Promise<OrgUnit[]> {
  let q = trx.selectFrom('org_units').selectAll().orderBy('kind').orderBy('name');
  if (filter.kind) q = q.where('kind', '=', filter.kind);
  if (filter.id) q = q.where('id', '=', filter.id);
  const rows = await q.execute();
  const counts = await unitCounts(trx);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as UnitKind,
    code: r.code,
    name: r.name,
    parentId: r.parent_id,
    entityId: r.entity_id,
    headEmployeeId: r.head_employee_id,
    active: r.active,
    employeeCount: counts.get(r.id) ?? 0,
  }));
}

/** A sub-department hangs under a department; other kinds may nest under their own kind. */
async function checkParent(trx: Trx, kind: UnitKind, parentId: string | null | undefined, selfId?: string): Promise<void> {
  if (kind === 'sub_department' && !parentId) throw badRequest('A sub-department needs a parent department');
  if (!parentId) return;
  if (parentId === selfId) throw badRequest('A unit cannot be its own parent');
  const p = await trx.selectFrom('org_units').select(['kind']).where('id', '=', parentId).executeTakeFirst();
  if (!p) throw badRequest('Unknown parent unit');
  const want = kind === 'sub_department' ? 'department' : kind;
  if (p.kind !== want) throw badRequest(`The parent of a ${kind.replace('_', '-')} must be a ${want.replace('_', '-')}`);
}

const entityAudit = (r: Partial<LegalEntity>) => ({ code: r.code, name: r.name, pan: r.pan, tan: r.tan, gstin: r.gstin, state: r.state, address: r.address, active: r.active });
const unitAudit = (r: Partial<OrgUnit>) => ({ code: r.code, name: r.name, parentId: r.parentId, entityId: r.entityId, headEmployeeId: r.headEmployeeId, active: r.active });

async function insertEntity(trx: Trx, b: { code: string; name: string; pan?: string | null; tan?: string | null; gstin?: string | null; state?: string | null; address?: string | null; codePattern?: string }): Promise<string> {
  const pattern = b.codePattern ?? DEFAULT_CODE_PATTERN;
  const bad = validatePattern(pattern);
  if (bad) throw badRequest(bad);
  const id = randomUUID();
  const t = requireTenantId();
  await trx
    .insertInto('legal_entities')
    .values({ id, tenant_id: t, code: b.code.toUpperCase(), name: b.name, pan: b.pan ?? null, tan: b.tan ?? null, gstin: b.gstin ?? null, state: b.state ?? null, address: b.address ?? null })
    .execute();
  await trx.insertInto('code_series').values({ entity_id: id, tenant_id: t, pattern, next_number: 1 }).execute();
  await recordAudit(trx, { action: 'create', entityType: 'legal_entity', entityId: id, entityLabel: b.name, after: { ...entityAudit({ ...b, code: b.code.toUpperCase() }), codePattern: pattern } });
  return id;
}

async function insertUnit(trx: Trx, b: { kind: UnitKind; code: string; name: string; parentId?: string | null; entityId?: string | null; headEmployeeId?: string | null }): Promise<string> {
  await checkParent(trx, b.kind, b.parentId);
  const id = randomUUID();
  await trx
    .insertInto('org_units')
    .values({ id, tenant_id: requireTenantId(), kind: b.kind, code: b.code.toUpperCase(), name: b.name, parent_id: b.parentId ?? null, entity_id: b.entityId ?? null, head_employee_id: b.headEmployeeId ?? null })
    .execute();
  await recordAudit(trx, { action: 'create', entityType: `org_unit.${b.kind}`, entityId: id, entityLabel: b.name, after: unitAudit({ ...b, code: b.code.toUpperCase() }) });
  return id;
}

const series = async (trx: Trx) => {
  const rows = await trx.selectFrom('code_series as s').innerJoin('legal_entities as e', 'e.id', 's.entity_id').select(['s.entity_id', 's.pattern', 's.next_number', 'e.code']).orderBy('e.code').execute();
  return rows.map((r) => ({
    entityId: r.entity_id,
    entityCode: r.code,
    pattern: r.pattern,
    nextNumber: r.next_number,
    preview: formatCode(r.pattern, { entityCode: r.code, seq: r.next_number, date: new Date().toISOString().slice(0, 10) }),
  }));
};

const VIEW = { resource: RES.org, action: 'view' as const };

export default defineModule({
  id: 'org',
  name: 'Org structure',
  description: 'Legal entities, org units, employee code series and the setup wizard.',
  resources: [{ id: RES.org, label: 'Org structure (entities, units, code series)', group: 'Organisation', actions: ['view', 'add', 'edit', 'delete'], scoped: false }],
  pages: [{ id: PAGES.org, label: 'Org structure', group: 'Organisation' }],
  nav: [{ id: 'org', label: 'Org structure', path: '/org', page: PAGES.org, section: 'main', order: 30 }],

  routes(app, ctx) {
    route(app, O.entities, { access: VIEW }, async () => ({ items: await ctx.db.tx((trx) => entities(trx)) }));

    route(app, O.createEntity, { access: { resource: RES.org, action: 'add' }, status: 201 }, async ({ body }) => {
      requireGlobal(RES.org, 'add');
      return ctx.db.tx(async (trx) => (await entities(trx, await insertEntity(trx, body)))[0]!);
    });

    route(app, O.updateEntity, { access: { resource: RES.org, action: 'edit' } }, async ({ params, body }) => {
      requireGlobal(RES.org, 'edit');
      return ctx.db.tx(async (trx) => {
        const [before] = await entities(trx, params.id);
        if (!before) throw notFound('Legal entity');
        const { codePattern: _p, ...rest } = body;
        const set = Object.fromEntries(Object.entries({ ...rest, code: rest.code?.toUpperCase() }).filter(([, v]) => v !== undefined));
        if (Object.keys(set).length) await trx.updateTable('legal_entities').set(set).where('id', '=', params.id).execute();
        const [after] = await entities(trx, params.id);
        await recordAudit(trx, { action: 'update', entityType: 'legal_entity', entityId: params.id, entityLabel: after!.name, before: entityAudit(before), after: entityAudit(after!) });
        return after!;
      });
    });

    route(app, O.deleteEntity, { access: { resource: RES.org, action: 'delete' } }, async ({ params }) => {
      requireGlobal(RES.org, 'delete');
      return ctx.db.tx(async (trx) => {
        const [before] = await entities(trx, params.id);
        if (!before) throw notFound('Legal entity');
        if (before.employeeCount > 0) throw conflict(`${before.name} still has ${before.employeeCount} employees`);
        await trx.deleteFrom('legal_entities').where('id', '=', params.id).execute();
        await recordAudit(trx, { action: 'delete', entityType: 'legal_entity', entityId: params.id, entityLabel: before.name, before: entityAudit(before) });
        return { ok: true as const };
      });
    });

    route(app, O.units, { access: VIEW }, async ({ query }) => ({
      items: await ctx.db.tx((trx) => units(trx, query.kind ? { kind: query.kind } : {})),
    }));

    route(app, O.createUnit, { access: { resource: RES.org, action: 'add' }, status: 201 }, async ({ body }) => {
      requireGlobal(RES.org, 'add');
      return ctx.db.tx(async (trx) => (await units(trx, { id: await insertUnit(trx, body) }))[0]!);
    });

    route(app, O.updateUnit, { access: { resource: RES.org, action: 'edit' } }, async ({ params, body }) => {
      requireGlobal(RES.org, 'edit');
      return ctx.db.tx(async (trx) => {
        const [before] = await units(trx, { id: params.id });
        if (!before) throw notFound('Org unit');
        if (body.parentId !== undefined) await checkParent(trx, before.kind, body.parentId, params.id);
        const set = {
          ...(body.code !== undefined ? { code: body.code.toUpperCase() } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.parentId !== undefined ? { parent_id: body.parentId } : {}),
          ...(body.entityId !== undefined ? { entity_id: body.entityId } : {}),
          ...(body.headEmployeeId !== undefined ? { head_employee_id: body.headEmployeeId } : {}),
          ...(body.active !== undefined ? { active: body.active } : {}),
        };
        if (Object.keys(set).length) await trx.updateTable('org_units').set(set).where('id', '=', params.id).execute();
        const [after] = await units(trx, { id: params.id });
        await recordAudit(trx, { action: 'update', entityType: `org_unit.${before.kind}`, entityId: params.id, entityLabel: after!.name, before: unitAudit(before), after: unitAudit(after!) });
        return after!;
      });
    });

    route(app, O.deleteUnit, { access: { resource: RES.org, action: 'delete' } }, async ({ params }) => {
      requireGlobal(RES.org, 'delete');
      return ctx.db.tx(async (trx) => {
        const [before] = await units(trx, { id: params.id });
        if (!before) throw notFound('Org unit');
        if (before.employeeCount > 0) throw conflict(`${before.name} is used by ${before.employeeCount} employees. Make it inactive instead.`);
        const child = await trx.selectFrom('org_units').select('id').where('parent_id', '=', params.id).executeTakeFirst();
        if (child) throw conflict(`${before.name} has units under it`);
        await trx.deleteFrom('org_units').where('id', '=', params.id).execute();
        await recordAudit(trx, { action: 'delete', entityType: `org_unit.${before.kind}`, entityId: params.id, entityLabel: before.name, before: unitAudit(before) });
        return { ok: true as const };
      });
    });

    route(app, O.codeSeries, { access: VIEW }, async () => ({ items: await ctx.db.tx((trx) => series(trx)) }));

    route(app, O.putCodeSeries, { access: { resource: RES.org, action: 'edit' } }, async ({ params, body }) => {
      requireGlobal(RES.org, 'edit');
      const bad = validatePattern(body.pattern);
      if (bad) throw badRequest(bad);
      return ctx.db.tx(async (trx) => {
        const before = await trx.selectFrom('code_series').selectAll().where('entity_id', '=', params.entityId).executeTakeFirst();
        if (!before) throw notFound('Code series');
        await trx
          .updateTable('code_series')
          .set({ pattern: body.pattern, ...(body.nextNumber ? { next_number: body.nextNumber } : {}), updated_at: new Date() })
          .where('entity_id', '=', params.entityId)
          .execute();
        await recordAudit(trx, {
          action: 'update',
          entityType: 'code_series',
          entityId: params.entityId,
          before: { pattern: before.pattern, nextNumber: before.next_number },
          after: { pattern: body.pattern, nextNumber: body.nextNumber ?? before.next_number },
        });
        return (await series(trx)).find((s) => s.entityId === params.entityId)!;
      });
    });

    route(app, O.setup, { access: { resource: RES.org, action: 'add' } }, async ({ body }) => {
      requireGlobal(RES.org, 'add');
      return ctx.db.tx(async (trx) => {
        const entityIds = new Map<string, string>();
        for (const e of body.entities) entityIds.set(e.code.toUpperCase(), await insertEntity(trx, e));
        const byCode = new Map<string, string>();
        const entityOf = (code?: string) => {
          if (!code) return null;
          const id = entityIds.get(code.toUpperCase());
          if (!id) throw badRequest(`Unknown entity code ${code}`);
          return id;
        };
        let n = 0;
        const add = async (kind: UnitKind, list: typeof body.businessUnits) => {
          for (const u of list) {
            const parentId = u.parentCode ? byCode.get(`${kind === 'sub_department' ? 'department' : kind}:${u.parentCode.toUpperCase()}`) : null;
            if (u.parentCode && !parentId) throw badRequest(`Unknown parent ${u.parentCode} for ${u.name}`);
            const id = await insertUnit(trx, { kind, code: u.code, name: u.name, parentId: parentId ?? null, entityId: entityOf(u.entityCode) });
            byCode.set(`${kind}:${u.code.toUpperCase()}`, id);
            n++;
          }
        };
        await add('business_unit', body.businessUnits);
        await add('location', body.locations);
        await add('department', body.departments);
        await add('sub_department', body.subDepartments);
        await add('grade', body.grades);
        await add('designation', body.designations);
        await add('cost_centre', body.costCentres);
        const t = await trx.selectFrom('tenants').select('settings').where('id', '=', requireTenantId()).forUpdate().executeTakeFirstOrThrow();
        const settings: TenantSettings = { ...(t.settings as TenantSettings), setupCompletedAt: new Date().toISOString() };
        await trx.updateTable('tenants').set({ settings: JSON.stringify(settings) }).where('id', '=', requireTenantId()).execute();
        return { entities: body.entities.length, units: n };
      });
    });

    route(app, O.chart, { access: { resource: RES.directory, action: 'view' } }, async () => {
      const rows = await ctx.db.tx((trx) =>
        trx
          .selectFrom('employees as e')
          .leftJoin('org_units as d', 'd.id', 'e.designation_id')
          .select(['e.id', 'e.code', 'e.first_name', 'e.middle_name', 'e.last_name', 'e.display_name', 'e.manager_id', 'd.name as designation'])
          .where(employeeScope(RES.directory, 'view'))
          .where('e.status', '!=', 'exited')
          .orderBy('e.code')
          .execute(),
      );
      const ids = new Set(rows.map((r) => r.id));
      return {
        items: rows.map((r) => ({
          id: r.id,
          code: r.code,
          name: employeeName(r),
          designation: r.designation,
          // A manager the viewer cannot see is not revealed: the node becomes a root.
          managerId: r.manager_id && ids.has(r.manager_id) ? r.manager_id : null,
        })),
      };
    });
  },
});

