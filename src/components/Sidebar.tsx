import { useEffect, useMemo, useRef, useState } from 'react';
import { PanelLeft, Search, Settings, SquarePen, X } from 'lucide-react';
import type { Note } from '../../lib/types';
import type { AiStatus } from '../lib/ai';
import { dateKey, daysBetween, parseKey } from '../lib/dates';
import { noteTitle, totals } from '../lib/notes';
import { fmtMinutes } from '../lib/time';
import { ToolButton } from './ui/controls';

interface Props {
  notes: Note[];
  selectedId: string | null;
  aiStatus: AiStatus;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onOpenSettings: () => void;
}

const BUCKETS = ['Upcoming', 'Today', 'Yesterday', 'Previous 7 Days', 'Earlier'] as const;
type Bucket = (typeof BUCKETS)[number];

function bucketOf(date: string, today: string): Bucket {
  const d = daysBetween(today, date);
  if (d > 0) return 'Upcoming';
  if (d === 0) return 'Today';
  if (d === -1) return 'Yesterday';
  return d >= -7 ? 'Previous 7 Days' : 'Earlier';
}

/** Notes grouped by the day they're for; the next day up comes first under Upcoming. */
function groupNotes(notes: Note[], today: string) {
  const sorted = [...notes].sort((a, b) => {
    const fa = a.date > today, fb = b.date > today;
    if (fa !== fb) return fa ? -1 : 1;
    if (a.date !== b.date) return fa ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    return a.createdAt - b.createdAt;
  });
  const map = new Map<Bucket, Note[]>();
  for (const n of sorted) map.set(bucketOf(n.date, today), [...(map.get(bucketOf(n.date, today)) ?? []), n]);
  return BUCKETS.filter((b) => map.has(b)).map((b) => ({ label: b, notes: map.get(b)! }));
}

export default function Sidebar({ notes, selectedId, aiStatus, collapsed, onToggleCollapsed, onSelect, onCreate, onOpenSettings }: Props) {
  const [q, setQ] = useState('');
  const [focusSearch, setFocusSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const today = dateKey();

  useEffect(() => {
    if (!collapsed && focusSearch) { searchRef.current?.focus(); setFocusSearch(false); }
  }, [collapsed, focusSearch]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = notes.filter((n) => !needle || noteTitle(n).toLowerCase().includes(needle)
      || n.items.some((i) => i.text.toLowerCase().includes(needle) || !!i.notes?.toLowerCase().includes(needle)));
    return groupNotes(filtered, today);
  }, [notes, q, today]);

  const status =
    aiStatus.mode === 'checking' ? { dot: 'bg-control', label: 'Checking Claude…' }
    : aiStatus.mode === 'offline' ? { dot: 'bg-warn', label: 'Offline estimates' }
    : aiStatus.mode === 'browser' ? { dot: 'bg-ok', label: 'Claude · your key' }
    : { dot: 'bg-ok', label: 'Claude · server key' };

  const newNoteButton = (
    <button onClick={onCreate} aria-label="New Note" title="New Note (⌘N)" className="tap w-9 h-9 grid place-items-center rounded-full text-tint hover:bg-tint-soft">
      <SquarePen className="w-5 h-5" />
    </button>
  );

  // Minimized: a rail of date tiles, like the Calendar app icon (desktop only; phones keep the full list).
  let rail: React.ReactNode = null;
  if (collapsed) {
    const all = groups.flatMap((g) => g.notes);
    rail = (
      <div className="hidden md:flex flex-col items-center h-full">
        <div className="safe-pt flex flex-col items-center gap-0.5 pt-2.5">
          <ToolButton label="Show Sidebar (⌃⌘S)" onClick={onToggleCollapsed}><PanelLeft className="w-[19px] h-[19px] text-muted" /></ToolButton>
          {newNoteButton}
          <ToolButton label="Search Notes" onClick={() => { setFocusSearch(true); onToggleCollapsed(); }}><Search className="w-[18px] h-[18px] text-muted" /></ToolButton>
        </div>
        <span aria-hidden className="w-8 my-2 border-t-[0.5px] border-separator" />
        <nav aria-label="Notes" className="flex-1 w-full overflow-y-auto flex flex-col items-center gap-1 pb-2">
          {all.map((n) => {
            const d = parseKey(n.date);
            const sameDay = all.filter((x) => x.date === n.date);
            const nth = sameDay.indexOf(n) + 1;
            const t = totals(n.items);
            const active = n.id === selectedId;
            return (
              <button
                key={n.id}
                onClick={() => onSelect(n.id)}
                aria-current={active ? 'page' : undefined}
                aria-label={`${noteTitle(n)}${t.remaining ? `, ${fmtMinutes(t.remaining)} remaining` : ''}`}
                title={noteTitle(n)}
                className={`relative w-[52px] py-1.5 rounded-[12px] flex flex-col items-center leading-none ${active ? 'bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.06)]' : 'hover:bg-fill'}`}
              >
                <span className="text-[11px] font-semibold text-tint uppercase tracking-wide">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <span className="text-[21px] font-medium tabular mt-0.5">{d.getDate()}</span>
                {sameDay.length > 1 && (
                  <span aria-hidden className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-surface shadow-[0_0_0_0.5px_var(--separator)] text-[11px] leading-4 tabular text-ink-2">{nth}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="py-2 flex flex-col items-center gap-1 border-t-[0.5px] border-separator w-full safe-pb">
          <ToolButton label="Settings (⌘,)" onClick={onOpenSettings}><Settings className="w-[19px] h-[19px] text-muted" /></ToolButton>
          <span role="status" aria-label={status.label} title={status.label} className={`w-2 h-2 rounded-full ${status.dot}`} />
        </div>
      </div>
    );
  }

  return (
    <>
    {rail}
    <div className={`${collapsed ? 'flex md:hidden' : 'flex'} flex-col h-full`}>
      <div className="safe-pt">
        <div className="h-14 px-2.5 flex items-center gap-0.5">
          <div className="hidden md:block">
            <ToolButton label="Hide Sidebar (⌃⌘S)" onClick={onToggleCollapsed}><PanelLeft className="w-[19px] h-[19px] text-muted" /></ToolButton>
          </div>
          <div className="ml-auto flex items-center gap-0.5">
            <ToolButton label="Settings (⌘,)" onClick={onOpenSettings}><Settings className="w-[19px] h-[19px] text-muted" /></ToolButton>
            {newNoteButton}
          </div>
        </div>
        <h1 className="px-4 text-[28px] font-bold tracking-[-0.01em] leading-tight">Notes</h1>
        <div className="px-3 pt-2.5 pb-2">
          <label className="relative block">
            <span className="sr-only">Search notes</span>
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="w-full h-9 bg-fill rounded-[10px] pl-8 pr-8 text-[15px] outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {q && (
              <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-full text-muted hover:text-ink">
                <X className="w-3.5 h-3.5" strokeWidth={2.5} />
              </button>
            )}
          </label>
        </div>
      </div>

      <nav aria-label="Notes" className="flex-1 overflow-y-auto px-2 pb-3">
        {groups.length === 0 ? (
          <p className="mt-20 text-center text-[15px] text-muted px-6">
            {q ? `No results for “${q.trim()}”.` : 'No notes yet.'}
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.label} className="mb-2">
              <h2 className="px-2.5 pt-3 pb-1 text-[13px] font-semibold text-muted">{g.label}</h2>
              <ul>
                {g.notes.map((n) => {
                  const t = totals(n.items);
                  const active = n.id === selectedId;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => onSelect(n.id)}
                        aria-current={active ? 'page' : undefined}
                        className={`row w-full text-left px-2.5 py-2 rounded-[10px] flex items-center gap-3 ${active ? 'bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.06)]' : 'hover:bg-fill'}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[15px] font-semibold truncate">{noteTitle(n)}</div>
                          <div className="text-[13px] text-muted truncate tabular">
                            {t.count} {t.count === 1 ? 'item' : 'items'}{t.doneCount ? ` · ${t.doneCount} completed` : ''}
                          </div>
                        </div>
                        {t.remaining > 0 && (
                          <span className="tabular text-[13px] text-muted shrink-0" aria-label={`${fmtMinutes(t.remaining)} remaining`}>
                            {fmtMinutes(t.remaining, { compact: true })}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </nav>

      <div className="px-4 h-11 flex items-center gap-2 text-[12px] text-muted border-t-[0.5px] border-separator safe-pb" role="status">
        <span className={`w-2 h-2 rounded-full ${status.dot}`} aria-hidden />
        <span className="truncate">{status.label}</span>
        <span className="ml-auto tabular" aria-label={`${notes.length} notes`}>{notes.length}</span>
      </div>
    </div>
    </>
  );
}
