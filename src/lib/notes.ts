import type { Category, Item, Note } from '../../lib/types';
import { uid } from './storage';
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

export function newNote(): Note {
  const now = Date.now();
  return { id: uid(), title: '', items: [newItem()], createdAt: now, updatedAt: now };
}

export function noteTitle(note: Note): string {
  if (note.title.trim()) return note.title.trim();
  const first = note.items.find((i) => i.text.trim());
  return first ? first.text.trim() : 'Untitled';
}

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
    lines.push(`${'  '.repeat(i.indent)}- ${box} ${i.text.trim()}${est}`);
  }
  lines.push('', `**Total** ${fmtMinutes(t.total)}  ·  **Remaining** ${fmtMinutes(t.remaining)}`);
  return lines.join('\n');
}

export const CATEGORY_STYLE: Record<Category, string> = {
  Work: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  Build: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  Study: 'bg-amber-500/14 text-amber-800 dark:text-amber-300',
  Errand: 'bg-orange-500/12 text-orange-700 dark:text-orange-300',
  Health: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  Personal: 'bg-pink-500/12 text-pink-700 dark:text-pink-300',
  Admin: 'bg-slate-500/12 text-slate-700 dark:text-slate-300',
  Other: 'bg-surface-2 text-muted',
};

export const CATEGORY_BAR: Record<Category, string> = {
  Work: 'bg-sky-500',
  Build: 'bg-violet-500',
  Study: 'bg-amber-500',
  Errand: 'bg-orange-500',
  Health: 'bg-emerald-500',
  Personal: 'bg-pink-500',
  Admin: 'bg-slate-500',
  Other: 'bg-line-strong',
};
