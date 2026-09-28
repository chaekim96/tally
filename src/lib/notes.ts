import type { Category, Item, Note } from '../../lib/types';
import { uid } from './storage';
import { dateKey, longDate } from './dates';
import { fmtMinutes } from './time';

export function newItem(partial: Partial<Item> = {}): Item {
  return {
    id: uid(),
    text: '',
    done: false,
    minutes: null,
    category: 'Other',
    source: null,
    indent: 0,
    ...partial,
  };
}

/** Notes on one date, oldest first: the order the day pager steps through. */
export function notesOn(notes: Note[], date: string): Note[] {
  return notes.filter((n) => n.date === date).sort((a, b) => a.createdAt - b.createdAt);
}

/** "Monday, September 28", or "Monday, September 28 (2)" for the second note that day. */
export function defaultTitle(date: string, notes: Note[], exceptId?: string): string {
  const n = notes.filter((x) => x.date === date && x.id !== exceptId).length;
  return n === 0 ? longDate(date) : `${longDate(date)} (${n + 1})`;
}

/** True when a title is still the automatic date title (so it can follow a date change). */
export function isAutoTitle(note: Note): boolean {
  const t = note.title.trim();
  return !t || new RegExp(`^${longDate(note.date).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\(\\d+\\))?$`).test(t);
}

export function newNote(notes: Note[], date = dateKey()): Note {
  const now = Date.now();
  return { id: uid(), date, title: defaultTitle(date, notes), items: [newItem()], createdAt: now, updatedAt: now };
}

export function noteTitle(note: Note): string {
  return note.title.trim() || longDate(note.date);
}

export const PRIORITY_MARKS = ['', '!', '!!', '!!!'] as const;
export const PRIORITY_NAMES = ['None', 'Low', 'Medium', 'High'] as const;

export interface Totals {
  total: number;
  done: number;
  remaining: number;
  count: number;
  doneCount: number;
  unestimated: number;
  byCategory: { category: Category; minutes: number }[];
}

export function totals(items: Item[]): Totals {
  const real = items.filter((i) => i.text.trim());
  let total = 0, done = 0, unestimated = 0;
  const cat = new Map<Category, number>();
  for (const i of real) {
    const m = i.minutes ?? 0;
    if (i.minutes == null) unestimated++;
    total += m;
    if (i.done) done += m;
    else if (m > 0) cat.set(i.category, (cat.get(i.category) ?? 0) + m);
  }
  const byCategory = [...cat.entries()]
    .map(([category, minutes]) => ({ category, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
  return {
    total,
    done,
    remaining: total - done,
    count: real.length,
    doneCount: real.filter((i) => i.done).length,
    unestimated,
    byCategory,
  };
}

export function toMarkdown(note: Note): string {
  const t = totals(note.items);
  const lines = [`# ${noteTitle(note)}`, ''];
  for (const i of note.items) {
    if (!i.text.trim()) continue;
    const box = i.done ? '[x]' : '[ ]';
    const est = i.minutes != null && i.minutes > 0 ? `  ·  ${fmtMinutes(i.minutes)}` : '';
    const marks = i.priority ? `${PRIORITY_MARKS[i.priority]} ` : '';
    lines.push(`${'  '.repeat(i.indent)}- ${box} ${marks}${i.text.trim()}${est}`);
    for (const line of (i.notes ?? '').split('\n').filter((l) => l.trim())) lines.push(`${'  '.repeat(i.indent)}    ${line.trim()}`);
  }
  lines.push('', `**Total** ${fmtMinutes(t.total)}  ·  **Remaining** ${fmtMinutes(t.remaining)}`);
  return lines.join('\n');
}
