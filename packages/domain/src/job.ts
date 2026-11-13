/**
 * Effective-dated job history. Each change sets only some attributes from a date; the value of
 * an attribute on a day is the latest change on or before that day that set it. Future-dated
 * changes are stored now and take effect when their day comes.
 */
export const JOB_FIELDS = [
  'designationId',
  'gradeId',
  'businessUnitId',
  'departmentId',
  'subDepartmentId',
  'locationId',
  'costCentreId',
  'managerId',
  'functionalManagerId',
  'ctcAnnualPaise',
] as const;
export type JobField = (typeof JOB_FIELDS)[number];
export type JobValues = { [K in JobField]: K extends 'ctcAnnualPaise' ? number | null : string | null };

export interface JobChange {
  effectiveFrom: string;
  /** Tie-break for two changes on the same day: the later recorded wins. */
  recordedAt: string;
  /** Undefined: not changed. Null: cleared. */
  values: Partial<JobValues>;
}

export interface ResolvedJob {
  values: JobValues;
  /** When each attribute's current value took effect (null: never set). */
  since: Record<JobField, string | null>;
}

export function emptyJob(): JobValues {
  return Object.fromEntries(JOB_FIELDS.map((f) => [f, null])) as JobValues;
}

export function resolveJobAsOf(changes: JobChange[], day: string): ResolvedJob {
  const values = emptyJob() as Record<JobField, string | number | null>;
  const since = Object.fromEntries(JOB_FIELDS.map((f) => [f, null])) as Record<JobField, string | null>;
  const ordered = changes
    .filter((c) => c.effectiveFrom <= day)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.recordedAt.localeCompare(b.recordedAt));
  for (const c of ordered) {
    for (const f of JOB_FIELDS) {
      const v = c.values[f];
      if (v === undefined) continue;
      values[f] = v;
      since[f] = c.effectiveFrom;
    }
  }
  return { values: values as JobValues, since };
}

/**
 * Manager chain upward from an employee, stopping at a cycle or after `max` steps.
 * `managerOf` maps employee id -> primary manager id.
 */
export function managerChain(employeeId: string, managerOf: Map<string, string | null>, max = 50): string[] {
  const chain: string[] = [];
  const seen = new Set([employeeId]);
  let cur = managerOf.get(employeeId) ?? null;
  while (cur && !seen.has(cur) && chain.length < max) {
    chain.push(cur);
    seen.add(cur);
    cur = managerOf.get(cur) ?? null;
  }
  return chain;
}

/** Skip-level manager: the primary manager's primary manager. */
export const skipLevelOf = (employeeId: string, managerOf: Map<string, string | null>): string | null =>
  managerChain(employeeId, managerOf, 2)[1] ?? null;

/** True when making `managerId` the manager of `employeeId` would create a reporting loop. */
export function wouldCycle(employeeId: string, managerId: string, managerOf: Map<string, string | null>): boolean {
  if (employeeId === managerId) return true;
  return managerChain(managerId, managerOf).includes(employeeId);
}
