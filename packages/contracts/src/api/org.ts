import { z } from 'zod';
import { isoDate, ok, uuid } from '../primitives.js';
import { endpoint } from './endpoint.js';

/**
 * Org model: tenant -> legal entities, plus org units of several kinds. Departments may have
 * sub-departments (parent = a department). Business units and locations may belong to one entity.
 */
export const UNIT_KINDS = [
  'business_unit',
  'location',
  'department',
  'sub_department',
  'grade',
  'designation',
  'cost_centre',
] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];
export const unitKind = z.enum(UNIT_KINDS);
export const UNIT_KIND_LABELS: Record<UnitKind, string> = {
  business_unit: 'Business units',
  location: 'Locations',
  department: 'Departments',
  sub_department: 'Sub-departments',
  grade: 'Grades',
  designation: 'Designations',
  cost_centre: 'Cost centres',
};

const code = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9_-]+$/, 'Letters, digits, - and _ only');

export const legalEntity = z.object({
  id: uuid,
  code: z.string(),
  name: z.string(),
  pan: z.string().nullable(),
  tan: z.string().nullable(),
  gstin: z.string().nullable(),
  state: z.string().nullable(),
  address: z.string().nullable(),
  active: z.boolean(),
  employeeCount: z.number().int(),
});
export type LegalEntity = z.infer<typeof legalEntity>;

export const legalEntityInput = z.object({
  code,
  name: z.string().trim().min(1).max(200),
  pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN').nullable().optional(),
  tan: z.string().trim().toUpperCase().regex(/^[A-Z]{4}[0-9]{5}[A-Z]$/, 'Invalid TAN').nullable().optional(),
  gstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'Invalid GSTIN').nullable().optional(),
  state: z.string().trim().max(60).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  /** Employee code pattern, e.g. `{ENTITY}-{SEQ:4}`. Defaults to `{ENTITY}{SEQ:4}`. */
  codePattern: z.string().trim().min(1).max(60).optional(),
});

export const orgUnit = z.object({
  id: uuid,
  kind: unitKind,
  code: z.string(),
  name: z.string(),
  parentId: uuid.nullable(),
  entityId: uuid.nullable(),
  headEmployeeId: uuid.nullable(),
  active: z.boolean(),
  employeeCount: z.number().int(),
});
export type OrgUnit = z.infer<typeof orgUnit>;

export const orgUnitInput = z.object({
  kind: unitKind,
  code,
  name: z.string().trim().min(1).max(200),
  parentId: uuid.nullable().optional(),
  entityId: uuid.nullable().optional(),
  headEmployeeId: uuid.nullable().optional(),
});

export const codeSeries = z.object({
  entityId: uuid,
  entityCode: z.string(),
  pattern: z.string(),
  nextNumber: z.number().int(),
  preview: z.string(),
});
export type CodeSeries = z.infer<typeof codeSeries>;

const setupUnit = z.object({ code, name: z.string().trim().min(1).max(200), entityCode: z.string().optional(), parentCode: z.string().optional() });

export const orgSetupBody = z.object({
  entities: z.array(legalEntityInput).min(1),
  businessUnits: z.array(setupUnit).default([]),
  locations: z.array(setupUnit).default([]),
  departments: z.array(setupUnit).default([]),
  subDepartments: z.array(setupUnit).default([]),
  grades: z.array(setupUnit).default([]),
  designations: z.array(setupUnit).default([]),
  costCentres: z.array(setupUnit).default([]),
});
export type OrgSetupBody = z.input<typeof orgSetupBody>;

export const orgApi = {
  entities: endpoint({
    method: 'GET',
    path: '/api/v1/org/entities',
    auth: true,
    response: z.object({ items: z.array(legalEntity) }),
    summary: 'Legal entities',
  }),
  createEntity: endpoint({
    method: 'POST',
    path: '/api/v1/org/entities',
    auth: true,
    body: legalEntityInput,
    response: legalEntity,
    summary: 'Add a legal entity',
  }),
  updateEntity: endpoint({
    method: 'PATCH',
    path: '/api/v1/org/entities/:id',
    auth: true,
    params: z.object({ id: uuid }),
    body: legalEntityInput.partial().extend({ active: z.boolean().optional() }),
    response: legalEntity,
    summary: 'Change a legal entity',
  }),
  deleteEntity: endpoint({
    method: 'DELETE',
    path: '/api/v1/org/entities/:id',
    auth: true,
    params: z.object({ id: uuid }),
    response: ok,
    summary: 'Delete a legal entity with no employees',
  }),
  units: endpoint({
    method: 'GET',
    path: '/api/v1/org/units',
    auth: true,
    query: z.object({ kind: unitKind.optional() }),
    response: z.object({ items: z.array(orgUnit) }),
    summary: 'Org units (business units, locations, departments, grades, ...)',
  }),
  createUnit: endpoint({
    method: 'POST',
    path: '/api/v1/org/units',
    auth: true,
    body: orgUnitInput,
    response: orgUnit,
    summary: 'Add an org unit',
  }),
  updateUnit: endpoint({
    method: 'PATCH',
    path: '/api/v1/org/units/:id',
    auth: true,
    params: z.object({ id: uuid }),
    body: orgUnitInput.omit({ kind: true }).partial().extend({ active: z.boolean().optional() }),
    response: orgUnit,
    summary: 'Change an org unit',
  }),
  deleteUnit: endpoint({
    method: 'DELETE',
    path: '/api/v1/org/units/:id',
    auth: true,
    params: z.object({ id: uuid }),
    response: ok,
    summary: 'Delete an unused org unit',
  }),
  codeSeries: endpoint({
    method: 'GET',
    path: '/api/v1/org/code-series',
    auth: true,
    response: z.object({ items: z.array(codeSeries) }),
    summary: 'Employee code pattern per legal entity',
  }),
  putCodeSeries: endpoint({
    method: 'PUT',
    path: '/api/v1/org/code-series/:entityId',
    auth: true,
    params: z.object({ entityId: uuid }),
    body: z.object({ pattern: z.string().trim().min(1).max(60), nextNumber: z.number().int().min(1).optional() }),
    response: codeSeries,
    summary: 'Set the employee code pattern of a legal entity',
  }),
  setup: endpoint({
    method: 'POST',
    path: '/api/v1/org/setup',
    auth: true,
    body: orgSetupBody,
    response: z.object({ entities: z.number().int(), units: z.number().int() }),
    summary: 'Workspace setup wizard: create the org structure in one step',
  }),
  chart: endpoint({
    method: 'GET',
    path: '/api/v1/org/chart',
    auth: true,
    query: z.object({ asOf: isoDate.optional() }),
    response: z.object({
      items: z.array(
        z.object({ id: uuid, name: z.string(), code: z.string(), designation: z.string().nullable(), managerId: uuid.nullable() }),
      ),
    }),
    summary: 'Reporting lines for the org chart (employees the user may see)',
  }),
};
