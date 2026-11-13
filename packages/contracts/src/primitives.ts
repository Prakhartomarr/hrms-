import { z } from 'zod';

export const uuid = z.uuid();
/** Calendar date, `YYYY-MM-DD`. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const isoDateTime = z.string();
/** Emails are compared lower-cased and trimmed. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const emailInput = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email())
  .transform((v) => normalizeEmail(v));
export const password = z.string().min(10, 'Use at least 10 characters').max(200);
/** Money is integer paise end to end. ₹1 = 100 paise. */
export const paise = z.number().int().nonnegative();
export const ok = z.object({ ok: z.literal(true) });
export const idParams = z.object({ id: uuid });
export const page = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export const errorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ErrorBody = z.infer<typeof errorBody>;
