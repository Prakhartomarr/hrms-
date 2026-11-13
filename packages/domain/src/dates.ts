/** Date-only helpers on `YYYY-MM-DD` strings (no time zones involved). */
export const toDay = (d: Date): string => d.toISOString().slice(0, 10);

/** Today in India (IST, UTC+5:30): what "current" means for effective dating. */
export function todayIst(now: Date = new Date()): string {
  return toDay(new Date(now.getTime() + 330 * 60_000));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export const monthOf = (day: string): number => Number(day.slice(5, 7));
