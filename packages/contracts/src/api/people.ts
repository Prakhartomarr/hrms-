import { z } from 'zod';
import { isValidAadhaar, isValidBankAccount, isValidEsic, isValidIfsc, isValidMobile, isValidPan, isValidUan, stripSpaces } from '../india.js';
import { isoDate, isoDateTime, ok, paise, uuid } from '../primitives.js';
import { endpoint } from './endpoint.js';

export const EMPLOYMENT_TYPES = ['permanent', 'probation', 'contract', 'intern', 'consultant'] as const;
export const EMPLOYEE_STATUSES = ['active', 'notice', 'exited', 'inactive'] as const;
export const GENDERS = ['male', 'female', 'other', 'undisclosed'] as const;
export const MARITAL = ['single', 'married', 'divorced', 'widowed', 'undisclosed'] as const;

const opt = <T extends z.ZodType>(t: T) => t.nullable().optional();
const text = (max = 200) => z.string().trim().max(max);
const upper = (re: (v: string) => boolean, msg: string) =>
  z.string().trim().toUpperCase().refine(re, msg);

/** Fixed sections stored on the employee record. */
export const personalSection = z.object({
  firstName: text(80).min(1),
  middleName: opt(text(80)),
  lastName: opt(text(80)),
  displayName: opt(text(160)),
  gender: opt(z.enum(GENDERS)),
  dateOfBirth: opt(isoDate),
  maritalStatus: opt(z.enum(MARITAL)),
  bloodGroup: opt(z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])),
  nationality: opt(text(60)),
  fatherName: opt(text(160)),
});
export const contactSection = z.object({
  workEmail: opt(z.email()),
  personalEmail: opt(z.email()),
  mobile: opt(z.string().trim().refine(isValidMobile, 'Invalid Indian mobile number')),
  alternateMobile: opt(z.string().trim().refine(isValidMobile, 'Invalid Indian mobile number')),
  currentAddress: opt(text(500)),
  permanentAddress: opt(text(500)),
});
export const identitySection = z.object({
  pan: opt(upper(isValidPan, 'Invalid PAN (e.g. ABCDE1234F)')),
  aadhaar: opt(z.string().trim().refine(isValidAadhaar, 'Invalid Aadhaar number').transform(stripSpaces)),
  passportNumber: opt(z.string().trim().toUpperCase().regex(/^[A-Z][0-9]{7}$/, 'Invalid passport number')),
  passportExpiry: opt(isoDate),
  uan: opt(z.string().trim().refine(isValidUan, 'UAN is 12 digits').transform(stripSpaces)),
  esicNumber: opt(z.string().trim().refine(isValidEsic, 'ESIC number is 10 or 17 digits').transform(stripSpaces)),
});
export const bankSection = z.object({
  bankName: opt(text(120)),
  accountNumber: opt(z.string().trim().refine(isValidBankAccount, 'Account number is 9 to 18 digits').transform(stripSpaces)),
  ifsc: opt(upper(isValidIfsc, 'Invalid IFSC (e.g. HDFC0001234)')),
  accountHolderName: opt(text(160)),
});
export const employmentSection = z.object({
  entityId: uuid,
  dateOfJoining: isoDate,
  employmentType: z.enum(EMPLOYMENT_TYPES),
  status: z.enum(EMPLOYEE_STATUSES),
  probationEndDate: opt(isoDate),
  exitDate: opt(isoDate),
});

/** Repeatable sections stored as records. */
export const familyRecord = z.object({
  name: text(160).min(1),
  relation: z.enum(['spouse', 'child', 'father', 'mother', 'sibling', 'other']),
  dateOfBirth: opt(isoDate),
  isNominee: z.boolean().default(false),
  nomineeSharePct: opt(z.number().min(0).max(100)),
  phone: opt(text(20)),
});
export const educationRecord = z.object({
  qualification: text(120).min(1),
  institution: text(200).min(1),
  specialisation: opt(text(120)),
  yearOfPassing: opt(z.number().int().min(1950).max(2100)),
  grade: opt(text(20)),
});
export const experienceRecord = z.object({
  company: text(200).min(1),
  designation: opt(text(120)),
  from: isoDate,
  to: opt(isoDate),
  lastCtcPaise: opt(paise),
  reasonForLeaving: opt(text(300)),
});
export const emergencyRecord = z.object({
  name: text(160).min(1),
  relation: text(60).min(1),
  phone: z.string().trim().refine(isValidMobile, 'Invalid Indian mobile number'),
  address: opt(text(500)),
});
export const documentRecord = z.object({
  category: z.enum(['identity', 'address', 'education', 'experience', 'offer', 'other']),
  name: text(200).min(1),
  number: opt(text(60)),
  expiry: opt(isoDate),
  verified: z.boolean().default(false),
  fileName: opt(text(255)),
});

export const RECORD_SECTIONS = {
  family: familyRecord,
  education: educationRecord,
  experience: experienceRecord,
  emergency: emergencyRecord,
  documents: documentRecord,
} as const;
export type RecordSection = keyof typeof RECORD_SECTIONS;
export const recordSection = z.enum(['family', 'education', 'experience', 'emergency', 'documents']);

export const FIELD_SECTIONS = ['personal', 'contact', 'identity', 'bank', 'employment'] as const;
export type FieldSection = (typeof FIELD_SECTIONS)[number];
export const SECTION_SCHEMAS = {
  personal: personalSection,
  contact: contactSection,
  identity: identitySection,
  bank: bankSection,
  employment: employmentSection,
} as const;
/** Sections custom fields can be added to. */
export const CUSTOM_FIELD_SECTIONS = ['personal', 'contact', 'identity', 'bank', 'employment', 'job'] as const;

export const ref = z.object({ id: uuid, name: z.string(), code: z.string().optional() }).nullable();

/** Current job: each attribute is the latest change effective on or before today. */
export const currentJob = z.object({
  designation: ref,
  grade: ref,
  businessUnit: ref,
  department: ref,
  subDepartment: ref,
  location: ref,
  costCentre: ref,
  manager: ref,
  functionalManager: ref,
  /** Computed: the primary manager's primary manager. */
  skipLevelManager: ref,
  /** Null when masked (no salary permission) or never set. */
  ctcAnnualPaise: paise.nullable(),
});

export const employeeProfile = z.object({
  id: uuid,
  code: z.string(),
  name: z.string(),
  entity: ref,
  personal: personalSection.partial(),
  contact: contactSection.partial(),
  identity: z.record(z.string(), z.string().nullable()),
  bank: z.record(z.string(), z.string().nullable()),
  employment: z.object({
    entityId: uuid,
    dateOfJoining: isoDate,
    employmentType: z.string(),
    status: z.string(),
    probationEndDate: isoDate.nullable(),
    exitDate: isoDate.nullable(),
  }),
  job: currentJob,
  custom: z.record(z.string(), z.record(z.string(), z.unknown())),
  /** Field groups masked for this viewer: pan, aadhaar, bank, salary. */
  masked: z.array(z.enum(['pan', 'aadhaar', 'bank', 'salary'])),
  /** What this viewer may do on this employee (the server enforces it again on every call). */
  can: z.object({
    edit: z.boolean(),
    editJob: z.boolean(),
    delete: z.boolean(),
    viewJob: z.boolean(),
  }),
  userId: uuid.nullable(),
});
export type EmployeeProfile = z.infer<typeof employeeProfile>;

export const directoryRow = z.object({
  id: uuid,
  code: z.string(),
  name: z.string(),
  designation: z.string().nullable(),
  department: z.string().nullable(),
  location: z.string().nullable(),
  entity: z.string().nullable(),
  manager: z.string().nullable(),
  workEmail: z.string().nullable(),
  status: z.string(),
  employmentType: z.string(),
  dateOfJoining: isoDate,
});
export type DirectoryRow = z.infer<typeof directoryRow>;

export const directoryQuery = z.object({
  q: z.string().trim().max(100).optional(),
  entityId: uuid.optional(),
  businessUnitId: uuid.optional(),
  departmentId: uuid.optional(),
  locationId: uuid.optional(),
  designationId: uuid.optional(),
  gradeId: uuid.optional(),
  managerId: uuid.optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type DirectoryQuery = z.input<typeof directoryQuery>;

export const jobChangeInput = z.object({
  effectiveFrom: isoDate,
  designationId: uuid.nullable().optional(),
  gradeId: uuid.nullable().optional(),
  businessUnitId: uuid.nullable().optional(),
  departmentId: uuid.nullable().optional(),
  subDepartmentId: uuid.nullable().optional(),
  locationId: uuid.nullable().optional(),
  costCentreId: uuid.nullable().optional(),
  managerId: uuid.nullable().optional(),
  functionalManagerId: uuid.nullable().optional(),
  ctcAnnualPaise: paise.nullable().optional(),
  reason: z.string().trim().max(300).optional(),
});
export type JobChangeInput = z.input<typeof jobChangeInput>;

export const jobEvent = z.object({
  id: uuid,
  effectiveFrom: isoDate,
  /** Only the attributes this change set. CTC is null when masked. */
  changes: z.record(z.string(), z.object({ id: z.string().nullable(), name: z.string().nullable() })),
  ctcAnnualPaise: paise.nullable(),
  ctcMasked: z.boolean(),
  reason: z.string().nullable(),
  createdAt: isoDateTime,
  createdBy: z.string().nullable(),
});
export type JobEvent = z.infer<typeof jobEvent>;

export const createEmployeeBody = z.object({
  code: z.string().trim().max(30).optional(),
  personal: personalSection,
  contact: contactSection.optional(),
  identity: identitySection.optional(),
  bank: bankSection.optional(),
  employment: employmentSection,
  job: jobChangeInput.omit({ effectiveFrom: true, reason: true }).optional(),
  custom: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
});
export type CreateEmployeeBody = z.input<typeof createEmployeeBody>;

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean', 'email'] as const;
export const customFieldDef = z.object({
  id: uuid,
  section: z.enum(CUSTOM_FIELD_SECTIONS),
  key: z.string(),
  label: z.string(),
  type: z.enum(CUSTOM_FIELD_TYPES),
  required: z.boolean(),
  options: z.array(z.string()),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    maxLength: z.number().int().optional(),
    pattern: z.string().optional(),
    patternMessage: z.string().optional(),
  }),
  position: z.number().int(),
  active: z.boolean(),
});
export type CustomFieldDef = z.infer<typeof customFieldDef>;
export const customFieldInput = customFieldDef
  .omit({ id: true, active: true })
  .extend({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/, 'Lower-case letters, digits and _'),
    label: z.string().trim().min(1).max(80),
    options: z.array(z.string().trim().min(1)).default([]),
    validation: customFieldDef.shape.validation.default({}),
    position: z.number().int().default(0),
    required: z.boolean().default(false),
  });

export const importRowIssue = z.object({ column: z.string(), message: z.string() });
export const importReport = z.object({
  dryRun: z.boolean(),
  /** True when the rows were written. Nothing is written while any row has an error. */
  imported: z.boolean(),
  summary: z.object({ total: z.number().int(), valid: z.number().int(), invalid: z.number().int(), created: z.number().int() }),
  rows: z.array(
    z.object({
      row: z.number().int(),
      code: z.string().nullable(),
      name: z.string().nullable(),
      status: z.enum(['ok', 'error']),
      errors: z.array(importRowIssue),
    }),
  ),
});
export type ImportReport = z.infer<typeof importReport>;

const employeeIdParams = z.object({ id: uuid });

export const peopleApi = {
  directory: endpoint({
    method: 'GET',
    path: '/api/v1/employees',
    auth: true,
    query: directoryQuery,
    response: z.object({ items: z.array(directoryRow), total: z.number().int() }),
    summary: 'Employee directory, limited to the viewer’s data scope',
  }),
  create: endpoint({
    method: 'POST',
    path: '/api/v1/employees',
    auth: true,
    body: createEmployeeBody,
    response: employeeProfile,
    summary: 'Add an employee (code generated from the entity’s pattern when left out)',
  }),
  get: endpoint({
    method: 'GET',
    path: '/api/v1/employees/:id',
    auth: true,
    params: employeeIdParams,
    response: employeeProfile,
    summary: 'Employee profile, sensitive fields masked unless permitted',
  }),
  updateSection: endpoint({
    method: 'PATCH',
    path: '/api/v1/employees/:id/sections/:section',
    auth: true,
    params: z.object({ id: uuid, section: z.enum(FIELD_SECTIONS) }),
    body: z.object({ data: z.record(z.string(), z.unknown()), custom: z.record(z.string(), z.unknown()).optional() }),
    response: employeeProfile,
    summary: 'Change one section of the profile',
  }),
  remove: endpoint({
    method: 'DELETE',
    path: '/api/v1/employees/:id',
    auth: true,
    params: employeeIdParams,
    response: ok,
    summary: 'Delete an employee record',
  }),
  records: endpoint({
    method: 'GET',
    path: '/api/v1/employees/:id/records/:section',
    auth: true,
    params: z.object({ id: uuid, section: recordSection }),
    response: z.object({ items: z.array(z.object({ id: uuid, data: z.record(z.string(), z.unknown()), updatedAt: isoDateTime })) }),
    summary: 'Family, education, experience, emergency contacts or documents',
  }),
  addRecord: endpoint({
    method: 'POST',
    path: '/api/v1/employees/:id/records/:section',
    auth: true,
    params: z.object({ id: uuid, section: recordSection }),
    body: z.object({ data: z.record(z.string(), z.unknown()) }),
    response: z.object({ id: uuid }),
    summary: 'Add a record to a repeatable section',
  }),
  updateRecord: endpoint({
    method: 'PUT',
    path: '/api/v1/employees/:id/records/:section/:recordId',
    auth: true,
    params: z.object({ id: uuid, section: recordSection, recordId: uuid }),
    body: z.object({ data: z.record(z.string(), z.unknown()) }),
    response: ok,
    summary: 'Replace a record',
  }),
  deleteRecord: endpoint({
    method: 'DELETE',
    path: '/api/v1/employees/:id/records/:section/:recordId',
    auth: true,
    params: z.object({ id: uuid, section: recordSection, recordId: uuid }),
    response: ok,
    summary: 'Delete a record',
  }),
  jobHistory: endpoint({
    method: 'GET',
    path: '/api/v1/employees/:id/job-history',
    auth: true,
    params: employeeIdParams,
    response: z.object({ items: z.array(jobEvent) }),
    summary: 'Effective-dated job changes, newest first',
  }),
  addJobChange: endpoint({
    method: 'POST',
    path: '/api/v1/employees/:id/job-history',
    auth: true,
    params: employeeIdParams,
    body: jobChangeInput,
    response: z.object({ items: z.array(jobEvent) }),
    summary: 'Record a job change (promotion, transfer, new manager, revised CTC) from a date',
  }),
  customFields: endpoint({
    method: 'GET',
    path: '/api/v1/custom-fields',
    auth: true,
    response: z.object({ items: z.array(customFieldDef) }),
    summary: 'Custom profile fields',
  }),
  createCustomField: endpoint({
    method: 'POST',
    path: '/api/v1/custom-fields',
    auth: true,
    body: customFieldInput,
    response: customFieldDef,
    summary: 'Add a custom field to a profile section',
  }),
  updateCustomField: endpoint({
    method: 'PATCH',
    path: '/api/v1/custom-fields/:id',
    auth: true,
    params: z.object({ id: uuid }),
    body: customFieldInput.omit({ key: true, section: true }).partial().extend({ active: z.boolean().optional() }),
    response: customFieldDef,
    summary: 'Change a custom field',
  }),
  importEmployees: endpoint({
    method: 'POST',
    path: '/api/v1/employees/import',
    auth: true,
    query: z.object({ dryRun: z.enum(['true', 'false']).default('true').transform((v) => v === 'true') }),
    response: importReport,
    summary: 'Import employees from an .xlsx (raw body). Validates every row; writes only when all are valid',
  }),
};
