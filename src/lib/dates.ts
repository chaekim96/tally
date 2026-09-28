// Local calendar-date helpers (YYYY-MM-DD keys). No imports, so notes.ts and
// schedule.ts can both depend on it.

/** Local YYYY-MM-DD for a timestamp. */
export function dateKey(ts: number | Date = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseKey(to).getTime() - parseKey(from).getTime()) / 86_400_000);
}

export function dayLabel(key: string, today = dateKey()): string {
  if (key === today) return 'Today';
  if (key === addDays(today, 1)) return 'Tomorrow';
  if (key === addDays(today, -1)) return 'Yesterday';
  return parseKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Monday, September 28" — the default title for a note on that date. */
export function longDate(key: string): string {
  return parseKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function minutesNow(ts = Date.now()): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}
