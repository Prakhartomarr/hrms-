import type { Applicability } from '@hrms/contracts';
import { daysBetween, monthOf } from './dates.js';

/** The employee facts applicability is matched against, as of the resolution date. */
export interface PolicySubject {
  id: string;
  entityId: string | null;
  businessUnitId: string | null;
  /** The department and, when in a sub-department, both ids (a department covers its subs). */
  departmentIds: string[];
  locationId: string | null;
  gradeId: string | null;
  designationId: string | null;
  employmentType: string;
  status: string;
  dateOfJoining: string;
}

export interface PolicyVersionLike {
  id: string;
  effectiveFrom: string;
  /** Exclusive. */
  effectiveTo: string | null;
}

export interface PolicyLike<V extends PolicyVersionLike = PolicyVersionLike> {
  id: string;
  type: string;
  priority: number;
  active: boolean;
  applicability: Applicability;
  versions: V[];
  /** Tie-break for equal priority: the older policy wins, so results never depend on load order. */
  createdAt?: string;
}

export interface OverrideLike {
  employeeId: string;
  type: string;
  policyId: string;
  effectiveFrom: string;
  /** Inclusive; null = open. */
  effectiveTo: string | null;
}

export type ResolveResult<P extends PolicyLike> =
  | { via: 'override' | 'applicability'; policy: P; version: P['versions'][number] }
  | { via: 'none'; policy: null; version: null };

export function versionOn<V extends PolicyVersionLike>(versions: V[], day: string): V | null {
  return (
    versions
      .filter((v) => v.effectiveFrom <= day && (v.effectiveTo === null || day < v.effectiveTo))
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null
  );
}

const anyOf = (list: string[], value: string | null) => list.length === 0 || (value !== null && list.includes(value));

/** Whether the policy's applicability (OU step, then narrowing) covers the subject on `day`. */
export function applies(a: Applicability, s: PolicySubject, day: string): boolean {
  if (!anyOf(a.entityIds, s.entityId)) return false;
  if (!anyOf(a.businessUnitIds, s.businessUnitId)) return false;
  if (a.departmentIds.length && !s.departmentIds.some((d) => a.departmentIds.includes(d))) return false;
  if (!anyOf(a.locationIds, s.locationId)) return false;
  if (!anyOf(a.gradeIds, s.gradeId)) return false;
  if (!anyOf(a.designationIds, s.designationId)) return false;
  const n = a.narrowing;
  if (!anyOf(n.branchIds, s.locationId)) return false;
  if (!anyOf(n.employmentTypes, s.employmentType)) return false;
  if (!anyOf(n.statuses, s.status)) return false;
  if (n.joiningMonths.length && !n.joiningMonths.includes(monthOf(s.dateOfJoining))) return false;
  if (n.tenureDays) {
    const t = daysBetween(s.dateOfJoining, day);
    if (n.tenureDays.from !== undefined && t < n.tenureDays.from) return false;
    if (n.tenureDays.to !== undefined && t > n.tenureDays.to) return false;
  }
  return true;
}

/**
 * The policy of `type` that applies to `subject` on `day`:
 * 1. An override for the employee, live on that day, whose policy has a version that day.
 * 2. Otherwise active policies by priority (lower first), the first whose applicability
 *    matches and that has a version on that day. Scanning stops at the first match.
 * Policies are never merged.
 */
export function resolvePolicy<P extends PolicyLike>(input: {
  subject: PolicySubject;
  type: string;
  day: string;
  policies: P[];
  overrides?: OverrideLike[];
}): ResolveResult<P> {
  const { subject, type, day } = input;
  const ofType = input.policies.filter((p) => p.type === type);
  const override = (input.overrides ?? [])
    .filter(
      (o) =>
        o.employeeId === subject.id &&
        o.type === type &&
        o.effectiveFrom <= day &&
        (o.effectiveTo === null || day <= o.effectiveTo),
    )
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  if (override) {
    const p = ofType.find((x) => x.id === override.policyId);
    const v = p ? versionOn(p.versions, day) : null;
    if (p && v) return { via: 'override', policy: p, version: v };
  }
  const ordered = ofType
    .filter((p) => p.active)
    .sort((a, b) => a.priority - b.priority || (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id));
  for (const p of ordered) {
    if (!applies(p.applicability, subject, day)) continue;
    const v = versionOn(p.versions, day);
    if (v) return { via: 'applicability', policy: p, version: v };
  }
  return { via: 'none', policy: null, version: null };
}

/** Closes the open version before adding a new one: returns versions with effectiveTo set. */
export function addVersion<V extends PolicyVersionLike>(versions: V[], next: V): V[] {
  if (versions.some((v) => v.effectiveFrom === next.effectiveFrom))
    throw new Error(`A version already starts on ${next.effectiveFrom}`);
  const all = [...versions, next].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return all.map((v, i) => ({ ...v, effectiveTo: all[i + 1]?.effectiveFrom ?? null }));
}
