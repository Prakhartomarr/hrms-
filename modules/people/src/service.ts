/**
 * Employee master service: create, update, job changes and the profile view. Used by the
 * routes, the Excel import and the seed, so every path writes the same way (encryption,
 * code series, job history, audit).
 */
import { randomUUID } from 'node:crypto';
import {
  RES,
  type CustomFieldDef,
  type EmployeeProfile,
  type JobChangeInput,
  type SensitiveField,
} from '@hrms/contracts';
import type { EmployeesTable, Selectable } from '@hrms/db';
import {
  employeeName,
  JOB_FIELDS,
  maskAadhaar,
  maskAccount,
  maskPan,
  resolveJobAsOf,
  skipLevelOf,
  todayIst,
  validateCustomValues,
  wouldCycle,
  type JobField,
} from '@hrms/domain';
import type { ModuleContext } from '@hrms/module-sdk';
import { AppError, badRequest, canOnEmployee, visibleAmong, keyedHash, nextEmployeeCode, notFound, recordAudit, requireTenantId } from '@hrms/platform';
import type { Trx } from './tables.js';

type Row = Selectable<EmployeesTable>;
export type JobValuesInput = Partial<Record<JobField, string | number | null>>;

export interface NewEmployee {
  code?: string | undefined;
  personal: Record<string, unknown> & { firstName: string };
  contact?: Record<string, unknown> | undefined;
  identity?: Record<string, unknown> | undefined;
  bank?: Record<string, unknown> | undefined;
  employment: { entityId: string; dateOfJoining: string; employmentType: string; status: string; probationEndDate?: string | null; exitDate?: string | null };
  job?: JobValuesInput | undefined;
  custom?: Record<string, Record<string, unknown>> | undefined;
}

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

const PLAIN: Record<string, string[]> = {
  personal: ['firstName', 'middleName', 'lastName', 'displayName', 'gender', 'dateOfBirth', 'maritalStatus', 'bloodGroup', 'nationality', 'fatherName'],
  contact: ['workEmail', 'personalEmail', 'mobile', 'alternateMobile', 'currentAddress', 'permanentAddress'],
  identity: ['passportNumber', 'passportExpiry', 'uan', 'esicNumber'],
  bank: ['bankName', 'ifsc', 'accountHolderName'],
  employment: ['entityId', 'dateOfJoining', 'employmentType', 'status', 'probationEndDate', 'exitDate'],
};

/** Section data -> employees columns, sealing PAN, Aadhaar and account numbers. */
export function toColumns(ctx: ModuleContext, section: string, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PLAIN[section] ?? []) if (k in data) out[snake(k)] = data[k] ?? null;
  const key = ctx.config.ENCRYPTION_KEY;
  if (section === 'identity') {
    if ('pan' in data) {
      const v = (data.pan as string | null) ?? null;
      Object.assign(out, { pan_enc: v ? ctx.secrets.seal(v) : null, pan_hash: v ? keyedHash(key, `pan:${v}`) : null, pan_masked: v ? maskPan(v) : null });
    }
    if ('aadhaar' in data) {
      const v = (data.aadhaar as string | null) ?? null;
      Object.assign(out, { aadhaar_enc: v ? ctx.secrets.seal(v) : null, aadhaar_hash: v ? keyedHash(key, `aadhaar:${v}`) : null, aadhaar_masked: v ? maskAadhaar(v) : null });
    }
  }
  if (section === 'bank' && 'accountNumber' in data) {
    const v = (data.accountNumber as string | null) ?? null;
    Object.assign(out, { bank_account_enc: v ? ctx.secrets.seal(v) : null, bank_account_masked: v ? maskAccount(v) : null });
  }
  return out;
}

export const panHash = (ctx: ModuleContext, pan: string) => keyedHash(ctx.config.ENCRYPTION_KEY, `pan:${pan}`);
export const aadhaarHash = (ctx: ModuleContext, a: string) => keyedHash(ctx.config.ENCRYPTION_KEY, `aadhaar:${a}`);

const open = (ctx: ModuleContext, sealed: string | null) => (sealed ? ctx.secrets.open<string>(sealed) : null);

/** Plain snapshot of a row for the audit log (sensitive values are redacted by recordAudit). */
export function snapshot(ctx: ModuleContext, r: Row): Record<string, unknown> {
  const s: Record<string, unknown> = { code: r.code };
  for (const [section, keys] of Object.entries(PLAIN)) for (const k of keys) s[`${section}.${k}`] = (r as unknown as Record<string, unknown>)[snake(k)] ?? null;
  s['identity.pan'] = open(ctx, r.pan_enc);
  s['identity.aadhaar'] = open(ctx, r.aadhaar_enc);
  s['bank.accountNumber'] = open(ctx, r.bank_account_enc);
  s.custom = r.custom;
  return s;
}

const UNIT_KIND_OF: Partial<Record<JobField, string>> = {
  designationId: 'designation',
  gradeId: 'grade',
  businessUnitId: 'business_unit',
  departmentId: 'department',
  subDepartmentId: 'sub_department',
  locationId: 'location',
  costCentreId: 'cost_centre',
};

export async function managerMap(trx: Trx): Promise<Map<string, string | null>> {
  const rows = await trx.selectFrom('employees').select(['id', 'manager_id']).execute();
  return new Map(rows.map((r) => [r.id, r.manager_id]));
}

/** Checks a job change: units of the right kind, existing managers, no reporting loop. */
export async function checkJob(trx: Trx, employeeId: string, job: JobValuesInput, managerOf?: Map<string, string | null>): Promise<JobValuesInput> {
  const out = { ...job };
  const unitIds = Object.entries(UNIT_KIND_OF).flatMap(([f]) => (out[f as JobField] ? [out[f as JobField] as string] : []));
  const units = unitIds.length ? await trx.selectFrom('org_units').select(['id', 'kind', 'parent_id']).where('id', 'in', unitIds).execute() : [];
  for (const [field, kind] of Object.entries(UNIT_KIND_OF)) {
    const id = out[field as JobField];
    if (!id) continue;
    const u = units.find((x) => x.id === id);
    if (!u || u.kind !== kind) throw badRequest(`${field}: not a ${kind.replace('_', '-')}`, { field });
  }
  if (out.subDepartmentId) {
    const sub = units.find((x) => x.id === out.subDepartmentId)!;
    if (out.departmentId === undefined) out.departmentId = sub.parent_id;
    else if (out.departmentId !== sub.parent_id) throw badRequest('The sub-department belongs to another department', { field: 'subDepartmentId' });
  }
  for (const f of ['managerId', 'functionalManagerId'] as const) {
    const m = out[f];
    if (!m) continue;
    if (m === employeeId) throw badRequest('An employee cannot report to themselves', { field: f });
    const map = managerOf ?? (await managerMap(trx));
    if (!map.has(m as string)) throw badRequest(`${f}: unknown employee`, { field: f });
    if (f === 'managerId' && wouldCycle(employeeId, m as string, map)) throw badRequest('That manager reports to this employee, which would make a loop', { field: f });
  }
  return out;
}

/** Recomputes the current-job columns from the job history, as of `day` (default today, IST). */
export async function refreshCurrentJob(trx: Trx, employeeId: string, day = todayIst()): Promise<void> {
  const events = await trx.selectFrom('employee_job_events').select(['effective_from', 'created_at', 'changes']).where('employee_id', '=', employeeId).execute();
  const { values } = resolveJobAsOf(
    events.map((e) => ({ effectiveFrom: e.effective_from, recordedAt: new Date(e.created_at).toISOString(), values: e.changes as JobValuesInput as never })),
    day,
  );
  const set: Record<string, unknown> = { job_as_of: day };
  for (const f of JOB_FIELDS) set[snake(f)] = values[f];
  await trx.updateTable('employees').set(set).where('id', '=', employeeId).execute();
}

export async function addJobEvent(
  trx: Trx,
  employeeId: string,
  input: { effectiveFrom: string; reason?: string | null | undefined; values: JobValuesInput },
  createdBy: string | null,
): Promise<string> {
  const changes = Object.fromEntries(JOB_FIELDS.filter((f) => input.values[f] !== undefined).map((f) => [f, input.values[f] ?? null]));
  if (Object.keys(changes).length === 0) throw badRequest('Nothing to change');
  const id = randomUUID();
  await trx
    .insertInto('employee_job_events')
    .values({ id, tenant_id: requireTenantId(), employee_id: employeeId, effective_from: input.effectiveFrom, changes: JSON.stringify(changes), reason: input.reason ?? null, created_by: createdBy })
    .execute();
  return id;
}

export async function customDefs(trx: Trx): Promise<CustomFieldDef[]> {
  const rows = await trx.selectFrom('custom_field_defs').selectAll().orderBy('section').orderBy('position').orderBy('label').execute();
  return rows.map((r) => ({
    id: r.id,
    section: r.section as CustomFieldDef['section'],
    key: r.key,
    label: r.label,
    type: r.type as CustomFieldDef['type'],
    required: r.required,
    options: r.options as string[],
    validation: r.validation as CustomFieldDef['validation'],
    position: r.position,
    active: r.active,
  }));
}

/** Validates custom values for the sections given; throws one 400 listing every problem. */
export function checkCustom(defs: CustomFieldDef[], input: Record<string, Record<string, unknown>>, existing: Record<string, Record<string, unknown>> = {}, sections?: string[]) {
  const out: Record<string, Record<string, unknown>> = { ...existing };
  const errors: { field: string; message: string }[] = [];
  const all = sections ?? [...new Set(defs.map((d) => d.section))];
  for (const section of all) {
    const r = validateCustomValues(
      defs.filter((d) => d.section === section),
      { ...(existing[section] ?? {}), ...(input[section] ?? {}) },
    );
    out[section] = r.values;
    for (const e of r.errors) errors.push({ field: `custom.${section}.${e.key}`, message: e.message });
  }
  return { values: out, errors };
}

/** Creates an employee: code from the entity's series when none is given, job from joining date. */
export async function createEmployee(ctx: ModuleContext, trx: Trx, input: NewEmployee, opts: { actorUserId?: string | null; managerOf?: Map<string, string | null>; defs?: CustomFieldDef[] } = {}): Promise<{ id: string; code: string }> {
  const id = randomUUID();
  const code = input.code?.trim() || (await nextEmployeeCode(trx, input.employment.entityId, input.employment.dateOfJoining));
  const defs = opts.defs ?? (await customDefs(trx));
  const custom = checkCustom(defs, input.custom ?? {});
  if (custom.errors.length) throw new AppError('validation', 400, custom.errors.map((e) => e.message).join('; '), { fields: custom.errors });
  const cols = {
    ...toColumns(ctx, 'personal', input.personal),
    ...toColumns(ctx, 'contact', input.contact ?? {}),
    ...toColumns(ctx, 'identity', input.identity ?? {}),
    ...toColumns(ctx, 'bank', input.bank ?? {}),
    ...toColumns(ctx, 'employment', input.employment),
  };
  await trx
    .insertInto('employees')
    .values({ ...(cols as Record<string, never>), id, tenant_id: requireTenantId(), code, custom: JSON.stringify(custom.values) } as never)
    .execute();
  if (input.job && Object.values(input.job).some((v) => v !== undefined && v !== null)) {
    const job = await checkJob(trx, id, input.job, opts.managerOf);
    await addJobEvent(trx, id, { effectiveFrom: input.employment.dateOfJoining, reason: 'Joined', values: job }, opts.actorUserId ?? null);
    opts.managerOf?.set(id, (job.managerId as string | null | undefined) ?? null);
  } else opts.managerOf?.set(id, null);
  await refreshCurrentJob(trx, id);
  const row = await trx.selectFrom('employees').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  await recordAudit(trx, { action: 'create', entityType: 'employee', entityId: id, entityLabel: `${code} ${employeeName(row)}`, after: snapshot(ctx, row) });
  return { id, code };
}

/** The sensitive groups this viewer may see unmasked, for a set of employees. */
export async function unmaskedFor(trx: Trx, ids: string[]): Promise<Record<SensitiveField, Set<string>>> {
  return {
    pan: await visibleAmong(trx, RES.pan, 'view', ids),
    aadhaar: await visibleAmong(trx, RES.aadhaar, 'view', ids),
    bank: await visibleAmong(trx, RES.bank, 'view', ids),
    salary: await visibleAmong(trx, RES.salary, 'view', ids),
  };
}

const dateOnly = (v: string | null) => v;

export async function loadProfile(ctx: ModuleContext, trx: Trx, id: string): Promise<EmployeeProfile> {
  const r = await trx.selectFrom('employees').selectAll().where('id', '=', id).executeTakeFirst();
  if (!r) throw notFound('Employee');
  const see = await unmaskedFor(trx, [id]);
  const masked = (['pan', 'aadhaar', 'bank', 'salary'] as const).filter((f) => !see[f].has(id));
  const unitIds = [r.designation_id, r.grade_id, r.business_unit_id, r.department_id, r.sub_department_id, r.location_id, r.cost_centre_id].filter(Boolean) as string[];
  const units = unitIds.length ? await trx.selectFrom('org_units').select(['id', 'name', 'code']).where('id', 'in', unitIds).execute() : [];
  const unit = (uid: string | null) => {
    const u = uid ? units.find((x) => x.id === uid) : undefined;
    return u ? { id: u.id, name: u.name, code: u.code } : null;
  };
  const managerOf = await managerMap(trx);
  const skip = skipLevelOf(id, managerOf);
  const peopleIds = [r.manager_id, r.functional_manager_id, skip].filter(Boolean) as string[];
  const people = peopleIds.length
    ? await trx.selectFrom('employees').select(['id', 'code', 'first_name', 'middle_name', 'last_name', 'display_name']).where('id', 'in', peopleIds).execute()
    : [];
  const person = (pid: string | null) => {
    const p = pid ? people.find((x) => x.id === pid) : undefined;
    return p ? { id: p.id, name: employeeName(p), code: p.code } : null;
  };
  const entity = await trx.selectFrom('legal_entities').select(['id', 'name', 'code']).where('id', '=', r.entity_id).executeTakeFirst();
  const user = await trx.selectFrom('users').select('id').where('employee_id', '=', id).executeTakeFirst();
  const pick = (section: string) => Object.fromEntries((PLAIN[section] ?? []).map((k) => [k, (r as unknown as Record<string, unknown>)[snake(k)] ?? null]));
  const showPan = !masked.includes('pan');
  const showAadhaar = !masked.includes('aadhaar');
  const showBank = !masked.includes('bank');
  return {
    id: r.id,
    code: r.code,
    name: employeeName(r),
    entity: entity ? { id: entity.id, name: entity.name, code: entity.code } : null,
    personal: pick('personal') as EmployeeProfile['personal'],
    contact: pick('contact') as EmployeeProfile['contact'],
    identity: {
      ...(pick('identity') as Record<string, string | null>),
      pan: showPan ? open(ctx, r.pan_enc) : r.pan_masked,
      aadhaar: showAadhaar ? open(ctx, r.aadhaar_enc) : r.aadhaar_masked,
    },
    bank: {
      bankName: r.bank_name,
      accountHolderName: r.account_holder_name,
      accountNumber: showBank ? open(ctx, r.bank_account_enc) : r.bank_account_masked,
      ifsc: showBank ? r.ifsc : r.ifsc ? `${r.ifsc.slice(0, 4)}XXXXXXX` : null,
    },
    employment: {
      entityId: r.entity_id,
      dateOfJoining: r.date_of_joining,
      employmentType: r.employment_type,
      status: r.status,
      probationEndDate: dateOnly(r.probation_end_date),
      exitDate: dateOnly(r.exit_date),
    },
    job: {
      designation: unit(r.designation_id),
      grade: unit(r.grade_id),
      businessUnit: unit(r.business_unit_id),
      department: unit(r.department_id),
      subDepartment: unit(r.sub_department_id),
      location: unit(r.location_id),
      costCentre: unit(r.cost_centre_id),
      manager: person(r.manager_id),
      functionalManager: person(r.functional_manager_id),
      skipLevelManager: person(skip),
      ctcAnnualPaise: masked.includes('salary') ? null : r.ctc_annual_paise,
    },
    custom: r.custom as Record<string, Record<string, unknown>>,
    masked,
    can: {
      edit: await canOnEmployee(trx, RES.employees, 'edit', id),
      editJob: await canOnEmployee(trx, RES.job, 'edit', id),
      delete: await canOnEmployee(trx, RES.employees, 'delete', id),
      viewJob: await canOnEmployee(trx, RES.job, 'view', id),
    },
    userId: user?.id ?? null,
  };
}

/** Job change from the API shape to stored values (only keys present). */
export function jobValues(input: Omit<JobChangeInput, 'effectiveFrom' | 'reason'>): JobValuesInput {
  const out: JobValuesInput = {};
  for (const f of JOB_FIELDS) {
    const v = (input as Record<string, unknown>)[f];
    if (v !== undefined) out[f] = v as string | number | null;
  }
  return out;
}

export { camel, snake, PLAIN };
