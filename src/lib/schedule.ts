import type { Item, Note, Schedule } from '../../lib/types';
import { noteTitle } from './notes';

export const DAY_MIN = 24 * 60;
export const SNAP = 15;
/** Duration used for an item that hasn't been estimated (or isn't a task). */
export const FALLBACK_MIN = 30;

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

export function dayLabel(key: string, today = dateKey()): string {
  if (key === today) return 'Today';
  if (key === addDays(today, 1)) return 'Tomorrow';
  if (key === addDays(today, -1)) return 'Yesterday';
  return parseKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function minutesNow(ts = Date.now()): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

/** "2:00 PM" */
export function clock(min: number): string {
  const d = new Date(2000, 0, 1, Math.floor(min / 60), min % 60);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "2:00 – 3:30 PM" (drops the repeated AM/PM when both ends share it). */
export function clockRange(start: number, end: number): string {
  const a = clock(start), b = clock(end);
  const suffix = (s: string) => s.match(/\s?[AP]M$/i)?.[0] ?? '';
  const sa = suffix(a);
  return sa && sa === suffix(b) ? `${a.slice(0, -sa.length)} – ${b}` : `${a} – ${b}`;
}

export const snap = (min: number, step = SNAP) => Math.round(min / step) * step;
export const clampStart = (start: number, dur: number) => Math.min(Math.max(0, start), DAY_MIN - Math.min(dur, DAY_MIN));

export function durationOf(item: Item): number {
  return item.minutes && item.minutes > 0 ? item.minutes : FALLBACK_MIN;
}

export interface Block {
  noteId: string;
  noteTitle: string;
  item: Item;
  start: number;
  end: number;
  /** Column within its overlap cluster, and how many columns the cluster has. */
  col: number;
  cols: number;
}

/** Everything scheduled on a day, across all notes, laid out in columns like a calendar. */
export function blocksFor(notes: Note[], key: string): Block[] {
  const raw: Block[] = [];
  for (const n of notes) {
    for (const item of n.items) {
      if (!item.text.trim() || item.schedule?.date !== key) continue;
      const start = item.schedule.start;
      raw.push({ noteId: n.id, noteTitle: noteTitle(n), item, start, end: Math.min(DAY_MIN, start + durationOf(item)), col: 0, cols: 1 });
    }
  }
  return layoutColumns(raw);
}

/**
 * Overlapping blocks share the width: each cluster of transitively
 * overlapping blocks gets as many columns as it needs, first-fit.
 */
export function layoutColumns(blocks: Block[]): Block[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: Block[] = [];
  let clusterEnd = -1;
  let colEnds: number[] = [];
  const flush = () => { for (const b of cluster) b.cols = colEnds.length; cluster = []; colEnds = []; };
  for (const b of sorted) {
    if (b.start >= clusterEnd && cluster.length) flush();
    let col = colEnds.findIndex((end) => end <= b.start);
    if (col === -1) { col = colEnds.length; colEnds.push(b.end); } else colEnds[col] = b.end;
    b.col = col;
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  flush();
  return sorted;
}

/**
 * First gap long enough for `dur`: from now (today) or 9 AM (other days),
 * never before 8 AM. If the day is full, it lands at the latest start that fits.
 */
export function nextFreeStart(blocks: { start: number; end: number }[], dur: number, key: string, now = Date.now()): number {
  const today = key === dateKey(now);
  let t = today ? Math.max(8 * 60, Math.ceil(minutesNow(now) / SNAP) * SNAP) : 9 * 60;
  for (const b of [...blocks].sort((a, c) => a.start - c.start)) {
    if (t + dur <= b.start) break;
    if (b.end > t) t = Math.ceil(b.end / SNAP) * SNAP;
  }
  return clampStart(t, dur);
}

export function scheduleLabel(s: Schedule, dur: number, today = dateKey()): string {
  const day = dayLabel(s.date, today);
  return `${day === 'Today' ? '' : `${day}, `}${clockRange(s.start, Math.min(DAY_MIN, s.start + dur))}`;
}
