import type { FieldChange } from '@hrms/contracts';

const norm = (v: unknown): unknown => (v === undefined || v === '' ? null : v instanceof Date ? v.toISOString() : v);

/** Flattens one level of nested objects into dotted keys: { bank: { ifsc } } -> 'bank.ifsc'. */
function flatten(o: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) Object.assign(out, flatten(v as Record<string, unknown>, key));
    else out[key] = norm(v);
  }
  return out;
}

/**
 * Field-level before/after for the audit log. Only changed fields are listed. Fields named in
 * `redact` are recorded as changed without their values, so the audit log never holds a full
 * PAN, Aadhaar or account number.
 */
export function diffFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  redact: ReadonlySet<string> = new Set(),
): FieldChange[] {
  const a = flatten(before ?? {});
  const b = flatten(after ?? {});
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const out: FieldChange[] = [];
  for (const k of keys) {
    const x = a[k] ?? null;
    const y = b[k] ?? null;
    if (JSON.stringify(x) === JSON.stringify(y)) continue;
    const hide = redact.has(k) || redact.has(k.split('.').pop()!);
    out.push({ field: k, before: hide && x !== null ? '[redacted]' : x, after: hide && y !== null ? '[redacted]' : y });
  }
  return out;
}
