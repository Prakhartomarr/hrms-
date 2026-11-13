import type { CoreDatabase, Transaction } from '@hrms/db';

export interface PeopleTables {
  employee_records: {
    id: string;
    tenant_id: string;
    employee_id: string;
    section: string;
    data: unknown;
    file_key: string | null;
    created_at?: Date;
    updated_at?: Date;
  };
  custom_field_defs: {
    id: string;
    tenant_id: string;
    section: string;
    key: string;
    label: string;
    type: string;
    required: boolean;
    options: unknown;
    validation: unknown;
    position: number;
    active: boolean;
    created_at?: Date;
  };
}

export type Trx = Transaction<PeopleTables & CoreDatabase>;
