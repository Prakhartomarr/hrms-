import { describe, expect, it } from 'vitest';
import { formatCode, validatePattern } from './code-series.js';
import { validateCustomValues } from './custom-fields.js';
import { diffFields } from './diff.js';
import { managerChain, resolveJobAsOf, skipLevelOf, wouldCycle, type JobChange } from './job.js';
import { maskAadhaar, maskAccount, maskPan } from './mask.js';
import type { CustomFieldDef } from '@hrms/contracts';

describe('effective-dated job history', () => {
  const changes: JobChange[] = [
    { effectiveFrom: '2024-04-01', recordedAt: '2024-03-01T00:00:00Z', values: { designationId: 'exec', gradeId: 'g1', managerId: 'm1', ctcAnnualPaise: 60000000 } },
    { effectiveFrom: '2025-04-01', recordedAt: '2025-03-20T00:00:00Z', values: { designationId: 'senior', ctcAnnualPaise: 72000000 } },
    { effectiveFrom: '2025-09-01', recordedAt: '2025-08-01T00:00:00Z', values: { managerId: 'm2' } },
    // Two changes recorded for the same day: the later recording wins.
    { effectiveFrom: '2025-09-01', recordedAt: '2025-08-15T00:00:00Z', values: { gradeId: 'g2' } },
    { effectiveFrom: '2025-09-01', recordedAt: '2025-08-20T00:00:00Z', values: { gradeId: 'g3' } },
    // Future-dated.
    { effectiveFrom: '2027-01-01', recordedAt: '2026-11-01T00:00:00Z', values: { designationId: 'lead', managerId: null } },
  ];
  it.each([
    ['2024-03-31', { designationId: null, gradeId: null, managerId: null, ctcAnnualPaise: null }],
    ['2024-04-01', { designationId: 'exec', gradeId: 'g1', managerId: 'm1', ctcAnnualPaise: 60000000 }],
    ['2025-06-30', { designationId: 'senior', gradeId: 'g1', managerId: 'm1', ctcAnnualPaise: 72000000 }],
    ['2025-09-01', { designationId: 'senior', gradeId: 'g3', managerId: 'm2', ctcAnnualPaise: 72000000 }],
    ['2026-11-13', { designationId: 'senior', gradeId: 'g3', managerId: 'm2', ctcAnnualPaise: 72000000 }],
    ['2027-01-01', { designationId: 'lead', gradeId: 'g3', managerId: null, ctcAnnualPaise: 72000000 }],
  ])('as of %s', (day, expected) => {
    expect(resolveJobAsOf(changes, day).values).toMatchObject(expected);
  });
  it('records when each attribute took effect', () => {
    const r = resolveJobAsOf(changes, '2026-01-01');
    expect(r.since).toMatchObject({ designationId: '2025-04-01', managerId: '2025-09-01', departmentId: null });
  });
});

describe('reporting lines', () => {
  const managerOf = new Map<string, string | null>([
    ['dev', 'lead'],
    ['lead', 'mgr'],
    ['mgr', 'ceo'],
    ['ceo', null],
    ['loop1', 'loop2'],
    ['loop2', 'loop1'],
  ]);
  it('walks the chain upward', () => expect(managerChain('dev', managerOf)).toEqual(['lead', 'mgr', 'ceo']));
  it('stops on a loop', () => expect(managerChain('loop1', managerOf)).toEqual(['loop2']));
  it.each([
    ['dev', 'mgr'],
    ['lead', 'ceo'],
    ['mgr', null],
    ['ceo', null],
  ])('skip-level of %s is %s', (e, s) => expect(skipLevelOf(e, managerOf)).toBe(s));
  it.each([
    ['ceo', 'dev', true],
    ['dev', 'dev', true],
    ['dev', 'ceo', false],
  ])('making %s report to %s cycles: %s', (e, m, c) => expect(wouldCycle(e, m, managerOf)).toBe(c));
});

describe('employee code series', () => {
  it.each([
    ['{ENTITY}{SEQ:4}', 'DPL0007'],
    ['{ENTITY}-{YY}{MM}-{SEQ:3}', 'DPL-2511-007'],
    ['EMP/{YYYY}/{SEQ}', 'EMP/2025/7'],
  ])('%s -> %s', (pattern, out) => {
    expect(validatePattern(pattern)).toBeNull();
    expect(formatCode(pattern, { entityCode: 'dpl', seq: 7, date: '2025-11-03' })).toBe(out);
  });
  it.each([
    ['{ENTITY}', 'exactly one'],
    ['{SEQ}{SEQ:2}', 'exactly one'],
    ['{FOO}{SEQ}', 'Unknown token'],
    ['A B{SEQ}', 'Literal'],
  ])('rejects %s', (pattern, msg) => expect(validatePattern(pattern)).toContain(msg));
});

describe('masking', () => {
  it('masks PAN, Aadhaar and account numbers', () => {
    expect(maskPan('ABCPE1234F')).toBe('XXXXXX234F');
    expect(maskAadhaar('234567890124')).toBe('XXXX XXXX 0124');
    expect(maskAccount('50100012345678')).toBe('XXXXXXXXXX5678');
  });
});

describe('field diff', () => {
  it('lists only changed fields, nested as dotted keys', () => {
    expect(diffFields({ name: 'A', bank: { ifsc: 'X', name: 'B' } }, { name: 'A', bank: { ifsc: 'Y', name: 'B' } })).toEqual([{ field: 'bank.ifsc', before: 'X', after: 'Y' }]);
  });
  it('treats empty strings and undefined as null', () => {
    expect(diffFields({ a: '' }, { a: undefined })).toEqual([]);
  });
  it('records create and delete', () => {
    expect(diffFields(null, { a: 1 })).toEqual([{ field: 'a', before: null, after: 1 }]);
    expect(diffFields({ a: 1 }, null)).toEqual([{ field: 'a', before: 1, after: null }]);
  });
  it('redacts sensitive values', () => {
    expect(diffFields({ pan: 'ABCPE1234F' }, { pan: 'ABCPE9999F' }, new Set(['pan']))).toEqual([{ field: 'pan', before: '[redacted]', after: '[redacted]' }]);
  });
});

describe('custom field validation', () => {
  const def = (over: Partial<CustomFieldDef>): CustomFieldDef => ({
    id: 'x', section: 'personal', key: 'k', label: 'K', type: 'text', required: false, options: [], validation: {}, position: 0, active: true, ...over,
  });
  it.each<[string, Partial<CustomFieldDef>, unknown, unknown, string | null]>([
    ['required and missing', { required: true }, '', null, 'is required'],
    ['optional and missing', {}, undefined, null, null],
    ['text with pattern ok', { validation: { pattern: '^[A-Z]{2}$' } }, 'AB', 'AB', null],
    ['text with pattern fail', { validation: { pattern: '^[A-Z]{2}$', patternMessage: 'Two capitals' } }, 'abc', undefined, 'Two capitals'],
    ['text too long', { validation: { maxLength: 3 } }, 'abcd', undefined, 'at most 3'],
    ['number ok with grouping', { type: 'number' }, '1,200', 1200, null],
    ['number below min', { type: 'number', validation: { min: 5 } }, 2, undefined, 'at least 5'],
    ['number not a number', { type: 'number' }, 'x', undefined, 'must be a number'],
    ['select is case-insensitive', { type: 'select', options: ['S', 'M', 'L'] }, 'm', 'M', null],
    ['select outside options', { type: 'select', options: ['S', 'M'] }, 'XL', undefined, 'one of'],
    ['boolean yes', { type: 'boolean' }, 'Yes', true, null],
    ['date ok', { type: 'date' }, '2025-01-31', '2025-01-31', null],
    ['date bad', { type: 'date' }, '31/01/2025', undefined, 'YYYY-MM-DD'],
    ['email ok', { type: 'email' }, 'A@B.CO', 'a@b.co', null],
  ])('%s', (_n, d, input, value, err) => {
    const r = validateCustomValues([def(d)], { k: input });
    if (err) expect(r.errors[0]?.message).toContain(err);
    else {
      expect(r.errors).toEqual([]);
      expect(r.values.k).toEqual(value);
    }
  });
  it('drops unknown keys and skips inactive fields', () => {
    const r = validateCustomValues([def({ active: false, required: true })], { k: '', other: 1 });
    expect(r).toEqual({ values: {}, errors: [] });
  });
});
