import { useMemo, useState } from 'react';
import { Search, Settings, SquarePen, X } from 'lucide-react';
import type { Note } from '../../lib/types';
import type { AiStatus } from '../lib/ai';
import { noteTitle, totals } from '../lib/notes';
import { fmtMinutes, relativeDay } from '../lib/time';
import { ToolButton } from './ui/controls';

interface Props {
  notes: Note[];
  selectedId: string | null;
  aiStatus: AiStatus;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onOpenSettings: () => void;
}

const ORDER = ['Today', 'Yesterday', 'This week', 'Earlier'] as const;
const HEADING: Record<(typeof ORDER)[number], string> = { Today: 'Today', Yesterday: 'Yesterday', 'This week': 'Previous 7 Days', Earlier: 'Earlier' };

export default function Sidebar({ notes, selectedId, aiStatus, onSelect, onCreate, onOpenSettings }: Props) {
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = notes
      .filter((n) => !needle || noteTitle(n).toLowerCase().includes(needle) || n.items.some((i) => i.text.toLowerCase().includes(needle)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const map = new Map<string, Note[]>();
    for (const n of filtered) {
      const k = relativeDay(n.updatedAt);
      map.set(k, [...(map.get(k) ?? []), n]);
    }
    return ORDER.filter((k) => map.has(k)).map((k) => ({ label: HEADING[k], notes: map.get(k)! }));
  }, [notes, q]);

  const status =
    aiStatus.mode === 'checking' ? { dot: 'bg-control', label: 'Checking Claude…' }
    : aiStatus.mode === 'offline' ? { dot: 'bg-warn', label: 'Offline estimates' }
    : aiStatus.mode === 'browser' ? { dot: 'bg-ok', label: 'Claude · your key' }
    : { dot: 'bg-ok', label: 'Claude · server key' };

  return (
    <div className="flex flex-col h-full">
      <div className="safe-pt">
        <div className="h-14 px-2.5 flex items-center justify-end gap-0.5">
          <ToolButton label="Settings (⌘,)" onClick={onOpenSettings}><Settings className="w-[19px] h-[19px] text-muted" /></ToolButton>
          <button onClick={onCreate} aria-label="New Note" title="New Note (⌘N)" className="tap w-9 h-9 grid place-items-center rounded-full text-tint hover:bg-tint-soft">
            <SquarePen className="w-5 h-5" />
          </button>
        </div>
        <h1 className="px-4 text-[28px] font-bold tracking-[-0.01em] leading-tight">Notes</h1>
        <div className="px-3 pt-2.5 pb-2">
          <label className="relative block">
            <span className="sr-only">Search notes</span>
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
            <input
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
  );
}
