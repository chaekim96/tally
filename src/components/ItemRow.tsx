import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CalendarClock, CalendarPlus, Check, ListTree, LoaderCircle, RefreshCw, X } from 'lucide-react';
import type { Category, Item, Priority } from '../../lib/types';
import { CATEGORIES } from '../../lib/types';
import { beginDrag, endDrag } from '../lib/drag';
import { PRIORITY_MARKS, PRIORITY_NAMES } from '../lib/notes';
import { durationOf, scheduleLabel } from '../lib/schedule';
import { fmtMinutes, parseDuration } from '../lib/time';

interface Props {
  noteId: string;
  item: Item;
  pending: boolean;
  flash: boolean;
  aiAvailable: boolean;
  register: (id: string, el: HTMLInputElement | null) => void;
  onChange: (text: string) => void;
  onNotes: (notes: string) => void;
  onPriority: (p: Priority) => void;
  onToggle: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onCategory: (c: Category) => void;
  onManualMinutes: (m: number) => void;
  onEstimate: () => void;
  onBreakdown: () => void;
  onRemove: () => void;
  onScheduleNext: () => void;
  onOpenDay: (date: string) => void;
}

const INDENT = 28;

export default function ItemRow(p: Props) {
  const { item } = p;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [active, setActive] = useState(false);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) editRef.current?.select(); }, [editing]);

  const hasNotes = !!item.notes?.trim();
  const showNotes = active || hasNotes;
  // Notes grow with their content.
  useLayoutEffect(() => {
    const el = notesRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [item.notes, showNotes]);

  const startEdit = () => { setDraft(item.minutes != null ? fmtMinutes(item.minutes) : ''); setEditing(true); };
  const commit = () => {
    const m = parseDuration(draft);
    if (m != null) p.onManualMinutes(m);
    setEditing(false);
  };
  const priority = item.priority ?? 0;
  const cyclePriority = () => p.onPriority(((priority + 1) % 4) as Priority);
  const cycleCategory = () => p.onCategory(CATEGORIES[(CATEGORIES.indexOf(item.category) + 1) % CATEGORIES.length]);

  const hasText = item.text.trim().length > 0;
  const label = item.text.trim() || 'item';
  const est = item.minutes;
  const range = item.low != null && item.high != null && item.high !== item.low ? `${fmtMinutes(item.low)} to ${fmtMinutes(item.high)}` : null;
  const detail = [item.rationale, range && `Range: ${range}`, item.confidence && `Confidence: ${item.confidence}`, item.source && `Source: ${item.source}`]
    .filter(Boolean).join('\n');
  const spoken = est == null ? 'Not estimated' : est === 0 ? 'Not a task' : `${fmtMinutes(est)}${range ? `, ${range}` : ''}`;
  const when = item.schedule ? scheduleLabel(item.schedule, durationOf(item)) : null;

  return (
    <div
      className="row group relative flex items-start gap-1"
      style={{ paddingLeft: item.indent ? INDENT : 0 }}
      onFocus={() => setActive(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setActive(false); }}
    >
      {/* Inset separator starts at the text, like Reminders (lists-and-tables.md) */}
      <span aria-hidden className="absolute bottom-0 right-0 border-b-[0.5px] border-separator" style={{ left: (item.indent ? INDENT : 0) + 36 }} />

      <div className="h-[var(--line-h)] grid place-items-center shrink-0">
        <button
          role="checkbox"
          aria-checked={item.done}
          aria-label={`Complete “${label}”`}
          onClick={p.onToggle}
          className="tap w-8 h-8 grid place-items-center rounded-full"
        >
          <span className={`w-[21px] h-[21px] rounded-full grid place-items-center transition-colors ${item.done ? 'bg-tint text-on-tint' : 'border-[1.5px] border-control group-hover:border-ink-2'}`}>
            {item.done && <Check className="w-3 h-3" strokeWidth={3.25} />}
          </span>
        </button>
      </div>

      <div className="flex-1 min-w-0 ml-1.5">
        <div className="flex items-center">
        {/* Reminders-style priority marks: shape, not just color, carries the level (color.md) */}
        {priority > 0 && (
          <button
            onClick={cyclePriority}
            aria-label={`Priority: ${PRIORITY_NAMES[priority]}. Change priority`}
            title={`${PRIORITY_NAMES[priority]} priority`}
            className={`row-text shrink-0 h-[var(--line-h)] pr-1.5 font-bold tracking-[-0.04em] ${item.done ? 'text-muted' : 'text-tint'}`}
          >
            {PRIORITY_MARKS[priority]}
          </button>
        )}
        <input
          ref={(el) => { titleRef.current = el; p.register(item.id, el); }}
          value={item.text}
          onChange={(e) => p.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.shiftKey) {
              e.preventDefault();
              requestAnimationFrame(() => notesRef.current?.focus());
              return;
            }
            p.onKeyDown(e);
          }}
          placeholder={item.indent ? 'Subtask' : 'New item'}
          aria-label={item.indent ? 'Subtask' : 'Item'}
          spellCheck={false}
          className={`bare row-text block w-full min-w-0 h-[var(--line-h)] text-ellipsis bg-transparent outline-none ${priority === 3 && !item.done ? 'font-semibold' : ''} ${item.done ? 'text-muted' : item.indent ? 'text-ink-2' : 'text-ink'}`}
        />
        </div>
        {showNotes && (
          <textarea
            ref={notesRef}
            rows={1}
            value={item.notes ?? ''}
            onChange={(e) => p.onNotes(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); titleRef.current?.focus(); } }}
            placeholder="Add Note"
            aria-label={`Notes for “${label}”`}
            className="bare block w-full resize-none overflow-hidden bg-transparent outline-none text-[13px] leading-[18px] text-muted -mt-2.5 pb-2.5"
          />
        )}
        {when && item.schedule && (
          <button
            onClick={() => p.onOpenDay(item.schedule!.date)}
            aria-label={`Scheduled ${when}. Show in Day view`}
            className={`flex items-center gap-1 text-[12px] text-muted hover:text-tint pb-2.5 ${showNotes ? '' : '-mt-2'}`}
          >
            <CalendarClock className="w-3.5 h-3.5" aria-hidden />{when}
          </button>
        )}
      </div>

      {/* Hover actions float over the end of the title so they never take width from it */}
      {hasText && (
        <div className="absolute right-[140px] md:right-[176px] top-[calc(var(--line-h)/2)] -translate-y-1/2 hidden md:flex items-center pl-3 bg-surface shadow-[-16px_0_12px_-4px_var(--surface)] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-opacity">
          {!item.done && (
            <RowAction
              label="Schedule Today (or drag onto the Day view)"
              onClick={p.onScheduleNext}
              draggable
              onDragStart={(e) => beginDrag(e, { noteId: p.noteId, itemId: item.id, minutes: durationOf(item), grab: 0 })}
              onDragEnd={endDrag}
            >
              <CalendarPlus className="w-4 h-4" />
            </RowAction>
          )}
          <RowAction label={`Priority: ${PRIORITY_NAMES[priority]} (click to change)`} onClick={cyclePriority}>
            <span className="text-[15px] font-bold leading-none">!</span>
          </RowAction>
          {p.aiAvailable && item.indent === 0 && (
            <RowAction label="Break Down into Subtasks (⌘B)" onClick={p.onBreakdown}><ListTree className="w-4 h-4" /></RowAction>
          )}
          <RowAction label={p.aiAvailable ? 'Estimate Again (⌘E)' : 'Estimate Again (⌘E): keyword guess until Claude is connected'} onClick={p.onEstimate}>
            <RefreshCw className="w-4 h-4" />
          </RowAction>
          <RowAction label="Delete Item" onClick={p.onRemove}><X className="w-4 h-4" /></RowAction>
        </div>
      )}

      <div className="h-[var(--line-h)] w-[76px] md:w-[92px] flex items-center justify-end shrink-0">
        {hasText && (
          <button
            onClick={cycleCategory}
            aria-label={`Category: ${item.category}. Change category`}
            title="Change category"
            className={`chip cat-${item.category} text-[12px] font-medium px-2 h-[22px] rounded-full whitespace-nowrap ${p.pending ? 'estimating' : ''}`}
          >
            {item.category}
          </button>
        )}
      </div>

      <div className="h-[var(--line-h)] w-[64px] md:w-[84px] shrink-0 flex justify-end items-center pl-2">
        {editing ? (
          <input
            ref={editRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            placeholder="45m"
            aria-label="Time estimate"
            className="w-full h-7 bg-fill rounded-[7px] px-2 text-right tabular text-[14px]"
          />
        ) : p.pending ? (
          <LoaderCircle className="w-4 h-4 text-muted animate-spin motion-reduce:animate-none" aria-label="Estimating" />
        ) : hasText ? (
          <button
            onClick={startEdit}
            title={detail || 'Set time manually'}
            aria-label={`Estimate: ${spoken}. Edit estimate`}
            className={`tabular text-[14px] px-1.5 h-7 rounded-[7px] hover:bg-fill transition-colors ${p.flash ? 'flash' : ''} ${est == null || est === 0 || item.source === 'heuristic' || item.done ? 'text-muted' : 'text-ink'} ${item.source === 'manual' ? 'underline decoration-dotted underline-offset-4' : ''}`}
          >
            {est == null ? '–' : est === 0 ? '—' : `${item.source === 'heuristic' ? '~' : ''}${fmtMinutes(est, { compact: true })}`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function RowAction({ label, onClick, children, ...drag }: { label: string; onClick: () => void; children: React.ReactNode } & Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, 'draggable' | 'onDragStart' | 'onDragEnd'>) {
  return (
    <button aria-label={label} title={label} onClick={onClick} {...drag} className="w-7 h-7 grid place-items-center rounded-full text-muted hover:text-tint hover:bg-tint-soft">
      {children}
    </button>
  );
}
