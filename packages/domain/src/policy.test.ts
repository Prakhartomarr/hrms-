import type { Applicability } from '@hrms/contracts';
import { describe, expect, it } from 'vitest';
import { addVersion, applies, resolvePolicy, type PolicyLike, type PolicySubject } from './policy.js';

const ENT_A = 'ent-a';
const ENT_B = 'ent-b';
const SALES = 'dept-sales';
const SALES_IN = 'sub-inside-sales';
const ENG = 'dept-eng';
const BLR = 'loc-blr';
const MUM = 'loc-mum';

const base = (over: Partial<Applicability> = {}, narrowing: Partial<Applicability['narrowing']> = {}): Applicability => ({
  entityIds: [],
  businessUnitIds: [],
  departmentIds: [],
  locationIds: [],
  gradeIds: [],
  designationIds: [],
  ...over,
  narrowing: { branchIds: [], employmentTypes: [], statuses: [], joiningMonths: [], tenureDays: null, ...narrowing },
});

const subject = (over: Partial<PolicySubject> = {}): PolicySubject => ({
  id: 'emp-1',
  entityId: ENT_A,
  businessUnitId: null,
  departmentIds: [SALES, SALES_IN],
  locationId: BLR,
  gradeId: 'g-3',
  designationId: 'd-exec',
  employmentType: 'permanent',
  status: 'active',
  dateOfJoining: '2025-04-15',
  ...over,
});

const v = (id: string, from: string, to: string | null = null) => ({ id, effectiveFrom: from, effectiveTo: to });
const pol = (id: string, priority: number, applicability: Applicability, versions = [v(`${id}-v1`, '2020-01-01')], active = true): PolicyLike => ({
  id,
  type: 'leave',
  priority,
  active,
  applicability,
  versions,
});

describe('applies()', () => {
  const day = '2026-01-15';
  it.each<[string, Applicability, Partial<PolicySubject>, boolean]>([
    ['empty applicability covers everyone', base(), {}, true],
    ['matching entity', base({ entityIds: [ENT_A] }), {}, true],
    ['other entity', base({ entityIds: [ENT_B] }), {}, false],
    ['department covers its sub-department', base({ departmentIds: [SALES] }), {}, true],
    ['sub-department picked directly', base({ departmentIds: [SALES_IN] }), {}, true],
    ['other department', base({ departmentIds: [ENG] }), {}, false],
    ['location list', base({ locationIds: [MUM] }), {}, false],
    ['OU lists are ANDed across kinds', base({ entityIds: [ENT_A], locationIds: [MUM] }), {}, false],
    ['narrow by branch', base({}, { branchIds: [BLR] }), {}, true],
    ['narrow by branch, miss', base({}, { branchIds: [MUM] }), {}, false],
    ['narrow by employment type', base({}, { employmentTypes: ['intern'] }), {}, false],
    ['narrow by employment type, hit', base({}, { employmentTypes: ['intern', 'permanent'] }), {}, true],
    ['narrow by status', base({}, { statuses: ['notice'] }), {}, false],
    ['narrow by joining month (April)', base({}, { joiningMonths: [4] }), {}, true],
    ['narrow by joining month, miss', base({}, { joiningMonths: [1, 2, 3] }), {}, false],
    ['tenure in range (275 days)', base({}, { tenureDays: { from: 180, to: 365 } }), {}, true],
    ['tenure below range', base({}, { tenureDays: { from: 365 } }), {}, false],
    ['tenure above range', base({}, { tenureDays: { to: 90 } }), {}, false],
    ['no location set fails a location list', base({ locationIds: [BLR] }), { locationId: null }, false],
  ])('%s', (_name, a, s, expected) => {
    expect(applies(a, subject(s), day)).toBe(expected);
  });
});

describe('resolvePolicy()', () => {
  const day = '2026-01-15';
  const general = pol('general', 100, base());
  const sales = pol('sales', 10, base({ departmentIds: [SALES] }));
  const interns = pol('interns', 5, base({}, { employmentTypes: ['intern'] }));
  const inactive = pol('inactive', 1, base(), undefined, false);
  const future = pol('future', 2, base(), [v('future-v1', '2027-01-01')]);
  const versioned = pol('versioned', 3, base({ entityIds: [ENT_B] }), [v('ver-1', '2025-01-01', '2026-01-01'), v('ver-2', '2026-01-01')]);

  const cases: {
    name: string;
    policies: PolicyLike[];
    subject?: Partial<PolicySubject>;
    day?: string;
    overrides?: Parameters<typeof resolvePolicy>[0]['overrides'];
    expect: { policy: string | null; version?: string; via: string };
  }[] = [
    { name: 'no policies', policies: [], expect: { policy: null, via: 'none' } },
    { name: 'only the general policy', policies: [general], expect: { policy: 'general', via: 'applicability' } },
    { name: 'higher priority (lower number) wins', policies: [general, sales], expect: { policy: 'sales', via: 'applicability' } },
    { name: 'first match stops the scan; non-matching higher priority skipped', policies: [general, sales, interns], expect: { policy: 'sales', via: 'applicability' } },
    { name: 'intern matches the intern policy first', policies: [general, sales, interns], subject: { employmentType: 'intern' }, expect: { policy: 'interns', via: 'applicability' } },
    { name: 'inactive policies are skipped', policies: [general, inactive], expect: { policy: 'general', via: 'applicability' } },
    { name: 'a policy with no version on the day is skipped', policies: [general, future], expect: { policy: 'general', via: 'applicability' } },
    { name: 'a policy is picked up once its version starts', policies: [general, future], day: '2027-02-01', expect: { policy: 'future', version: 'future-v1', via: 'applicability' } },
    { name: 'effective-dated version: before the change', policies: [versioned], subject: { entityId: ENT_B }, day: '2025-12-31', expect: { policy: 'versioned', version: 'ver-1', via: 'applicability' } },
    { name: 'effective-dated version: on the change day', policies: [versioned], subject: { entityId: ENT_B }, day: '2026-01-01', expect: { policy: 'versioned', version: 'ver-2', via: 'applicability' } },
    {
      name: 'an override beats priority',
      policies: [general, sales],
      overrides: [{ employeeId: 'emp-1', type: 'leave', policyId: 'general', effectiveFrom: '2026-01-01', effectiveTo: null }],
      expect: { policy: 'general', via: 'override' },
    },
    {
      name: 'an expired override is ignored',
      policies: [general, sales],
      overrides: [{ employeeId: 'emp-1', type: 'leave', policyId: 'general', effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31' }],
      expect: { policy: 'sales', via: 'applicability' },
    },
    {
      name: 'an override for someone else is ignored',
      policies: [general, sales],
      overrides: [{ employeeId: 'emp-2', type: 'leave', policyId: 'general', effectiveFrom: '2026-01-01', effectiveTo: null }],
      expect: { policy: 'sales', via: 'applicability' },
    },
    {
      name: 'an override applies even to an inactive policy',
      policies: [general, inactive],
      overrides: [{ employeeId: 'emp-1', type: 'leave', policyId: 'inactive', effectiveFrom: '2026-01-01', effectiveTo: null }],
      expect: { policy: 'inactive', via: 'override' },
    },
    {
      name: 'an override to a policy with no live version falls back to applicability',
      policies: [general, future],
      overrides: [{ employeeId: 'emp-1', type: 'leave', policyId: 'future', effectiveFrom: '2026-01-01', effectiveTo: null }],
      expect: { policy: 'general', via: 'applicability' },
    },
    {
      name: 'policies of another type are ignored',
      policies: [{ ...sales, type: 'shift' }, general],
      expect: { policy: 'general', via: 'applicability' },
    },
    {
      name: 'equal priority: the older policy wins',
      policies: [
        { ...pol('newer', 10, base()), createdAt: '2026-02-01' },
        { ...pol('older', 10, base()), createdAt: '2025-02-01' },
      ],
      expect: { policy: 'older', via: 'applicability' },
    },
  ];

  it.each(cases)('$name', (c) => {
    const r = resolvePolicy({ subject: subject(c.subject), type: 'leave', day: c.day ?? day, policies: c.policies, overrides: c.overrides ?? [] });
    expect(r.via).toBe(c.expect.via);
    expect(r.policy?.id ?? null).toBe(c.expect.policy);
    if (c.expect.version) expect(r.version?.id).toBe(c.expect.version);
  });
});

describe('addVersion()', () => {
  it('closes the previous version at the new start', () => {
    const out = addVersion([v('a', '2025-01-01')], v('b', '2026-04-01'));
    expect(out).toEqual([v('a', '2025-01-01', '2026-04-01'), v('b', '2026-04-01', null)]);
  });
  it('slots a back-dated version in between', () => {
    const out = addVersion([v('a', '2025-01-01', '2026-04-01'), v('b', '2026-04-01')], v('m', '2025-07-01'));
    expect(out.map((x) => [x.id, x.effectiveTo])).toEqual([
      ['a', '2025-07-01'],
      ['m', '2026-04-01'],
      ['b', null],
    ]);
  });
  it('refuses two versions on one day', () => {
    expect(() => addVersion([v('a', '2025-01-01')], v('b', '2025-01-01'))).toThrow();
  });
});
