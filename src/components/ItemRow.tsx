import { useEffect, useRef, useState } from 'react';
import { Check, ListTree, LoaderCircle, Sparkles, X } from 'lucide-react';
import type { Category, Item } from '../../lib/types';
import { CATEGORIES } from '../../lib/types';
import { fmtMinutes, parseDuration } from '../lib/time';

interface Props {
  item: Item;
  pending: boolean;
  aiAvailable: boolean;
  register: (id: string, el: HTMLInputElement | null) => void;
  onChange: (text: string) => void;
  onToggle: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onCategory: (c: Category) => void;
  onManualMinutes: (m: number) => void;
  onEstimate: () => void;
  onBreakdown: () => void;
  onRemove: () => void;
}

const INDENT = 28;

export default function ItemRow({ item, pending, aiAvailable, register, onChange, onToggle, onKeyDown, onCategory, onManualMinutes, onEstimate, onBreakdown, onRemove }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) editRef.current?.select(); }, [editing]);

  const startEdit = () => { setDraft(item.minutes != null ? fmtMinutes(item.minutes) : ''); setEditing(true); };
  const commit = () => {
    const m = parseDuration(draft);
    if (m != null) onManualMinutes(m);
    setEditing(false);
  };
  const cycleCategory = () => onCategory(CATEGORIES[(CATEGORIES.indexOf(item.category) + 1) % CATEGORIES.length]);

  const hasText = item.text.trim().length > 0;
  const est = item.minutes;
  const range = item.low != null && item.high != null && item.high !== item.low ? `${fmtMinutes(item.low)} to ${fmtMinutes(item.high)}` : null;
  const detail = [item.rationale, range && `Range: ${range}`, item.confidence && `Confidence: ${item.confidence}`, item.source && `Source: ${item.source}`]
    .filter(Boolean).join('\n');
  const spoken = est == null ? 'Not estimated' : est === 0 ? 'Not a task' : `${fmtMinutes(est)}${range ? `, ${range}` : ''}`;

  return (
    <div className="row group relative flex items-center gap-1 min-h-[44px]" style={{ paddingLeft: item.indent ? INDENT : 0 }}>
      {/* Inset separator starts at the text, like Reminders (lists-and-tables.md) */}
      <span aria-hidden className="absolute bottom-0 right-0 border-b-[0.5px] border-separator" style={{ left: (item.indent ? INDENT : 0) + 36 }} />

      <button
        role="checkbox"
        aria-checked={item.done}
        aria-label={item.text.trim() ? `Complete “${item.text.trim()}”` : 'Complete item'}
        onClick={onToggle}
        className="tap shrink-0 w-8 h-8 grid place-items-center rounded-full"
      >
        <span className={`w-[21px] h-[21px] rounded-full grid place-items-center transition-colors ${item.done ? 'bg-tint text-on-tint' : 'border-[1.5px] border-control group-hover:border-ink-2'}`}>
          {item.done && <Check className="w-3 h-3" strokeWidth={3.25} />}
        </span>
      </button>

      <input
        ref={(el) => register(item.id, el)}
        value={item.text}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={item.indent ? 'Subtask' : 'New item'}
        aria-label={item.indent ? 'Subtask' : 'Item'}
        spellCheck={false}
        className={`bare row-text flex-1 min-w-0 text-ellipsis bg-transparent outline-none py-2.5 ml-1.5 ${item.done ? 'text-muted' : item.indent ? 'text-ink-2' : 'text-ink'}`}
      />

      {/* Hover actions float over the end of the text so they never take width from it */}
      {hasText && (
        <div className="absolute right-[140px] md:right-[176px] top-1/2 -translate-y-1/2 hidden md:flex items-center pl-3 bg-surface shadow-[-16px_0_12px_-4px_var(--surface)] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-opacity">
          {aiAvailable && item.indent === 0 && (
            <RowAction label="Break Down into Subtasks (⌘B)" onClick={onBreakdown}><ListTree className="w-4 h-4" /></RowAction>
          )}
          <RowAction label="Estimate Again (⌘E)" onClick={onEstimate}><Sparkles className="w-4 h-4" /></RowAction>
          <RowAction label="Delete Item" onClick={onRemove}><X className="w-4 h-4" /></RowAction>
        </div>
      )}

      <div className="w-[76px] md:w-[92px] flex justify-end shrink-0">
        {hasText && (
          <button
            onClick={cycleCategory}
            aria-label={`Category: ${item.category}. Change category`}
            title="Change category"
            className={`chip cat-${item.category} text-[12px] font-medium px-2 h-[22px] rounded-full whitespace-nowrap ${pending ? 'estimating' : ''}`}
          >
            {item.category}
          </button>
        )}
      </div>

      <div className="w-[64px] md:w-[84px] shrink-0 flex justify-end items-center self-stretch pl-2">
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
        ) : pending ? (
          <LoaderCircle className="w-4 h-4 text-muted animate-spin motion-reduce:animate-none" aria-label="Estimating" />
        ) : hasText ? (
          <button
            onClick={startEdit}
            title={detail || 'Set time manually'}
            aria-label={`Estimate: ${spoken}. Edit estimate`}
            className={`tabular text-[14px] px-1.5 h-7 rounded-[7px] hover:bg-fill transition-colors ${est == null || est === 0 || item.source === 'heuristic' || item.done ? 'text-muted' : 'text-ink'} ${item.source === 'manual' ? 'underline decoration-dotted underline-offset-4' : ''}`}
          >
            {est == null ? '–' : est === 0 ? '—' : `${item.source === 'heuristic' ? '~' : ''}${fmtMinutes(est, { compact: true })}`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function RowAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className="w-7 h-7 grid place-items-center rounded-full text-muted hover:text-tint hover:bg-tint-soft">
      {children}
    </button>
  );
}
