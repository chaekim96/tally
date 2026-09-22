import { useMemo, useState } from 'react';
import { Plus, Search, Settings2 } from 'lucide-react';
import type { Note } from '../../lib/types';
import type { AiStatus } from '../lib/ai';
import { noteTitle, totals } from '../lib/notes';
import { fmtMinutes, relativeDay } from '../lib/time';

interface Props {
  notes: Note[];
  selectedId: string | null;
  aiStatus: AiStatus;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onOpenSettings: () => void;
}

const ORDER = ['Today', 'Yesterday', 'This week', 'Earlier'] as const;

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
    return ORDER.filter((k) => map.has(k)).map((k) => ({ label: k, notes: map.get(k)! }));
  }, [notes, q]);

  const status =
    aiStatus.mode === 'checking' ? { dot: 'bg-muted', label: 'Checking AI…' }
    : aiStatus.mode === 'offline' ? { dot: 'bg-warn', label: 'Offline estimates' }
    : { dot: 'bg-ok', label: 'Claude connected' };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-5 pb-3 safe-pt">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-ink text-canvas font-mono text-sm font-semibold flex items-center justify-center">Σ</span>
            <span className="font-semibold tracking-tight">Tally</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onOpenSettings} title="Settings (⌘,)" className="p-2 rounded-lg text-muted hover:text-ink hover:bg-surface-2 transition">
              <Settings2 className="w-4 h-4" />
            </button>
            <button onClick={onCreate} title="New note (⌘N)" className="p-2 rounded-lg bg-ink text-canvas hover:opacity-90 active:scale-95 transition">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes"
            className="w-full bg-surface-2 rounded-lg py-2 pl-8 pr-3 text-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-line-strong transition"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {groups.length === 0 ? (
          <div className="mt-24 text-center text-sm text-muted px-6">
            {q ? 'No matches.' : 'No notes yet. Press ⌘N.'}
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.label} className="mb-3">
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{g.label}</div>
              {g.notes.map((n) => {
                const t = totals(n.items);
                const active = n.id === selectedId;
                return (
                  <button
                    key={n.id}
                    onClick={() => onSelect(n.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition ${active ? 'bg-surface shadow-sm ring-1 ring-line' : 'hover:bg-surface-2'}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={`text-[13.5px] truncate ${active ? 'font-medium' : ''}`}>{noteTitle(n)}</div>
                      <div className="text-[11px] text-muted mt-0.5 truncate">
                        {t.count} {t.count === 1 ? 'item' : 'items'}{t.doneCount ? ` · ${t.doneCount} done` : ''}
                      </div>
                    </div>
                    {t.remaining > 0 && (
                      <span className="font-mono tnum text-[11.5px] text-ink-2 shrink-0">{fmtMinutes(t.remaining, { compact: true })}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="px-4 py-3 border-t border-line flex items-center gap-2 text-[11px] text-muted safe-pb">
        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
        <span className="truncate">{status.label}</span>
        <span className="ml-auto font-mono">{notes.length}</span>
      </div>
    </div>
  );
}
