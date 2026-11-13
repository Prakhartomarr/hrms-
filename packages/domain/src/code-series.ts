/**
 * Employee code patterns, one per legal entity. Tokens:
 *   {ENTITY}  entity code      {SEQ:n}  running number, zero-padded to n (n = 1-9)
 *   {YYYY} {YY} {MM}          joining date parts
 * Everything else is literal. A pattern must contain exactly one {SEQ} or {SEQ:n}.
 */
const TOKEN = /\{(ENTITY|YYYY|YY|MM|SEQ(?::(\d))?)\}/g;

export function validatePattern(pattern: string): string | null {
  const seqs = pattern.match(/\{SEQ(?::\d)?\}/g) ?? [];
  if (seqs.length !== 1) return 'The pattern needs exactly one {SEQ} or {SEQ:n}';
  const unknown = pattern.replace(TOKEN, '').match(/\{[^}]*\}/);
  if (unknown) return `Unknown token ${unknown[0]}`;
  const literal = pattern.replace(TOKEN, '');
  if (/[^A-Za-z0-9/_-]/.test(literal)) return 'Literal text may use letters, digits, -, _ and /';
  return null;
}

export function formatCode(pattern: string, input: { entityCode: string; seq: number; date: string }): string {
  return pattern.replace(TOKEN, (_m, tok: string, width?: string) => {
    if (tok === 'ENTITY') return input.entityCode.toUpperCase();
    if (tok === 'YYYY') return input.date.slice(0, 4);
    if (tok === 'YY') return input.date.slice(2, 4);
    if (tok === 'MM') return input.date.slice(5, 7);
    return String(input.seq).padStart(width ? Number(width) : 1, '0');
  });
}

export const DEFAULT_CODE_PATTERN = '{ENTITY}{SEQ:4}';
