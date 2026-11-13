import { randomUUID } from 'node:crypto';
import { api, EVENTS, RECORD_SECTIONS, RES, SECTION_SCHEMAS, type DirectoryRow, type JobEvent } from '@hrms/contracts';
import { sql } from '@hrms/db';
import { employeeName, todayIst } from '@hrms/domain';
import { route, type ModuleApp, type ModuleContext } from '@hrms/module-sdk';
import {
  AppError,
  badRequest,
  conflict,
  currentContext,
  employeeScope,
  forbidden,
  notFound,
  publishEvent,
  recordAudit,
  requireAction,
  requireGlobal,
  requireOnEmployee,
  requireTenantId,
} from '@hrms/platform';
import type { z } from 'zod';
import {
  addJobEvent,
  checkCustom,
  checkJob,
  createEmployee,
  customDefs,
  jobValues,
  loadProfile,
  refreshCurrentJob,
  snapshot,
  toColumns,
  unmaskedFor,
} from './service.js';
import type { Trx } from './tables.js';

const P = api.people;

/** A section's sensitive fields and the resource that may change them. */
const SENSITIVE_EDIT: Record<string, Record<string, string>> = {
  identity: { pan: RES.pan, aadhaar: RES.aadhaar },
  bank: { bankName: RES.bank, accountNumber: RES.bank, ifsc: RES.bank, accountHolderName: RES.bank },
};

async function requireSensitiveEdits(trx: Trx, employeeId: string | null, section: string, data: Record<string, unknown>) {
  for (const [field, resource] of Object.entries(SENSITIVE_EDIT[section] ?? {})) {
    if (!(field in data)) continue;
    if (employeeId) await requireOnEmployee(trx, resource, 'edit', employeeId);
    else requireAction(resource, 'edit');
  }
}

function parseSection<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fields = r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw new AppError('validation', 400, fields.map((f) => `${f.field}: ${f.message}`).join('; '), { fields });
  }
  return r.data;
}

export function peopleRoutes(app: ModuleApp, ctx: ModuleContext): void {
  route(app, P.directory, { access: { resource: RES.directory, action: 'view' } }, async ({ query }) =>
    ctx.db.tx(async (trx: Trx) => {
      let q = trx
        .selectFrom('employees as e')
        .leftJoin('org_units as d', 'd.id', 'e.designation_id')
        .leftJoin('org_units as dep', 'dep.id', 'e.department_id')
        .leftJoin('org_units as loc', 'loc.id', 'e.location_id')
        .leftJoin('legal_entities as le', 'le.id', 'e.entity_id')
        .leftJoin('employees as m', 'm.id', 'e.manager_id')
        // The directory shows whoever the viewer may see in the directory or as a full profile.
        .where(sql<boolean>`(${employeeScope(RES.directory, 'view')} OR ${employeeScope(RES.employees, 'view')})`);
      if (query.q) {
        const like = `%${query.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
        q = q.where(sql<boolean>`(e.code ILIKE ${like} OR e.first_name ILIKE ${like} OR e.last_name ILIKE ${like} OR e.display_name ILIKE ${like} OR e.work_email ILIKE ${like} OR concat_ws(' ', e.first_name, e.last_name) ILIKE ${like})`);
      }
      const eq = { entityId: 'e.entity_id', businessUnitId: 'e.business_unit_id', locationId: 'e.location_id', designationId: 'e.designation_id', gradeId: 'e.grade_id', managerId: 'e.manager_id', status: 'e.status', employmentType: 'e.employment_type' } as const;
      for (const [k, col] of Object.entries(eq)) {
        const v = query[k as keyof typeof eq];
        if (v) q = q.where(col, '=', v);
      }
      if (query.departmentId) q = q.where((w) => w.or([w('e.department_id', '=', query.departmentId!), w('e.sub_department_id', '=', query.departmentId!)]));
      const total = (await q.select(sql<number>`count(*)::int`.as('n')).executeTakeFirstOrThrow()).n;
      const rows = await q
        .select([
          'e.id', 'e.code', 'e.first_name', 'e.middle_name', 'e.last_name', 'e.display_name', 'e.work_email', 'e.status', 'e.employment_type', 'e.date_of_joining',
          'd.name as designation', 'dep.name as department', 'loc.name as location', 'le.name as entity',
          'm.first_name as m_first', 'm.last_name as m_last', 'm.display_name as m_display',
        ])
        .orderBy('e.first_name')
        .orderBy('e.code')
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .execute();
      const items: DirectoryRow[] = rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: employeeName(r),
        designation: r.designation,
        department: r.department,
        location: r.location,
        entity: r.entity,
        manager: r.m_first ? employeeName({ first_name: r.m_first, last_name: r.m_last, display_name: r.m_display }) : null,
        workEmail: r.work_email,
        status: r.status,
        employmentType: r.employment_type,
        dateOfJoining: r.date_of_joining,
      }));
      return { items, total };
    }),
  );

  route(app, P.create, { access: { resource: RES.employees, action: 'add' }, status: 201 }, async ({ body }) => {
    const scopes = requireAction(RES.employees, 'add');
    // Adding is entity-bound: an entity-restricted role can only hire into its entity.
    if (!scopes.some((s) => s.scope === 'all' && (s.entityId === null || s.entityId === body.employment.entityId)))
      throw forbidden('You may not add employees to this legal entity');
    if (body.job?.ctcAnnualPaise !== undefined && body.job.ctcAnnualPaise !== null) requireAction(RES.salary, 'edit');
    return ctx.db.tx(async (trx: Trx) => {
      if (body.identity) await requireSensitiveEdits(trx, null, 'identity', body.identity);
      if (body.bank) await requireSensitiveEdits(trx, null, 'bank', body.bank);
      const { id } = await createEmployee(ctx, trx, body, { actorUserId: currentContext()?.userId ?? null });
      await publishEvent(trx, EVENTS.employeeCreated, { id });
      return loadProfile(ctx, trx, id);
    });
  });

  route(app, P.get, { access: { resource: RES.employees, action: 'view' } }, async ({ params }) =>
    ctx.db.tx(async (trx: Trx) => {
      const exists = await trx.selectFrom('employees').select('id').where('id', '=', params.id).executeTakeFirst();
      if (!exists) throw notFound('Employee');
      await requireOnEmployee(trx, RES.employees, 'view', params.id);
      return loadProfile(ctx, trx, params.id);
    }),
  );

  route(app, P.updateSection, { access: { resource: RES.employees, action: 'edit' } }, async ({ params, body }) =>
    ctx.db.tx(async (trx: Trx) => {
      const before = await trx.selectFrom('employees').selectAll().where('id', '=', params.id).forUpdate().executeTakeFirst();
      if (!before) throw notFound('Employee');
      await requireOnEmployee(trx, RES.employees, 'edit', params.id);
      const schema = SECTION_SCHEMAS[params.section].partial();
      const data = parseSection(schema, body.data) as Record<string, unknown>;
      await requireSensitiveEdits(trx, params.id, params.section, data);
      const cols: Record<string, unknown> = toColumns(ctx, params.section, data);
      if (body.custom) {
        const defs = await customDefs(trx);
        const existing = before.custom as Record<string, Record<string, unknown>>;
        const c = checkCustom(defs, { [params.section]: body.custom }, existing, [params.section]);
        if (c.errors.length) throw new AppError('validation', 400, c.errors.map((e) => e.message).join('; '), { fields: c.errors });
        cols.custom = JSON.stringify(c.values);
      }
      if (Object.keys(cols).length) await trx.updateTable('employees').set(cols).where('id', '=', params.id).execute();
      const after = await trx.selectFrom('employees').selectAll().where('id', '=', params.id).executeTakeFirstOrThrow();
      await recordAudit(trx, { action: 'update', entityType: 'employee', entityId: params.id, entityLabel: `${after.code} ${employeeName(after)}`, before: snapshot(ctx, before), after: snapshot(ctx, after) });
      await publishEvent(trx, EVENTS.employeeUpdated, { id: params.id, section: params.section });
      return loadProfile(ctx, trx, params.id);
    }),
  );

  route(app, P.remove, { access: { resource: RES.employees, action: 'delete' } }, async ({ params }) =>
    ctx.db.tx(async (trx: Trx) => {
      const before = await trx.selectFrom('employees').selectAll().where('id', '=', params.id).executeTakeFirst();
      if (!before) throw notFound('Employee');
      await requireOnEmployee(trx, RES.employees, 'delete', params.id);
      const reports = await trx.selectFrom('employees').select(sql<number>`count(*)::int`.as('n')).where('manager_id', '=', params.id).executeTakeFirstOrThrow();
      if (reports.n > 0) throw conflict(`${reports.n} people report to ${employeeName(before)}. Give them a new manager first.`);
      await trx.deleteFrom('employees').where('id', '=', params.id).execute();
      await recordAudit(trx, { action: 'delete', entityType: 'employee', entityId: params.id, entityLabel: `${before.code} ${employeeName(before)}`, before: snapshot(ctx, before) });
      return { ok: true as const };
    }),
  );

  // Repeatable sections.
  route(app, P.records, { access: { resource: RES.employees, action: 'view' } }, async ({ params }) =>
    ctx.db.tx(async (trx: Trx) => {
      await requireOnEmployee(trx, RES.employees, 'view', params.id);
      const rows = await trx.selectFrom('employee_records').selectAll().where('employee_id', '=', params.id).where('section', '=', params.section).orderBy('created_at').execute();
      const salary = (await unmaskedFor(trx, [params.id])).salary.has(params.id);
      return {
        items: rows.map((r) => {
          const data = { ...(r.data as Record<string, unknown>) };
          if (params.section === 'experience' && !salary && data.lastCtcPaise !== undefined) data.lastCtcPaise = null;
          return { id: r.id, data: { ...data, hasFile: !!r.file_key }, updatedAt: new Date(r.updated_at!).toISOString() };
        }),
      };
    }),
  );

  const recordWrite = async (trx: Trx, employeeId: string, section: keyof typeof RECORD_SECTIONS, data: unknown) => {
    const exists = await trx.selectFrom('employees').select('id').where('id', '=', employeeId).executeTakeFirst();
    if (!exists) throw notFound('Employee');
    await requireOnEmployee(trx, RES.employees, 'edit', employeeId);
    const parsed = parseSection(RECORD_SECTIONS[section], data) as Record<string, unknown>;
    if (section === 'experience' && parsed.lastCtcPaise != null) await requireOnEmployee(trx, RES.salary, 'edit', employeeId);
    return parsed;
  };

  route(app, P.addRecord, { access: { resource: RES.employees, action: 'edit' }, status: 201 }, async ({ params, body }) =>
    ctx.db.tx(async (trx: Trx) => {
      const data = await recordWrite(trx, params.id, params.section, body.data);
      const id = randomUUID();
      await trx.insertInto('employee_records').values({ id, tenant_id: requireTenantId(), employee_id: params.id, section: params.section, data: JSON.stringify(data), file_key: null }).execute();
      await recordAudit(trx, { action: 'create', entityType: `employee.${params.section}`, entityId: id, entityLabel: params.id, after: data });
      return { id };
    }),
  );

  route(app, P.updateRecord, { access: { resource: RES.employees, action: 'edit' } }, async ({ params, body }) =>
    ctx.db.tx(async (trx: Trx) => {
      const data = await recordWrite(trx, params.id, params.section, body.data);
      const before = await trx.selectFrom('employee_records').selectAll().where('id', '=', params.recordId).where('employee_id', '=', params.id).where('section', '=', params.section).executeTakeFirst();
      if (!before) throw notFound('Record');
      await trx.updateTable('employee_records').set({ data: JSON.stringify(data) }).where('id', '=', before.id).execute();
      await recordAudit(trx, { action: 'update', entityType: `employee.${params.section}`, entityId: before.id, entityLabel: params.id, before: before.data as Record<string, unknown>, after: data });
      return { ok: true as const };
    }),
  );

  route(app, P.deleteRecord, { access: { resource: RES.employees, action: 'edit' } }, async ({ params }) =>
    ctx.db.tx(async (trx: Trx) => {
      await requireOnEmployee(trx, RES.employees, 'edit', params.id);
      const before = await trx.selectFrom('employee_records').selectAll().where('id', '=', params.recordId).where('employee_id', '=', params.id).where('section', '=', params.section).executeTakeFirst();
      if (!before) throw notFound('Record');
      await trx.deleteFrom('employee_records').where('id', '=', before.id).execute();
      if (before.file_key) await ctx.files.delete(before.file_key);
      await recordAudit(trx, { action: 'delete', entityType: `employee.${params.section}`, entityId: before.id, entityLabel: params.id, before: before.data as Record<string, unknown> });
      return { ok: true as const };
    }),
  );

  // Document files: raw upload and download.
  const docPath = '/api/v1/employees/:id/records/documents/:recordId/file';
  app.put(docPath, { config: { access: { resource: RES.employees, action: 'edit' }, rawBody: true }, schema: { hide: true } }, async (req) => {
    const { id, recordId } = req.params as { id: string; recordId: string };
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest('Send the file as the request body');
    const key = `${requireTenantId()}/documents/${id}/${recordId}`;
    await ctx.db.tx(async (trx: Trx) => {
      await requireOnEmployee(trx, RES.employees, 'edit', id);
      const r = await trx.selectFrom('employee_records').select(['id', 'data']).where('id', '=', recordId).where('employee_id', '=', id).where('section', '=', 'documents').executeTakeFirst();
      if (!r) throw notFound('Document');
      await ctx.files.put(key, body);
      const fileName = String(req.headers['x-file-name'] ?? 'document').slice(0, 255);
      await trx.updateTable('employee_records').set({ file_key: key, data: JSON.stringify({ ...(r.data as object), fileName }) }).where('id', '=', recordId).execute();
      await recordAudit(trx, { action: 'update', entityType: 'employee.documents', entityId: recordId, entityLabel: id, before: { file: null }, after: { file: fileName } });
    });
    return { ok: true };
  });
  app.get(docPath, { config: { access: { resource: RES.employees, action: 'view' } }, schema: { hide: true } }, async (req, reply) => {
    const { id, recordId } = req.params as { id: string; recordId: string };
    const r = await ctx.db.tx(async (trx: Trx) => {
      await requireOnEmployee(trx, RES.employees, 'view', id);
      return trx.selectFrom('employee_records').select(['file_key', 'data']).where('id', '=', recordId).where('employee_id', '=', id).executeTakeFirst();
    });
    const file = r?.file_key ? await ctx.files.get(r.file_key) : null;
    if (!file) throw notFound('File');
    const name = String((r!.data as { fileName?: string }).fileName ?? 'document').replace(/[^\w.-]/g, '_');
    return reply.header('content-type', 'application/octet-stream').header('content-disposition', `attachment; filename="${name}"`).send(file);
  });

  // Job history.
  const history = async (trx: Trx, employeeId: string): Promise<JobEvent[]> => {
    const events = await trx.selectFrom('employee_job_events as j').leftJoin('users as u', 'u.id', 'j.created_by').select(['j.id', 'j.effective_from', 'j.changes', 'j.reason', 'j.created_at', 'u.name as by']).where('j.employee_id', '=', employeeId).orderBy('j.effective_from', 'desc').orderBy('j.created_at', 'desc').execute();
    const salary = (await unmaskedFor(trx, [employeeId])).salary.has(employeeId);
    const ids = new Set<string>();
    for (const e of events) for (const [k, v] of Object.entries(e.changes)) if (k !== 'ctcAnnualPaise' && typeof v === 'string') ids.add(v);
    const list = [...ids];
    const units = list.length ? await trx.selectFrom('org_units').select(['id', 'name']).where('id', 'in', list).execute() : [];
    const emps = list.length ? await trx.selectFrom('employees').select(['id', 'first_name', 'middle_name', 'last_name', 'display_name']).where('id', 'in', list).execute() : [];
    const nameOf = (v: string) => units.find((u) => u.id === v)?.name ?? (emps.find((x) => x.id === v) ? employeeName(emps.find((x) => x.id === v)!) : null);
    return events.map((e) => {
      const changes: JobEvent['changes'] = {};
      for (const [k, v] of Object.entries(e.changes)) if (k !== 'ctcAnnualPaise') changes[k] = { id: (v as string | null) ?? null, name: typeof v === 'string' ? nameOf(v) : null };
      const hasCtc = 'ctcAnnualPaise' in e.changes;
      return {
        id: e.id,
        effectiveFrom: e.effective_from,
        changes,
        ctcAnnualPaise: hasCtc && salary ? ((e.changes.ctcAnnualPaise as number | null) ?? null) : null,
        ctcMasked: hasCtc && !salary,
        reason: e.reason,
        createdAt: new Date(e.created_at).toISOString(),
        createdBy: e.by ?? null,
      };
    });
  };

  route(app, P.jobHistory, { access: { resource: RES.job, action: 'view' } }, async ({ params }) =>
    ctx.db.tx(async (trx: Trx) => {
      await requireOnEmployee(trx, RES.job, 'view', params.id);
      return { items: await history(trx, params.id) };
    }),
  );

  route(app, P.addJobChange, { access: { resource: RES.job, action: 'edit' }, status: 201 }, async ({ params, body }) =>
    ctx.db.tx(async (trx: Trx) => {
      const e = await trx.selectFrom('employees').selectAll().where('id', '=', params.id).forUpdate().executeTakeFirst();
      if (!e) throw notFound('Employee');
      await requireOnEmployee(trx, RES.job, 'edit', params.id);
      const { effectiveFrom, reason, ...rest } = body;
      if (rest.ctcAnnualPaise !== undefined) await requireOnEmployee(trx, RES.salary, 'edit', params.id);
      if (effectiveFrom < e.date_of_joining) throw badRequest('A job change cannot start before the joining date');
      const values = await checkJob(trx, params.id, jobValues(rest));
      const eventId = await addJobEvent(trx, params.id, { effectiveFrom, reason: reason ?? null, values }, currentContext()?.userId ?? null);
      await refreshCurrentJob(trx, params.id);
      await recordAudit(trx, {
        action: 'create',
        entityType: 'employee.job',
        entityId: eventId,
        entityLabel: `${e.code} ${employeeName(e)} from ${effectiveFrom}`,
        after: { effectiveFrom, reason, ...values },
        redact: ['ctcAnnualPaise'],
      });
      await publishEvent(trx, EVENTS.jobChanged, { id: params.id, effectiveFrom, future: effectiveFrom > todayIst() });
      return { items: await history(trx, params.id) };
    }),
  );

  // Custom fields.
  route(app, P.customFields, { access: { resource: RES.employees, action: 'view' } }, async () => ({ items: await ctx.db.tx((trx: Trx) => customDefs(trx)) }));

  route(app, P.createCustomField, { access: { resource: RES.customFields, action: 'add' }, status: 201 }, async ({ body }) => {
    requireGlobal(RES.customFields, 'add');
    if (body.type === 'select' && body.options.length === 0) throw badRequest('A list field needs at least one option');
    if (body.validation.pattern) {
      try {
        new RegExp(body.validation.pattern);
      } catch {
        throw badRequest('The pattern is not a valid regular expression');
      }
    }
    return ctx.db.tx(async (trx: Trx) => {
      const id = randomUUID();
      await trx
        .insertInto('custom_field_defs')
        .values({ id, tenant_id: requireTenantId(), section: body.section, key: body.key, label: body.label, type: body.type, required: body.required, options: JSON.stringify(body.options), validation: JSON.stringify(body.validation), position: body.position, active: true })
        .execute();
      await recordAudit(trx, { action: 'create', entityType: 'custom_field', entityId: id, entityLabel: body.label, after: body });
      return (await customDefs(trx)).find((d) => d.id === id)!;
    });
  });

  route(app, P.updateCustomField, { access: { resource: RES.customFields, action: 'edit' } }, async ({ params, body }) => {
    requireGlobal(RES.customFields, 'edit');
    return ctx.db.tx(async (trx: Trx) => {
      const before = (await customDefs(trx)).find((d) => d.id === params.id);
      if (!before) throw notFound('Custom field');
      const set = {
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.required !== undefined ? { required: body.required } : {}),
        ...(body.options !== undefined ? { options: JSON.stringify(body.options) } : {}),
        ...(body.validation !== undefined ? { validation: JSON.stringify(body.validation) } : {}),
        ...(body.position !== undefined ? { position: body.position } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      };
      if (Object.keys(set).length) await trx.updateTable('custom_field_defs').set(set).where('id', '=', params.id).execute();
      const after = (await customDefs(trx)).find((d) => d.id === params.id)!;
      await recordAudit(trx, { action: 'update', entityType: 'custom_field', entityId: params.id, entityLabel: after.label, before, after });
      return after;
    });
  });
}

