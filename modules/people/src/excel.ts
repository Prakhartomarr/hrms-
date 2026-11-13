/**
 * Excel import and export of the employee master. One column list drives the template, the
 * import and the export, so a file exported here imports back unchanged.
 */
import {
  bankSection,
  contactSection,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
  identitySection,
  MARITAL,
  personalSection,
  formatInr,
  rupeesToPaise,
  RES,
  type CustomFieldDef,
  type ImportReport,
} from '@hrms/contracts';
import { employeeName, validateCustomValues } from '@hrms/domain';
import type { ModuleContext } from '@hrms/module-sdk';
import { currentContext, scopesOf } from '@hrms/platform';
import ExcelJS from 'exceljs';
import type { z } from 'zod';
import { aadhaarHash, createEmployee, customDefs, managerMap, panHash, type NewEmployee } from './service.js';
import type { Trx } from './tables.js';

export const MAX_IMPORT_ROWS = 5000;

type Kind = 'text' | 'date' | 'enum' | 'money' | 'entity' | 'unit' | 'employee';
interface Col {
  key: string;
  header: string;
  kind: Kind;
  required?: boolean;
  section?: 'personal' | 'contact' | 'identity' | 'bank' | 'employment' | 'job';
  field?: string;
  options?: readonly string[];
  unitKind?: string;
  /** Needs this resource's `edit` right to fill. */
  right?: string;
  hint: string;
}

export const COLUMNS: Col[] = [
  { key: 'code', header: 'Employee code', kind: 'text', hint: 'Leave blank to generate from the entity’s code pattern. Needed for anyone named as a manager.' },
  { key: 'firstName', header: 'First name', kind: 'text', required: true, section: 'personal', field: 'firstName', hint: '' },
  { key: 'middleName', header: 'Middle name', kind: 'text', section: 'personal', field: 'middleName', hint: '' },
  { key: 'lastName', header: 'Last name', kind: 'text', section: 'personal', field: 'lastName', hint: '' },
  { key: 'gender', header: 'Gender', kind: 'enum', options: GENDERS, section: 'personal', field: 'gender', hint: GENDERS.join(', ') },
  { key: 'dateOfBirth', header: 'Date of birth', kind: 'date', section: 'personal', field: 'dateOfBirth', hint: 'YYYY-MM-DD or DD/MM/YYYY' },
  { key: 'maritalStatus', header: 'Marital status', kind: 'enum', options: MARITAL, section: 'personal', field: 'maritalStatus', hint: MARITAL.join(', ') },
  { key: 'bloodGroup', header: 'Blood group', kind: 'text', section: 'personal', field: 'bloodGroup', hint: 'A+, A-, B+, B-, AB+, AB-, O+, O-' },
  { key: 'nationality', header: 'Nationality', kind: 'text', section: 'personal', field: 'nationality', hint: '' },
  { key: 'fatherName', header: 'Father’s name', kind: 'text', section: 'personal', field: 'fatherName', hint: '' },
  { key: 'workEmail', header: 'Work email', kind: 'text', section: 'contact', field: 'workEmail', hint: 'Unique' },
  { key: 'personalEmail', header: 'Personal email', kind: 'text', section: 'contact', field: 'personalEmail', hint: '' },
  { key: 'mobile', header: 'Mobile', kind: 'text', section: 'contact', field: 'mobile', hint: '10 digits, optional +91' },
  { key: 'entity', header: 'Entity code', kind: 'entity', required: true, hint: 'Code of the legal entity' },
  { key: 'dateOfJoining', header: 'Date of joining', kind: 'date', required: true, hint: 'YYYY-MM-DD or DD/MM/YYYY' },
  { key: 'employmentType', header: 'Employment type', kind: 'enum', required: true, options: EMPLOYMENT_TYPES, hint: EMPLOYMENT_TYPES.join(', ') },
  { key: 'status', header: 'Status', kind: 'enum', options: EMPLOYEE_STATUSES, hint: `${EMPLOYEE_STATUSES.join(', ')} (default active)` },
  { key: 'businessUnitId', header: 'Business unit', kind: 'unit', unitKind: 'business_unit', section: 'job', hint: 'Code or name' },
  { key: 'departmentId', header: 'Department', kind: 'unit', unitKind: 'department', section: 'job', hint: 'Code or name' },
  { key: 'subDepartmentId', header: 'Sub-department', kind: 'unit', unitKind: 'sub_department', section: 'job', hint: 'Code or name' },
  { key: 'locationId', header: 'Location', kind: 'unit', unitKind: 'location', section: 'job', hint: 'Code or name' },
  { key: 'gradeId', header: 'Grade', kind: 'unit', unitKind: 'grade', section: 'job', hint: 'Code or name' },
  { key: 'designationId', header: 'Designation', kind: 'unit', unitKind: 'designation', section: 'job', hint: 'Code or name' },
  { key: 'costCentreId', header: 'Cost centre', kind: 'unit', unitKind: 'cost_centre', section: 'job', hint: 'Code or name' },
  { key: 'managerId', header: 'Manager code', kind: 'employee', section: 'job', hint: 'Employee code of the primary manager (in this file or already added)' },
  { key: 'functionalManagerId', header: 'Functional manager code', kind: 'employee', section: 'job', hint: 'Employee code' },
  { key: 'ctcAnnualPaise', header: 'Annual CTC (₹)', kind: 'money', section: 'job', right: RES.salary, hint: 'Rupees, e.g. 12,00,000' },
  { key: 'pan', header: 'PAN', kind: 'text', section: 'identity', field: 'pan', right: RES.pan, hint: 'ABCDE1234F' },
  { key: 'aadhaar', header: 'Aadhaar', kind: 'text', section: 'identity', field: 'aadhaar', right: RES.aadhaar, hint: '12 digits' },
  { key: 'passportNumber', header: 'Passport number', kind: 'text', section: 'identity', field: 'passportNumber', hint: '' },
  { key: 'passportExpiry', header: 'Passport expiry', kind: 'date', section: 'identity', field: 'passportExpiry', hint: 'YYYY-MM-DD' },
  { key: 'uan', header: 'UAN', kind: 'text', section: 'identity', field: 'uan', hint: '12 digits' },
  { key: 'esicNumber', header: 'ESIC number', kind: 'text', section: 'identity', field: 'esicNumber', hint: '10 or 17 digits' },
  { key: 'bankName', header: 'Bank name', kind: 'text', section: 'bank', field: 'bankName', right: RES.bank, hint: '' },
  { key: 'accountNumber', header: 'Account number', kind: 'text', section: 'bank', field: 'accountNumber', right: RES.bank, hint: '9 to 18 digits' },
  { key: 'ifsc', header: 'IFSC', kind: 'text', section: 'bank', field: 'ifsc', right: RES.bank, hint: 'HDFC0001234' },
  { key: 'accountHolderName', header: 'Account holder name', kind: 'text', section: 'bank', field: 'accountHolderName', right: RES.bank, hint: '' },
];

const SECTION_SCHEMA: Record<string, z.ZodObject> = { personal: personalSection, contact: contactSection, identity: identitySection, bank: bankSection };

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('').trim();
    if ('text' in v) return String(v.text).trim();
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    return '';
  }
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function parseDate(s: string): string | null {
  let y: number, m: number, d: number;
  let r: RegExpExecArray | null;
  if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -](\d{4})$/.exec(s))) [d, m, y] = [Number(r[1]), MONTHS.indexOf(r[2]!.toLowerCase()) + 1, Number(r[3])];
  else return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso ? iso : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[*’']/g, '').replace(/\s+/g, ' ').trim();

interface ParsedRow {
  row: number;
  raw: Record<string, string>;
}

export async function readWorkbook(buf: Buffer, defs: CustomFieldDef[]): Promise<{ rows: ParsedRow[]; unknownHeaders: string[] }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw Object.assign(new Error('This is not a readable .xlsx file'), { statusCode: 400 });
  }
  const ws = wb.getWorksheet('Employees') ?? wb.worksheets[0];
  if (!ws) throw Object.assign(new Error('The workbook has no sheets'), { statusCode: 400 });
  const byHeader = new Map<string, string>();
  for (const c of COLUMNS) byHeader.set(norm(c.header), c.key);
  for (const d of defs.filter((x) => x.active)) byHeader.set(norm(d.label), `custom:${d.section}:${d.key}`);
  const keys: (string | null)[] = [];
  const unknownHeaders: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    const h = cellText(cell.value);
    const k = h ? (byHeader.get(norm(h)) ?? null) : null;
    if (h && !k) unknownHeaders.push(h);
    keys[col] = k;
  });
  const rows: ParsedRow[] = [];
  ws.eachRow({ includeEmpty: false }, (r, n) => {
    if (n === 1) return;
    const raw: Record<string, string> = {};
    r.eachCell({ includeEmpty: false }, (cell, col) => {
      const k = keys[col];
      if (k) raw[k] = cellText(cell.value);
    });
    if (Object.values(raw).some((v) => v !== '')) rows.push({ row: n, raw });
  });
  return { rows, unknownHeaders };
}

interface Lookups {
  entities: Map<string, string>;
  units: Map<string, string>; // `${kind}:${code|name}` -> id
  employees: Map<string, string>; // code (upper) -> id
  workEmails: Set<string>;
  panHashes: Set<string>;
  aadhaarHashes: Set<string>;
}

async function lookups(trx: Trx): Promise<Lookups> {
  const entities = new Map((await trx.selectFrom('legal_entities').select(['id', 'code']).execute()).map((e) => [e.code.toUpperCase(), e.id]));
  const units = new Map<string, string>();
  for (const u of await trx.selectFrom('org_units').select(['id', 'kind', 'code', 'name']).where('active', '=', true).execute()) {
    units.set(`${u.kind}:${u.code.toLowerCase()}`, u.id);
    if (!units.has(`${u.kind}:${u.name.toLowerCase()}`)) units.set(`${u.kind}:${u.name.toLowerCase()}`, u.id);
  }
  const emps = await trx.selectFrom('employees').select(['id', 'code', 'work_email', 'pan_hash', 'aadhaar_hash']).execute();
  return {
    entities,
    units,
    employees: new Map(emps.map((e) => [e.code.toUpperCase(), e.id])),
    workEmails: new Set(emps.flatMap((e) => (e.work_email ? [e.work_email.toLowerCase()] : []))),
    panHashes: new Set(emps.flatMap((e) => (e.pan_hash ? [e.pan_hash] : []))),
    aadhaarHashes: new Set(emps.flatMap((e) => (e.aadhaar_hash ? [e.aadhaar_hash] : []))),
  };
}

interface Candidate {
  row: number;
  input: NewEmployee;
  managerCode: string | null;
  functionalCode: string | null;
}

/** Validates every row and, unless dry-run or any row failed, creates them all in one transaction. */
export async function importEmployees(ctx: ModuleContext, trx: Trx, buf: Buffer, dryRun: boolean): Promise<ImportReport> {
  const defs = await customDefs(trx);
  const { rows } = await readWorkbook(buf, defs);
  if (rows.length > MAX_IMPORT_ROWS) throw Object.assign(new Error(`At most ${MAX_IMPORT_ROWS} rows per file`), { statusCode: 400 });
  const L = await lookups(trx);
  const header = (k: string) => COLUMNS.find((c) => c.key === k)?.header ?? defs.find((d) => `custom:${d.section}:${d.key}` === k)?.label ?? k;
  const addScopes = scopesOf(RES.employees, 'add');
  const can = (resource: string) => scopesOf(resource, 'edit').length > 0;

  const seenCodes = new Map<string, number>();
  const seenEmails = new Map<string, number>();
  const seenPan = new Map<string, number>();
  const seenAadhaar = new Map<string, number>();
  const report: ImportReport['rows'] = [];
  const candidates: Candidate[] = [];

  for (const { row, raw } of rows) {
    const errors: { column: string; message: string }[] = [];
    const err = (key: string, message: string) => errors.push({ column: header(key), message });
    const sections: Record<string, Record<string, unknown>> = { personal: {}, contact: {}, identity: {}, bank: {} };
    const job: Record<string, string | number | null> = {};
    let entityId: string | null = null;
    let doj: string | null = null;
    let employmentType: string | null = null;
    let status = 'active';
    let managerCode: string | null = null;
    let functionalCode: string | null = null;

    for (const c of COLUMNS) {
      const v = raw[c.key] ?? '';
      if (!v) {
        if (c.required) err(c.key, 'Required');
        continue;
      }
      if (c.right && !can(c.right)) {
        err(c.key, 'You do not have the right to set this field');
        continue;
      }
      switch (c.kind) {
        case 'date': {
          const d = parseDate(v);
          if (!d) err(c.key, `Not a date: ${v}`);
          else if (c.key === 'dateOfJoining') doj = d;
          else if (c.section) sections[c.section]![c.field!] = d;
          break;
        }
        case 'enum': {
          const hit = c.options!.find((o) => o === v.toLowerCase().replace(/[\s-]+/g, '_'));
          if (!hit) err(c.key, `Use one of: ${c.options!.join(', ')}`);
          else if (c.key === 'employmentType') employmentType = hit;
          else if (c.key === 'status') status = hit;
          else sections[c.section!]![c.field!] = hit;
          break;
        }
        case 'entity':
          entityId = L.entities.get(v.toUpperCase()) ?? null;
          if (!entityId) err(c.key, `No legal entity with code ${v}`);
          else if (!addScopes.some((s) => s.scope === 'all' && (s.entityId === null || s.entityId === entityId))) err(c.key, 'You may not add employees to this entity');
          break;
        case 'unit': {
          const id = L.units.get(`${c.unitKind}:${v.toLowerCase()}`);
          if (!id) err(c.key, `No ${c.unitKind!.replace('_', '-')} called ${v}`);
          else job[c.key] = id;
          break;
        }
        case 'employee':
          if (c.key === 'managerId') managerCode = v.toUpperCase();
          else functionalCode = v.toUpperCase();
          break;
        case 'money': {
          const p = rupeesToPaise(v);
          if (p === null || p < 0) err(c.key, `Not an amount: ${v}`);
          else job[c.key] = p;
          break;
        }
        default:
          if (c.key === 'code') break;
          sections[c.section!]![c.field!] = v;
      }
    }

    // Field formats (PAN, Aadhaar, IFSC, email, mobile ...) through the same schemas as the API.
    const parsed: Record<string, Record<string, unknown>> = {};
    for (const [section, data] of Object.entries(sections)) {
      const schema = SECTION_SCHEMA[section]!;
      const r = (section === 'personal' ? schema : schema.partial()).safeParse(data);
      if (r.success) parsed[section] = r.data as Record<string, unknown>;
      else
        for (const i of r.error.issues) {
          const key = COLUMNS.find((c) => c.section === section && c.field === String(i.path[0]))?.key ?? String(i.path[0]);
          if (!(key === 'firstName' && !raw.firstName)) err(key, i.message);
        }
    }

    const code = raw.code?.toUpperCase() || null;
    if (code) {
      if (!/^[A-Z0-9/_-]{1,30}$/.test(code)) err('code', 'Letters, digits, -, _ and / only (30 at most)');
      if (L.employees.has(code)) err('code', `Code ${code} is already in use`);
      if (seenCodes.has(code)) err('code', `Same code as row ${seenCodes.get(code)}`);
      else seenCodes.set(code, row);
    }
    const email = (parsed.contact?.workEmail as string | undefined)?.toLowerCase();
    if (email) {
      if (L.workEmails.has(email)) err('workEmail', 'Another employee already has this work email');
      if (seenEmails.has(email)) err('workEmail', `Same work email as row ${seenEmails.get(email)}`);
      else seenEmails.set(email, row);
    }
    const pan = parsed.identity?.pan as string | undefined;
    if (pan) {
      const h = panHash(ctx, pan);
      if (L.panHashes.has(h)) err('pan', 'Another employee already has this PAN');
      if (seenPan.has(h)) err('pan', `Same PAN as row ${seenPan.get(h)}`);
      else seenPan.set(h, row);
    }
    const aadhaar = parsed.identity?.aadhaar as string | undefined;
    if (aadhaar) {
      const h = aadhaarHash(ctx, aadhaar);
      if (L.aadhaarHashes.has(h)) err('aadhaar', 'Another employee already has this Aadhaar');
      if (seenAadhaar.has(h)) err('aadhaar', `Same Aadhaar as row ${seenAadhaar.get(h)}`);
      else seenAadhaar.set(h, row);
    }

    // Custom fields.
    const custom: Record<string, Record<string, unknown>> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!k.startsWith('custom:')) continue;
      const [, section, key] = k.split(':');
      (custom[section!] ??= {})[key!] = v;
    }
    for (const section of new Set(defs.map((d) => d.section))) {
      const r = validateCustomValues(defs.filter((d) => d.section === section), custom[section] ?? {});
      for (const e of r.errors) err(`custom:${section}:${e.key}`, e.message);
      custom[section] = r.values;
    }

    const name = parsed.personal ? employeeName({ first_name: String(parsed.personal.firstName ?? ''), last_name: (parsed.personal.lastName as string) ?? null }) : (raw.firstName ?? null);
    report.push({ row, code, name: name || null, status: errors.length ? 'error' : 'ok', errors });
    if (errors.length === 0 && entityId && doj && employmentType) {
      candidates.push({
        row,
        managerCode,
        functionalCode,
        input: {
          code: code ?? undefined,
          personal: parsed.personal as NewEmployee['personal'],
          contact: parsed.contact,
          identity: parsed.identity,
          bank: parsed.bank,
          employment: { entityId, dateOfJoining: doj, employmentType, status },
          job,
          custom,
        },
      });
    }
  }

  // Managers: an existing employee, or a row of this file with an explicit code. No loops.
  const fileCodes = new Map(candidates.filter((c) => c.input.code).map((c) => [c.input.code!.toUpperCase(), c]));
  const reportOf = (row: number) => report.find((r) => r.row === row)!;
  const fail = (c: Candidate, column: string, message: string) => {
    const r = reportOf(c.row);
    r.status = 'error';
    r.errors.push({ column, message });
  };
  for (const c of candidates) {
    for (const [code, col] of [
      [c.managerCode, 'Manager code'],
      [c.functionalCode, 'Functional manager code'],
    ] as const) {
      if (!code) continue;
      if (code === c.input.code?.toUpperCase()) fail(c, col, 'An employee cannot report to themselves');
      else if (!L.employees.has(code) && !fileCodes.has(code)) {
        const inFile = report.find((r) => r.code === code);
        fail(c, col, inFile ? `Row ${inFile.row} (${code}) has errors` : `No employee with code ${code}`);
      }
    }
  }
  for (const c of candidates) {
    const seen = new Set<string>();
    let cur: Candidate | undefined = c;
    while (cur?.managerCode && fileCodes.has(cur.managerCode)) {
      if (seen.has(cur.managerCode)) {
        fail(c, 'Manager code', 'The managers in this file report to each other in a loop');
        break;
      }
      seen.add(cur.managerCode);
      cur = fileCodes.get(cur.managerCode);
    }
  }

  const invalid = report.filter((r) => r.status === 'error').length;
  const summary = { total: report.length, valid: report.length - invalid, invalid, created: 0 };
  if (dryRun || invalid > 0 || report.length === 0) return { dryRun, imported: false, summary, rows: report };

  // Managers first, so every reporting line points at someone who exists.
  const ordered: Candidate[] = [];
  const placed = new Set<Candidate>();
  const place = (c: Candidate) => {
    if (placed.has(c)) return;
    placed.add(c);
    const m = c.managerCode ? fileCodes.get(c.managerCode) : undefined;
    if (m) place(m);
    const f = c.functionalCode ? fileCodes.get(c.functionalCode) : undefined;
    if (f) place(f);
    ordered.push(c);
  };
  candidates.forEach(place);

  const managerOf = await managerMap(trx);
  const created = new Map<string, string>();
  const idFor = (code: string | null) => (code ? (created.get(code) ?? L.employees.get(code) ?? null) : null);
  for (const c of ordered) {
    const job = { ...c.input.job, ...(c.managerCode ? { managerId: idFor(c.managerCode) } : {}), ...(c.functionalCode ? { functionalManagerId: idFor(c.functionalCode) } : {}) };
    const out = await createEmployee(ctx, trx, { ...c.input, job }, { actorUserId: currentContext()?.userId ?? null, managerOf, defs });
    created.set(out.code.toUpperCase(), out.id);
    reportOf(c.row).code = out.code;
  }
  summary.created = ordered.length;
  return { dryRun, imported: true, summary, rows: report };
}

function styleHeader(ws: ExcelJS.Worksheet, widths: number[]) {
  const h = ws.getRow(1);
  h.font = { bold: true };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF2F7' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
}

export async function templateWorkbook(defs: CustomFieldDef[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Employees');
  const custom = defs.filter((d) => d.active);
  ws.addRow([...COLUMNS.map((c) => (c.required ? `${c.header}*` : c.header)), ...custom.map((d) => (d.required ? `${d.label}*` : d.label))]);
  styleHeader(ws, [...COLUMNS.map((c) => Math.max(14, c.header.length + 4)), ...custom.map((d) => Math.max(14, d.label.length + 4))]);
  const help = wb.addWorksheet('How to fill');
  help.addRow(['Column', 'Required', 'What to enter']);
  for (const c of COLUMNS) help.addRow([c.header, c.required ? 'Yes' : '', c.hint]);
  for (const d of custom) help.addRow([d.label, d.required ? 'Yes' : '', d.type === 'select' ? `One of: ${d.options.join(', ')}` : `Custom field (${d.type})`]);
  help.addRow([]);
  help.addRow(['Nothing is saved while any row has an error. Fix the rows listed in the report and upload again.']);
  styleHeader(help, [28, 10, 80]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Export of the employees the user may export, sensitive columns masked unless permitted. */
export async function exportWorkbook(ctx: ModuleContext, trx: Trx, ids: string[], see: Record<'pan' | 'aadhaar' | 'bank' | 'salary', Set<string>>): Promise<Buffer> {
  const defs = (await customDefs(trx)).filter((d) => d.active);
  const rows = ids.length ? await trx.selectFrom('employees').selectAll().where('id', 'in', ids).orderBy('code').execute() : [];
  const ents = new Map((await trx.selectFrom('legal_entities').select(['id', 'code']).execute()).map((e) => [e.id, e.code]));
  const units = new Map((await trx.selectFrom('org_units').select(['id', 'code']).execute()).map((u) => [u.id, u.code]));
  const codes = new Map((await trx.selectFrom('employees').select(['id', 'code']).execute()).map((e) => [e.id, e.code]));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Employees');
  ws.addRow([...COLUMNS.map((c) => c.header), ...defs.map((d) => d.label)]);
  styleHeader(ws, [...COLUMNS.map((c) => Math.max(14, c.header.length + 4)), ...defs.map((d) => Math.max(14, d.label.length + 4))]);
  const openS = (s: string | null) => (s ? ctx.secrets.open<string>(s) : '');
  for (const r of rows) {
    const any = r as unknown as Record<string, unknown>;
    const v = (k: string): string | number => {
      switch (k) {
        case 'code': return r.code;
        case 'entity': return ents.get(r.entity_id) ?? '';
        case 'managerId': return r.manager_id ? (codes.get(r.manager_id) ?? '') : '';
        case 'functionalManagerId': return r.functional_manager_id ? (codes.get(r.functional_manager_id) ?? '') : '';
        case 'ctcAnnualPaise': return see.salary.has(r.id) && r.ctc_annual_paise !== null ? formatInr(r.ctc_annual_paise, { symbol: false }) : '';
        case 'pan': return see.pan.has(r.id) ? openS(r.pan_enc) : (r.pan_masked ?? '');
        case 'aadhaar': return see.aadhaar.has(r.id) ? openS(r.aadhaar_enc) : (r.aadhaar_masked ?? '');
        case 'accountNumber': return see.bank.has(r.id) ? openS(r.bank_account_enc) : (r.bank_account_masked ?? '');
        case 'ifsc':
        case 'bankName':
        case 'accountHolderName': {
          const val = (any[k === 'ifsc' ? 'ifsc' : k === 'bankName' ? 'bank_name' : 'account_holder_name'] as string | null) ?? '';
          return see.bank.has(r.id) || k !== 'ifsc' ? val : val ? `${val.slice(0, 4)}XXXXXXX` : '';
        }
      }
      const col = COLUMNS.find((c) => c.key === k)!;
      if (col.kind === 'unit') {
        const id = any[k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] as string | null;
        return id ? (units.get(id) ?? '') : '';
      }
      return (any[k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] as string | null) ?? '';
    };
    const custom = r.custom as Record<string, Record<string, unknown>>;
    ws.addRow([...COLUMNS.map((c) => v(c.key)), ...defs.map((d) => {
      const x = custom[d.section]?.[d.key];
      return x === null || x === undefined ? '' : typeof x === 'boolean' ? (x ? 'Yes' : 'No') : String(x);
    })]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
