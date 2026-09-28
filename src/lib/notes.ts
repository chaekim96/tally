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
    for (const line of (i.notes ?? '').split('\n').filter((l) => l.trim())) lines.push(`${'  '.repeat(i.indent)}    ${line.trim()}`);
  }
  lines.push('', `**Total** ${fmtMinutes(t.total)}  ·  **Remaining** ${fmtMinutes(t.remaining)}`);
  return lines.join('\n');
}
