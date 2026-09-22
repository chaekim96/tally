import { useEffect, useRef, useState } from 'react';
import { Check, ListTree, Sparkles, X } from 'lucide-react';
import type { Category, Item } from '../../lib/types';
import { CATEGORIES } from '../../lib/types';
import { CATEGORY_STYLE } from '../lib/notes';
import { fmtMinutes, parseDuration } from '../lib/time';

interface Props {
  item: Item;
  pending: boolean;
  aiAvailable: boolean;
  draggable: boolean;
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

  const cycleCategory = () => {
    const i = CATEGORIES.indexOf(item.category);
    onCategory(CATEGORIES[(i + 1) % CATEGORIES.length]);
  };

  const hasText = item.text.trim().length > 0;
  const est = item.minutes;
  const estTone =
    est == null || est === 0 ? 'text-muted'
    : est >= 120 ? 'text-danger'
    : est >= 45 ? 'text-warn'
    : 'text-ok';
  const range = item.low != null && item.high != null && item.high !== item.low ? `${fmtMinutes(item.low)} – ${fmtMinutes(item.high)}` : null;
  const tooltip = [
    item.rationale,
    range ? `Range: ${range}` : null,
    item.confidence ? `Confidence: ${item.confidence}` : null,
    item.source ? `Source: ${item.source}` : null,
  ].filter(Boolean).join('\n');

  return (
    <div className={`group flex items-center min-h-[42px] border-b border-line/70 row-in ${item.done ? 'opacity-55' : ''}`}>
      {/* Checkbox */}
      <button
        onClick={onToggle}
        aria-label={item.done ? 'Mark not done' : 'Mark done'}
        className={`shrink-0 w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center transition ${item.done ? 'bg-ink border-ink text-canvas' : 'border-line-strong hover:border-ink'}`}
        style={{ marginLeft: item.indent ? 26 : 2 }}
      >
        {item.done && <Check className="w-3 h-3" strokeWidth={3} />}
      </button>

      {/* Text */}
      <input
        ref={(el) => register(item.id, el)}
        value={item.text}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={item.indent ? 'Sub-task' : 'What needs doing?'}
        spellCheck={false}
        className={`flex-1 min-w-0 bg-transparent outline-none py-2 ml-3 text-[15px] placeholder:text-line-strong ${item.done ? 'line-through' : ''} ${item.indent ? 'text-ink-2' : ''}`}
      />

      {/* Row actions (hover) */}
      {hasText && (
        <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition mr-1">
          {aiAvailable && item.indent === 0 && (
            <button title="Break down into sub-tasks (⌘B)" onClick={onBreakdown} className="p-1.5 rounded-md text-muted hover:text-accent hover:bg-accent-soft"><ListTree className="w-3.5 h-3.5" /></button>
          )}
          <button title="Re-estimate (⌘E)" onClick={onEstimate} className="p-1.5 rounded-md text-muted hover:text-accent hover:bg-accent-soft"><Sparkles className="w-3.5 h-3.5" /></button>
          <button title="Remove line" onClick={onRemove} className="p-1.5 rounded-md text-muted hover:text-danger hover:bg-danger-soft"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Category */}
      <div className="w-[64px] md:w-[88px] flex justify-end shrink-0">
        {hasText && (
          <button
            onClick={cycleCategory}
            title="Click to change category"
            className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-[3px] rounded-md transition ${CATEGORY_STYLE[item.category]} ${pending ? 'estimating' : ''}`}
          >
            {item.category}
          </button>
        )}
      </div>

      {/* Estimate gutter — the "ledger" column */}
      <div className="w-[76px] md:w-[92px] shrink-0 flex justify-end border-l border-line ml-3 pl-3 self-stretch items-center">
        {editing ? (
          <input
            ref={editRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            placeholder="45m"
            className="w-full bg-surface-2 rounded-md px-1.5 py-1 text-right font-mono tnum text-[13px] outline-none ring-2 ring-accent/50"
          />
        ) : pending ? (
          <Sparkles className="w-3.5 h-3.5 text-accent estimating" />
        ) : hasText ? (
          <button
            onClick={startEdit}
            title={tooltip || 'Click to set manually'}
            className={`font-mono tnum text-[13px] tabular-nums px-1 rounded hover:bg-surface-2 transition ${estTone} ${item.source === 'manual' ? 'underline decoration-dotted underline-offset-4' : ''}`}
          >
            {est == null ? <span className="text-line-strong">·</span> : est === 0 ? <span className="text-muted">—</span> : `${item.source === 'heuristic' ? '~' : ''}${fmtMinutes(est, { compact: true })}`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
