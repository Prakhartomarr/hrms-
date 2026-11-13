import type { CoreDatabase, Transaction } from '@hrms/db';

export interface IdentityTables {
  identity_mfa: {
    user_id: string;
    tenant_id: string;
    secret_enc: string | null;
    pending_secret_enc: string | null;
    enabled_at: Date | string | null;
    last_counter: number | null;
    updated_at?: Date | string;
  };
  identity_password_resets: {
    id: string;
    tenant_id: string;
    user_id: string;
    token_hash: string;
    expires_at: Date | string;
    used_at: Date | string | null;
    created_at?: Date;
  };
}

export type Trx = Transaction<IdentityTables & CoreDatabase>;
/** Transactions that must run before any tenant is known bind to this (no rows visible). */
export const NO_TENANT = '00000000-0000-0000-0000-000000000000';
