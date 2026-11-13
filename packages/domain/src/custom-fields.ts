import type { CustomFieldDef } from '@hrms/contracts';

export interface CustomFieldResult {
  values: Record<string, unknown>;
  errors: { key: string; label: string; message: string }[];
}

/**
 * Validates and normalises custom field values for one section against its definitions.
 * Unknown keys are dropped. Empty values are null. Returns every problem, not just the first.
 */
export function validateCustomValues(defs: CustomFieldDef[], input: Record<string, unknown>): CustomFieldResult {
  const values: Record<string, unknown> = {};
  const errors: CustomFieldResult['errors'] = [];
  for (const d of defs.filter((x) => x.active)) {
    const raw = input[d.key];
    const empty = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
    const fail = (message: string) => errors.push({ key: d.key, label: d.label, message });
    if (empty) {
      if (d.required) fail(`${d.label} is required`);
      values[d.key] = null;
      continue;
    }
    const v = d.validation;
    switch (d.type) {
      case 'number': {
        const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''));
        if (!Number.isFinite(n)) {
          fail(`${d.label} must be a number`);
          break;
        }
        if (v.min !== undefined && n < v.min) fail(`${d.label} must be at least ${v.min}`);
        else if (v.max !== undefined && n > v.max) fail(`${d.label} must be at most ${v.max}`);
        else values[d.key] = n;
        break;
      }
      case 'boolean': {
        const s = String(raw).toLowerCase();
        if (typeof raw === 'boolean') values[d.key] = raw;
        else if (['yes', 'true', '1', 'y'].includes(s)) values[d.key] = true;
        else if (['no', 'false', '0', 'n'].includes(s)) values[d.key] = false;
        else fail(`${d.label} must be yes or no`);
        break;
      }
      case 'date': {
        const s = String(raw).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) fail(`${d.label} must be a date (YYYY-MM-DD)`);
        else values[d.key] = s;
        break;
      }
      case 'select': {
        const s = String(raw).trim();
        const hit = d.options.find((o) => o.toLowerCase() === s.toLowerCase());
        if (!hit) fail(`${d.label} must be one of: ${d.options.join(', ')}`);
        else values[d.key] = hit;
        break;
      }
      case 'email': {
        const s = String(raw).trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) fail(`${d.label} must be an email address`);
        else values[d.key] = s;
        break;
      }
      default: {
        const s = String(raw).trim();
        if (v.maxLength !== undefined && s.length > v.maxLength) fail(`${d.label} must be at most ${v.maxLength} characters`);
        else if (v.pattern && !new RegExp(v.pattern).test(s)) fail(v.patternMessage ?? `${d.label} is not in the expected format`);
        else values[d.key] = s;
      }
    }
  }
  return { values, errors };
}
