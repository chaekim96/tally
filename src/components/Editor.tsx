import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, ChevronLeft, ChevronRight, Copy, Ellipsis, PanelRight, Plus, Trash2 } from 'lucide-react';
import type { Item, Note } from '../../lib/types';
import type { SortMode } from '../App';
import type { AiStatus } from '../lib/ai';
import { longDate } from '../lib/dates';
import { newItem, noteTitle, toMarkdown, totals } from '../lib/notes';
import ItemRow from './ItemRow';
import Alert from './ui/Alert';
import Menu from './ui/Menu';
import { ToolButton } from './ui/controls';

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
  onToast: (text: string) => void;
  flash: Set<string>;
  onScheduleNext: (itemId: string) => void;
  onOpenDay: (date: string) => void;
  /** Every note for this note's date, oldest first (the day pager). */
  dayNotes: Note[];
  onSelectNote: (id: string) => void;
  onNewNoteForDay: () => void;
  onChangeDate: (date: string) => void;
}

// The Estimate heading cycles the time sorts; Priority First lives in the More menu.
const NEXT_SORT: Record<SortMode, SortMode> = { original: 'longest', longest: 'shortest', shortest: 'original', priority: 'longest' };
const SORT_LABEL: Record<SortMode, string> = { original: 'Original Order', priority: 'Priority First', longest: 'Longest First', shortest: 'Shortest First' };

export default function Editor(p: Props) {
  const { note, sortMode, hideDone } = p;
  const inputs = useRef<Map<string, HTMLInputElement>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [titleHidden, setTitleHidden] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  // The large title collapses into the toolbar once it scrolls under it (toolbars.md › Phone: large titles).
  useEffect(() => {
    const root = scrollRef.current, target = titleRef.current;
    if (!root || !target) return;
    const toolbar = parseFloat(getComputedStyle(root).paddingTop) || 56;
    const io = new IntersectionObserver(([e]) => setTitleHidden(!e.isIntersecting), { root, rootMargin: `-${toolbar}px 0px 0px 0px` });
    io.observe(target);
    return () => io.disconnect();
  }, []);

  const visible = useMemo(() => {
    let list = note.items;
    if (hideDone) list = list.filter((i) => !i.done);
    if (sortMode === 'original') return list;
    if (sortMode === 'priority') return [...list].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
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
      p.onToast('Copied as Markdown.');
    } catch {
      p.onToast('Couldn’t copy. Your browser blocked clipboard access.');
    }
  };

  const t = totals(note.items);
  const title = noteTitle(note);

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto pt-[var(--toolbar-h)]">
        <div className="max-w-[860px] mx-auto px-4 md:px-8 pb-28">
          {/* Large title */}
          <input
            ref={titleRef}
            value={note.title}
            onChange={(e) => p.onUpdate((n) => ({ ...n, title: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focus(note.items[0]?.id); } }}
            placeholder={longDate(note.date)}
            aria-label="Note title"
            className="bare w-full bg-transparent outline-none text-[28px] md:text-[30px] leading-tight font-bold tracking-[-0.01em] pt-1"
          />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[13px] text-muted tabular">
            {/* The note's day: a native date picker (pickers.md: prefer system pickers) */}
            <label className="relative inline-flex items-center gap-1 rounded-[6px] hover:text-tint focus-within:text-tint cursor-pointer">
              <CalendarDays className="w-3.5 h-3.5" aria-hidden />
              <span>{longDate(note.date)}</span>
              <input
                type="date"
                value={note.date}
                required
                aria-label="Note date"
                onChange={(e) => e.target.value && p.onChangeDate(e.target.value)}
                onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* not supported: typing still works */ } }}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
              />
            </label>
            {t.count > 0 && <span>· {t.count} {t.count === 1 ? 'item' : 'items'}{t.doneCount > 0 && `, ${t.doneCount} completed`}</span>}
            <DayPager notes={p.dayNotes} currentId={note.id} onSelect={p.onSelectNote} onNew={p.onNewNoteForDay} />
          </div>

          {/* Column headings; the estimate heading sorts, like a Mac table (lists-and-tables.md › Desktop) */}
          <div className="mt-5 flex items-center h-7 text-[12px] font-medium text-muted border-b-[0.5px] border-separator">
            <span className="pl-[42px]">Item</span>
            <span className="ml-auto w-[76px] md:w-[92px] text-right">Category</span>
            <button
              onClick={() => p.onSort(NEXT_SORT[sortMode])}
              aria-label={`Sort by estimate. Currently ${SORT_LABEL[sortMode]}`}
              className={`w-[64px] md:w-[84px] h-7 flex items-center justify-end gap-0.5 rounded-[6px] hover:text-ink ${sortMode === 'longest' || sortMode === 'shortest' ? 'text-tint' : ''}`}
            >
              Estimate
              {sortMode === 'longest' && <ArrowDown className="w-3 h-3" strokeWidth={2.25} aria-hidden />}
              {sortMode === 'shortest' && <ArrowUp className="w-3 h-3" strokeWidth={2.25} aria-hidden />}
            </button>
          </div>

          {visible.map((item) => (
            <ItemRow
              key={item.id}
              noteId={note.id}
              item={item}
              pending={p.pending.has(item.id)}
              flash={p.flash.has(item.id)}
              aiAvailable={p.aiStatus.mode === 'server' || p.aiStatus.mode === 'browser'}
              register={register}
              onChange={(text) => { p.onUpdateItem(item.id, (i) => ({ ...i, text })); p.onTyped(item.id); }}
              onNotes={(notes) => { p.onUpdateItem(item.id, (i) => ({ ...i, notes })); p.onTyped(item.id); }}
              onPriority={(priority) => p.onUpdateItem(item.id, (i) => ({ ...i, priority }))}
              onToggle={() => p.onUpdateItem(item.id, (i) => ({ ...i, done: !i.done }))}
              onKeyDown={(e) => onKey(e, item)}
              onCategory={(c) => p.onUpdateItem(item.id, (i) => ({ ...i, category: c }))}
              onManualMinutes={(m) => p.onUpdateItem(item.id, (i) => ({ ...i, minutes: m, low: m, high: m, confidence: 'high', rationale: 'Set by you', source: 'manual' }))}
              onEstimate={() => p.onEstimate([item.id], true)}
              onBreakdown={() => p.onBreakdown(item.id)}
              onRemove={() => remove(item.id)}
              onScheduleNext={() => p.onScheduleNext(item.id)}
              onOpenDay={p.onOpenDay}
            />
          ))}
          {sortMode === 'original' && !hideDone && (
            <button onClick={append} className="tap mt-1 h-11 pl-1 pr-3 flex items-center gap-2.5 text-[15px] text-tint rounded-[8px] hover:bg-tint-soft">
              <Plus className="w-[18px] h-[18px]" strokeWidth={2} /> Add Item
            </button>
          )}
          {visible.length === 0 && hideDone && (
            <p className="py-10 text-center text-[15px] text-muted">All items are completed.</p>
          )}
        </div>
      </div>

      {/* Scroll edge + floating toolbar: the functional layer, the only place glass is used */}
      <div aria-hidden className="scroll-edge pointer-events-none absolute inset-x-0 top-0" />
      <div className="absolute inset-x-0 top-0 h-[var(--toolbar-h)] safe-pt px-3 md:px-4 flex items-center gap-2 pointer-events-none">
        <div className="md:hidden glass rounded-full pointer-events-auto">
          <ToolButton label="Notes" onClick={p.onBack}><ChevronLeft className="w-5 h-5" /></ToolButton>
        </div>
        <div aria-hidden={!titleHidden} className={`flex-1 min-w-0 text-center md:text-left md:pl-4 text-[15px] font-semibold truncate transition-opacity duration-200 ${titleHidden ? 'opacity-100' : 'opacity-0'}`}>
          {title}
        </div>
        <div className="glass rounded-full flex items-center p-0.5 pointer-events-auto">
          <ToolButton label={p.ledgerOpen ? 'Hide Ledger' : 'Show Ledger'} active={p.ledgerOpen} onClick={p.onToggleLedger}>
            <PanelRight className="w-[18px] h-[18px]" />
          </ToolButton>
          <Menu
            label="More"
            trigger={<Ellipsis className="w-5 h-5" />}
            triggerClassName="tap w-9 h-9 grid place-items-center rounded-full text-ink hover:bg-fill"
            entries={[
              { kind: 'section', label: 'Sort By' },
              ...(['original', 'priority', 'longest', 'shortest'] as SortMode[]).map((m) => ({
                kind: 'radio' as const, label: SORT_LABEL[m], checked: sortMode === m, onSelect: () => p.onSort(m),
              })),
              { kind: 'divider' },
              { kind: 'checkbox', label: 'Hide Completed', checked: hideDone, onSelect: () => p.onHideDone(!hideDone) },
              { kind: 'item', label: 'Copy as Markdown', icon: <Copy className="w-4 h-4" />, onSelect: copyMarkdown },
              { kind: 'divider' },
              { kind: 'item', label: 'Delete Note…', destructive: true, icon: <Trash2 className="w-4 h-4" />, onSelect: () => setConfirmDelete(true) },
            ]}
          />
        </div>
      </div>

      {confirmDelete && (
        <Alert
          title={`Delete “${title}”?`}
          message={t.count ? `Its ${t.count} ${t.count === 1 ? 'item' : 'items'} will be deleted too. This can’t be undone.` : 'This can’t be undone.'}
          confirmLabel="Delete"
          destructive
          onConfirm={() => { setConfirmDelete(false); p.onDelete(); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

/** Step through the notes for one day ("2 of 3"), or add another for that day. */
function DayPager({ notes, currentId, onSelect, onNew }: { notes: Note[]; currentId: string; onSelect: (id: string) => void; onNew: () => void }) {
  const i = notes.findIndex((n) => n.id === currentId);
  const btn = 'tap w-7 h-7 grid place-items-center rounded-full text-tint hover:bg-tint-soft disabled:text-muted disabled:opacity-40 disabled:hover:bg-transparent';
  return (
    <div role="group" aria-label="Notes for this day" className="ml-auto flex items-center gap-0.5">
      {notes.length > 1 && (
        <>
          <button className={btn} disabled={i <= 0} onClick={() => onSelect(notes[i - 1].id)} aria-label="Previous Note for This Day">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[13px] text-muted tabular px-0.5" aria-live="polite">{i + 1} of {notes.length}</span>
          <button className={btn} disabled={i >= notes.length - 1} onClick={() => onSelect(notes[i + 1].id)} aria-label="Next Note for This Day">
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}
      <button onClick={onNew} title="New Note for This Day" aria-label="New Note for This Day" className="tap h-7 pl-1.5 pr-2 rounded-full flex items-center gap-1 text-[13px] text-tint hover:bg-tint-soft">
        <Plus className="w-3.5 h-3.5" strokeWidth={2.25} />{notes.length > 1 ? '' : 'Note'}
      </button>
    </div>
  );
}
