import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlignLeft, ArrowDownWideNarrow, ArrowUpNarrowWide, Check, ChevronLeft, Copy, EyeOff, PanelRight, Plus, Trash2 } from 'lucide-react';
import type { Item, Note } from '../../lib/types';
import type { SortMode } from '../App';
import type { AiStatus } from '../lib/ai';
import { newItem, toMarkdown } from '../lib/notes';
import ItemRow from './ItemRow';

interface Props {
  note: Note;
  pending: Set<string>;
  sortMode: SortMode;
  hideDone: boolean;
  aiStatus: AiStatus;
  onSort: (m: SortMode) => void;
  onHideDone: (v: boolean) => void;
  onUpdate: (fn: (n: Note) => Note) => void;
  onUpdateItem: (id: string, fn: (i: Item) => Item) => void;
  onTyped: (id: string) => void;
  onEstimate: (ids: string[], force?: boolean) => void;
  onBreakdown: (id: string) => void;
  onDelete: () => void;
  onBack: () => void;
  ledgerOpen: boolean;
  onToggleLedger: () => void;
}

export default function Editor(p: Props) {
  const { note, sortMode, hideDone } = p;
  const inputs = useRef<Map<string, HTMLInputElement>>(new Map());
  const [copied, setCopied] = useState(false);

  const register = useCallback((id: string, el: HTMLInputElement | null) => {
    if (el) inputs.current.set(id, el); else inputs.current.delete(id);
  }, []);
  // Focus synchronously when the input already exists; otherwise right after
  // React commits the row (useLayoutEffect below), so fast typists never land
  // in the wrong field.
  const pendingFocus = useRef<{ id: string; caret: 'start' | 'end' } | null>(null);
  const applyFocus = (id: string, caret: 'start' | 'end') => {
    const el = inputs.current.get(id);
    if (!el) return false;
    el.focus();
    const pos = caret === 'end' ? el.value.length : 0;
    el.setSelectionRange(pos, pos);
    return true;
  };
  const focus = (id: string | undefined, caret: 'start' | 'end' = 'end') => {
    if (!id) return;
    if (!applyFocus(id, caret)) pendingFocus.current = { id, caret };
  };
  useLayoutEffect(() => {
    const pf = pendingFocus.current;
    if (pf && applyFocus(pf.id, pf.caret)) pendingFocus.current = null;
  });

  const visible = useMemo(() => {
    let list = note.items;
    if (hideDone) list = list.filter((i) => !i.done);
    if (sortMode === 'original') return list;
    const sorted = [...list].sort((a, b) => (b.minutes ?? -1) - (a.minutes ?? -1));
    return sortMode === 'longest' ? sorted : sorted.reverse();
  }, [note.items, sortMode, hideDone]);

  // ---- structural edits (always operate on the original order) ----
  const insertAfter = (id: string) => {
    const idx = note.items.findIndex((i) => i.id === id);
    const item = newItem({ indent: note.items[idx]?.indent ?? 0 });
    p.onUpdate((n) => ({ ...n, items: [...n.items.slice(0, idx + 1), item, ...n.items.slice(idx + 1)] }));
    focus(item.id);
  };
  const append = () => {
    const item = newItem();
    p.onUpdate((n) => ({ ...n, items: [...n.items, item] }));
    focus(item.id);
  };
  const remove = (id: string) => {
    const idx = note.items.findIndex((i) => i.id === id);
    if (note.items.length === 1) { p.onUpdateItem(id, (i) => ({ ...i, text: '' })); return; }
    const prev = note.items[idx - 1] ?? note.items[idx + 1];
    p.onUpdate((n) => ({ ...n, items: n.items.filter((i) => i.id !== id) }));
    focus(prev?.id);
  };
  const move = (id: string, dir: -1 | 1) => {
    const idx = note.items.findIndex((i) => i.id === id);
    const j = idx + dir;
    if (j < 0 || j >= note.items.length) return;
    p.onUpdate((n) => {
      const items = [...n.items];
      [items[idx], items[j]] = [items[j], items[idx]];
      return { ...n, items };
    });
    focus(id);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, item: Item) => {
    const mod = e.metaKey || e.ctrlKey;
    const idx = visible.findIndex((i) => i.id === item.id);

    if (e.key === 'Enter' && !mod && !e.shiftKey) {
      e.preventDefault();
      if (sortMode !== 'original') p.onSort('original');
      // Only split into a new line when the cursor is at the end; otherwise carry the tail.
      const el = e.currentTarget;
      const tail = el.value.slice(el.selectionStart ?? el.value.length);
      if (tail) {
        const head = el.value.slice(0, el.selectionStart ?? 0);
        p.onUpdateItem(item.id, (i) => ({ ...i, text: head }));
        const idxO = note.items.findIndex((i) => i.id === item.id);
        const ni = newItem({ text: tail, indent: item.indent });
        p.onUpdate((n) => ({ ...n, items: [...n.items.slice(0, idxO + 1), ni, ...n.items.slice(idxO + 1)] }));
        p.onTyped(item.id); p.onTyped(ni.id);
        focus(ni.id, 'start');
      } else {
        insertAfter(item.id);
      }
    } else if (e.key === 'Enter' && mod) {
      e.preventDefault();
      p.onUpdateItem(item.id, (i) => ({ ...i, done: !i.done }));
    } else if (e.key === 'Backspace' && item.text === '') {
      e.preventDefault();
      remove(item.id);
    } else if (e.key === 'ArrowUp' && e.altKey) {
      e.preventDefault(); move(item.id, -1);
    } else if (e.key === 'ArrowDown' && e.altKey) {
      e.preventDefault(); move(item.id, 1);
    } else if (e.key === 'ArrowUp' && idx > 0) {
      e.preventDefault(); focus(visible[idx - 1].id);
    } else if (e.key === 'ArrowDown' && idx < visible.length - 1) {
      e.preventDefault(); focus(visible[idx + 1].id);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      p.onUpdateItem(item.id, (i) => ({ ...i, indent: e.shiftKey ? 0 : 1 }));
    } else if (mod && e.key.toLowerCase() === 'e') {
      e.preventDefault(); p.onEstimate([item.id], true);
    } else if (mod && e.key.toLowerCase() === 'b') {
      e.preventDefault(); p.onBreakdown(item.id);
    }
  };

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(toMarkdown(note));
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked */ }
  };

  const date = new Date(note.updatedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 md:px-6 pt-3 pb-2 safe-pt">
        <button onClick={p.onBack} className="md:hidden p-1.5 -ml-1 rounded-lg text-ink-2 hover:bg-surface-2"><ChevronLeft className="w-5 h-5" /></button>
        <span className="hidden sm:inline text-[11px] font-medium uppercase tracking-[0.12em] text-muted whitespace-nowrap">{date}</span>
        <div className="ml-auto flex items-center gap-1">
          <Segmented value={sortMode} onChange={p.onSort} />
          <IconBtn title={hideDone ? 'Show done' : 'Hide done'} active={hideDone} onClick={() => p.onHideDone(!hideDone)}><EyeOff className="w-4 h-4" /></IconBtn>
          <IconBtn title="Copy as Markdown" onClick={copyMarkdown}>{copied ? <Check className="w-4 h-4 text-ok" /> : <Copy className="w-4 h-4" />}</IconBtn>
          <IconBtn title="Toggle ledger" active={p.ledgerOpen} onClick={p.onToggleLedger}><PanelRight className="w-4 h-4" /></IconBtn>
          <IconBtn title="Delete note" onClick={() => confirm('Delete this note?') && p.onDelete()} danger><Trash2 className="w-4 h-4" /></IconBtn>
        </div>
      </div>

      {/* Title */}
      <div className="px-4 md:px-8 pt-2 pb-1">
        <input
          value={note.title}
          onChange={(e) => p.onUpdate((n) => ({ ...n, title: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focus(note.items[0]?.id); } }}
          placeholder="Untitled"
          className="w-full bg-transparent outline-none text-[26px] md:text-[30px] font-semibold tracking-tight placeholder:text-line-strong"
        />
      </div>

      {/* Column headers */}
      <div className="px-4 md:px-8 mt-2 flex items-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted border-b border-line pb-1.5">
        <span className="pl-8">Item</span>
        <span className="ml-auto w-[64px] md:w-[88px] text-right">Type</span>
        <span className="w-[76px] md:w-[92px] text-right border-l border-line ml-3 pl-3">Est.</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-24">
        {visible.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            pending={p.pending.has(item.id)}
            aiAvailable={p.aiStatus.mode === 'server' || p.aiStatus.mode === 'browser'}
            draggable={sortMode === 'original'}
            register={register}
            onChange={(text) => { p.onUpdateItem(item.id, (i) => ({ ...i, text })); p.onTyped(item.id); }}
            onToggle={() => p.onUpdateItem(item.id, (i) => ({ ...i, done: !i.done }))}
            onKeyDown={(e) => onKey(e, item)}
            onCategory={(c) => p.onUpdateItem(item.id, (i) => ({ ...i, category: c }))}
            onManualMinutes={(m) => p.onUpdateItem(item.id, (i) => ({ ...i, minutes: m, low: m, high: m, confidence: 'high', rationale: 'Set by you', source: 'manual' }))}
            onEstimate={() => p.onEstimate([item.id], true)}
            onBreakdown={() => p.onBreakdown(item.id)}
            onRemove={() => remove(item.id)}
          />
        ))}
        {sortMode === 'original' && !hideDone && (
          <button onClick={append} className="mt-1 pl-8 py-3 flex items-center gap-2 text-sm text-muted hover:text-ink transition w-full text-left">
            <Plus className="w-4 h-4" /> Add item
          </button>
        )}
        {visible.length === 0 && (
          <div className="py-10 text-center text-sm text-muted">{hideDone ? 'Everything is done. Nice.' : 'Start typing.'}</div>
        )}
      </div>
    </div>
  );
}

function Segmented({ value, onChange }: { value: SortMode; onChange: (m: SortMode) => void }) {
  const opts: { v: SortMode; icon: React.ReactNode; label: string }[] = [
    { v: 'original', icon: <AlignLeft className="w-3.5 h-3.5" />, label: 'Original' },
    { v: 'longest', icon: <ArrowDownWideNarrow className="w-3.5 h-3.5" />, label: 'Longest' },
    { v: 'shortest', icon: <ArrowUpNarrowWide className="w-3.5 h-3.5" />, label: 'Shortest' },
  ];
  return (
    <div className="flex items-center bg-surface-2 p-0.5 rounded-lg mr-1">
      {opts.map((o) => (
        <button key={o.v} title={o.label} onClick={() => onChange(o.v)} className={`px-2 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition ${value === o.v ? 'bg-surface shadow-sm text-ink' : 'text-muted hover:text-ink'}`}>
          {o.icon}<span className="hidden sm:inline">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function IconBtn({ children, title, onClick, active, danger, className = '' }: { children: React.ReactNode; title: string; onClick: () => void; active?: boolean; danger?: boolean; className?: string }) {
  return (
    <button title={title} onClick={onClick} className={`p-2 rounded-lg transition ${active ? 'bg-surface-2 text-ink' : 'text-muted hover:bg-surface-2'} ${danger ? 'hover:text-danger' : 'hover:text-ink'} ${className}`}>
      {children}
    </button>
  );
}
