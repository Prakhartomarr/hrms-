/** Masks for sensitive values. Keep the last few characters so people can still tell them apart. */
const keepLast = (v: string, n: number, ch = 'X') =>
  v.length <= n ? ch.repeat(v.length) : ch.repeat(v.length - n) + v.slice(-n);

export const maskPan = (v: string) => keepLast(v, 4);
/** Aadhaar shows only its last 4 digits, as UIDAI's masked Aadhaar does. */
export const maskAadhaar = (v: string) => `XXXX XXXX ${v.replace(/\s/g, '').slice(-4)}`;
export const maskAccount = (v: string) => keepLast(v.replace(/\s/g, ''), 4);
export const MASKED_AMOUNT = null;
