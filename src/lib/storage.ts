import type { Item, Note, Settings } from '../../lib/types';

export const NOTES_KEY = 'tally.notes.v1';
export const SETTINGS_KEY = 'tally.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  dailyCapacityMinutes: 6 * 60,
  autoEstimate: true,
  apiKey: '',
  accessCode: '',
};

function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — ignore */
  }
}

export function loadNotes(): Note[] {
  const notes = safeRead<Note[]>(NOTES_KEY);
  if (!Array.isArray(notes)) return [];
  return notes.map((n) => ({
    ...n,
    title: n.title ?? '',
    items: (n.items ?? []).map((i: Partial<Item>) => ({
      ...i,
      id: i.id ?? uid(),
      text: i.text ?? '',
      indent: i.indent ?? 0,
      done: i.done ?? false,
      source: i.source ?? null,
      category: i.category ?? 'Other',
      minutes: i.minutes ?? null,
    })),
  }));
}

export function saveNotes(notes: Note[]) {
  safeWrite(NOTES_KEY, notes);
}

export function loadSettings(): Settings {
  // Keep only known keys, so settings from older versions (e.g. theme) drop out.
  const saved = safeRead<Partial<Settings>>(SETTINGS_KEY) ?? {};
  const out = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (saved[k] !== undefined && typeof saved[k] === typeof DEFAULT_SETTINGS[k]) (out as Record<string, unknown>)[k] = saved[k];
  }
  return out;
}

export function saveSettings(s: Settings) {
  safeWrite(SETTINGS_KEY, s);
}


export function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}
