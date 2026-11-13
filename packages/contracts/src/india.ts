/**
 * India-specific identifiers and formatting. Pure functions shared by the server (validation,
 * import) and the web app (inline validation, display).
 */

/** PAN: 5 letters, 4 digits, 1 letter. The 4th letter is the holder type (P = person). */
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
/** IFSC: 4 letters (bank), a zero, 6 letters or digits (branch). */
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
/** UAN (EPFO): 12 digits. */
export const UAN_RE = /^\d{12}$/;
/** ESIC insurance number: 10 or 17 digits. */
export const ESIC_RE = /^(\d{10}|\d{17})$/;
/** Indian mobile: optional +91, then 10 digits starting 6-9. */
export const MOBILE_RE = /^(\+91[- ]?)?[6-9]\d{9}$/;

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** Verhoeff checksum over a digit string: 0 when the last digit is a valid check digit. */
function verhoeff(digits: string): number {
  let c = 0;
  const rev = digits.split('').reverse();
  for (let i = 0; i < rev.length; i++) c = D[c]![P[i % 8]![Number(rev[i])]!]!;
  return c;
}

/** The Verhoeff check digit to append to `digits`. */
export function verhoeffDigit(digits: string): number {
  return INV[verhoeff(`${digits}0`)]!;
}

export const stripSpaces = (v: string) => v.replace(/[\s-]/g, '');

/** Aadhaar: 12 digits, first digit 2-9, last digit a Verhoeff check digit. */
export function isValidAadhaar(value: string): boolean {
  const v = stripSpaces(value);
  return /^[2-9]\d{11}$/.test(v) && verhoeff(v) === 0;
}
export const isValidPan = (value: string) => PAN_RE.test(value.trim().toUpperCase());
export const isValidIfsc = (value: string) => IFSC_RE.test(value.trim().toUpperCase());
export const isValidUan = (value: string) => UAN_RE.test(stripSpaces(value));
export const isValidEsic = (value: string) => ESIC_RE.test(stripSpaces(value));
export const isValidMobile = (value: string) => MOBILE_RE.test(value.trim());
/** Bank account numbers in India run 9 to 18 digits. */
export const isValidBankAccount = (value: string) => /^\d{9,18}$/.test(stripSpaces(value));

/** Groups an integer string the Indian way: 12,34,56,789. */
export function groupIndian(intDigits: string): string {
  const neg = intDigits.startsWith('-');
  const d = neg ? intDigits.slice(1) : intDigits;
  if (d.length <= 3) return (neg ? '-' : '') + d;
  const last3 = d.slice(-3);
  const rest = d.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${rest},${last3}`;
}

/**
 * Paise to rupees for display: `₹12,34,567` (no paise when whole) or `₹12,34,567.50`.
 * Uses integer arithmetic only.
 */
export function formatInr(paiseAmount: number, opts: { symbol?: boolean; paise?: 'auto' | 'always' | 'never' } = {}): string {
  const neg = paiseAmount < 0;
  const abs = Math.abs(Math.trunc(paiseAmount));
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const mode = opts.paise ?? 'auto';
  const frac = mode === 'always' || (mode === 'auto' && p !== 0) ? `.${String(p).padStart(2, '0')}` : '';
  return `${neg ? '-' : ''}${opts.symbol === false ? '' : '₹'}${groupIndian(String(rupees))}${frac}`;
}

/** Rupees (number or "12,34,567.50" text) to integer paise; null when unreadable. */
export function rupeesToPaise(input: number | string): number | null {
  const s = typeof input === 'number' ? input.toFixed(2) : input.replace(/[₹,\s]/g, '').replace(/^Rs\.?/i, '');
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const value = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0') || 0);
  return m[1] ? -value : value;
}
