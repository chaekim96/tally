/** "1h 30m", "45m", "2h" */
export function fmtMinutes(mins: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (mins == null || Number.isNaN(mins)) return '—';
  const m = Math.max(0, Math.round(mins));
  if (m === 0) return '0m';
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  if (r === 0) return `${h}h`;
  return opts.compact ? `${h}h${r}` : `${h}h ${r}m`;
}

/** Parse "1h 30m", "1.5h", "90", "45m", "2 hours", "20 min" → minutes, or null. */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s));
  let total = 0;
  let matched = false;
  const h = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  if (h) { total += parseFloat(h[1]) * 60; matched = true; }
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/);
  if (m) { total += parseFloat(m[1]); matched = true; }
  const d = s.match(/(\d+(?:\.\d+)?)\s*(?:d|day|days)\b/);
  if (d) { total += parseFloat(d[1]) * 8 * 60; matched = true; }
  // "1h30" shorthand
  const hm = s.match(/^(\d+)h(\d{1,2})$/);
  if (hm) return parseInt(hm[1]) * 60 + parseInt(hm[2]);
  return matched ? Math.round(total) : null;
}

/**
 * Find an explicit duration the user typed into a task line, e.g.
 * "Gym (1h)", "Write intro - 30m", "Call mom 15 min". Returns minutes or null.
 */
export function extractInlineDuration(text: string): number | null {
  const m = text.match(/(?:\(|\[|~|-|–|—|:|\s)\s*(\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours)(?:\s*\d{1,2}\s*(?:m|min|mins)?)?|\d+(?:\.\d+)?\s*(?:m|min|mins|minute|minutes))\s*(?:\)|\])?\s*$/i);
  if (!m) return null;
  return parseDuration(m[1]);
}

export function finishBy(fromMs: number, minutes: number): string {
  const d = new Date(fromMs + minutes * 60_000);
  const sameDay = new Date(fromMs).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return time;
  return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

export function relativeDay(ts: number, now = Date.now()): 'Today' | 'Yesterday' | 'This week' | 'Earlier' {
  const a = new Date(ts); const b = new Date(now);
  const dayA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const dayB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  const diff = Math.round((dayB - dayA) / 86_400_000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return 'This week';
  return 'Earlier';
}
