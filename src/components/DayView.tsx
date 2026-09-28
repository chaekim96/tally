import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CalendarX2, Check, Minus, Plus, Wand2 } from 'lucide-react';
import type { Note, Schedule } from '../../lib/types';
import { DRAG_TYPE, activeDrag, beginDrag, endDrag, isTallyDrag, type DragPayload } from '../lib/drag';
import {
  DAY_MIN, SNAP, addDays, blocksFor, clampStart, clock, clockRange, dateKey, dayLabel, durationOf, minutesNow, nextFreeStart, parseKey, snap,
} from '../lib/schedule';
import { fmtMinutes } from '../lib/time';
import { PRIORITY_MARKS } from '../lib/notes';
import { Stepper } from './ui/controls';

const HOUR_PX = 48;
const PX = HOUR_PX / 60;

interface Props {
  note: Note;
  notes: Note[];
  date: string;
  onDate: (d: string) => void;
  capacity: number;
  capacityIsDefault: boolean;
  onCapacity: (date: string, minutes: number | null) => void;
  now: number;
  onSchedule: (noteId: string, itemId: string, s: Schedule | null) => void;
  onResize: (noteId: string, itemId: string, minutes: number) => void;
}

type Selection = { kind: 'tray' | 'block'; noteId: string; itemId: string } | null;

/**
 * A calendar-style day (like Calendar's Day view). Items are placed by drag and
 * drop, by selecting then tapping a time, or from the keyboard; dragging is
 * never the only way (accessibility.md › Offer alternatives to gestures).
 */
export default function DayView({ note, notes, date, onDate, capacity, capacityIsDefault, onCapacity, now, onSchedule, onResize }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{ start: number; dur: number } | null>(null);
  const [trayHot, setTrayHot] = useState(false);
  const [sel, setSel] = useState<Selection>(null);
  const [said, setSaid] = useState('');
  // Live duration while a block's bottom edge is dragged.
  const [resize, setResize] = useState<{ itemId: string; dur: number } | null>(null);
  const resizeRef = useRef<{ noteId: string; itemId: string; y: number; dur: number; start: number } | null>(null);

  const today = dateKey(now);
  const isToday = date === today;
  const nowMin = minutesNow(now);
  const blocks = useMemo(() => blocksFor(notes, date), [notes, date]);
  // Higher priority first; otherwise the note's order (sort is stable).
  const tray = note.items.filter((i) => i.text.trim() && !i.done && !i.schedule).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const scheduled = blocks.reduce((a, b) => a + (b.end - b.start), 0);
  const over = scheduled > capacity;
  const fill = capacity > 0 ? Math.min(1, scheduled / capacity) : 0;

  const find = (noteId: string, itemId: string) => notes.find((n) => n.id === noteId)?.items.find((i) => i.id === itemId);
  const selItem = sel ? find(sel.noteId, sel.itemId) : undefined;
  const selBlock = sel?.kind === 'block' ? blocks.find((b) => b.item.id === sel.itemId) : undefined;

  // Open on "now" for today, the working morning otherwise (like Calendar). The pane
  // can mount hidden (phone layout, collapsed ledger), where scrollTop is ignored,
  // so position it the first time it has a size.
  const positioned = useRef<string | null>(null);
  useEffect(() => { positioned.current = null; setSel(null); }, [date]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const position = () => {
      if (positioned.current === date || el.clientHeight === 0) return;
      el.scrollTop = (isToday ? Math.max(0, nowMin - 90) : 8 * 60) * PX;
      positioned.current = date;
    };
    position();
    const ro = new ResizeObserver(position);
    ro.observe(el);
    return () => ro.disconnect();
  }, [date, isToday, nowMin]);

  // Keep a selected block in view after it moves or is placed.
  useEffect(() => {
    if (sel?.kind !== 'block') return;
    document.querySelector(`[data-block="${sel.itemId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel, selBlock?.start]);

  // Drop the selection if its item disappears (deleted, completed, moved off this day).
  useEffect(() => {
    if (sel && (!selItem || (sel.kind === 'block' && !selBlock) || (sel.kind === 'tray' && selItem.schedule))) setSel(null);
  }, [sel, selItem, selBlock]);

  const place = (noteId: string, itemId: string, start: number, verb = 'Scheduled') => {
    const item = find(noteId, itemId);
    if (!item) return;
    const s = clampStart(start, durationOf(item));
    onSchedule(noteId, itemId, { date, start: s });
    setSel({ kind: 'block', noteId, itemId });
    setSaid(`${verb} “${item.text.trim()}” at ${clock(s)}.`);
  };
  const unschedule = (noteId: string, itemId: string) => {
    const item = find(noteId, itemId);
    onSchedule(noteId, itemId, null);
    setSel(null);
    if (item) setSaid(`Removed “${item.text.trim()}” from the day.`);
  };
  const nudge = (delta: number) => { if (selBlock) place(selBlock.noteId, selBlock.item.id, selBlock.start + delta, 'Moved'); };
  /** Change how long a block takes (and so the item's estimate). */
  const resizeTo = (noteId: string, itemId: string, start: number, minutes: number) => {
    const m = Math.min(DAY_MIN - start, Math.max(SNAP, minutes));
    const item = find(noteId, itemId);
    onResize(noteId, itemId, m);
    setSel({ kind: 'block', noteId, itemId });
    if (item) setSaid(`“${item.text.trim()}” now takes ${fmtMinutes(m)}.`);
  };
  const resizeBy = (delta: number) => { if (selBlock) resizeTo(selBlock.noteId, selBlock.item.id, selBlock.start, selBlock.end - selBlock.start + delta); };
  const dragDur = (clientY: number) => {
    const r = resizeRef.current!;
    return Math.min(DAY_MIN - r.start, Math.max(SNAP, snap(r.dur + (clientY - r.y) / PX)));
  };
  const placeNextFree = () => {
    if (!sel || !selItem) return;
    const others = blocks.filter((b) => b.item.id !== sel.itemId);
    place(sel.noteId, sel.itemId, nextFreeStart(others, durationOf(selItem), date, now));
  };

  const minutesAt = (clientY: number) => (clientY - (gridRef.current?.getBoundingClientRect().top ?? 0)) / PX;
  const readDrop = (e: React.DragEvent): DragPayload | null => {
    try { return JSON.parse(e.dataTransfer.getData(DRAG_TYPE)); } catch { return activeDrag(); }
  };

  const onGridDragOver = (e: React.DragEvent) => {
    if (!isTallyDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const d = activeDrag();
    const dur = d?.minutes ?? 30;
    const start = clampStart(snap(minutesAt(e.clientY) - (d?.grab ?? 0)), dur);
    setPreview((p) => (p && p.start === start && p.dur === dur ? p : { start, dur }));
  };
  const onGridDrop = (e: React.DragEvent) => {
    if (!isTallyDrag(e)) return;
    e.preventDefault();
    const d = readDrop(e);
    setPreview(null);
    endDrag();
    if (d) place(d.noteId, d.itemId, snap(minutesAt(e.clientY) - d.grab));
  };
  // Tap-to-place: with an item or block selected, a tap on the grid puts it there.
  const onGridClick = (e: React.MouseEvent) => {
    if (!sel) return;
    place(sel.noteId, sel.itemId, Math.floor(minutesAt(e.clientY) / SNAP) * SNAP, sel.kind === 'block' ? 'Moved' : 'Scheduled');
  };

  const hours = Array.from({ length: 24 }, (_, h) => h);
  const hourLabel = (h: number) => (h === 12 ? 'Noon' : new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' }));

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Date navigation */}
      <div className="flex items-center gap-1 px-2.5 pt-1">
        <button onClick={() => onDate(addDays(date, -1))} aria-label="Previous Day" className="tap w-9 h-9 grid place-items-center rounded-full text-tint hover:bg-tint-soft">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 text-center min-w-0">
          <div className="text-[15px] font-semibold truncate">{dayLabel(date, today)}</div>
          <div className="text-[12px] text-muted truncate">{parseKey(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
        <button onClick={() => onDate(addDays(date, 1))} aria-label="Next Day" className="tap w-9 h-9 grid place-items-center rounded-full text-tint hover:bg-tint-soft">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      {!isToday && (
        <div className="text-center -mt-0.5"><button onClick={() => onDate(today)} className="text-[13px] text-tint font-medium hover:underline">Go to Today</button></div>
      )}

      {/* Capacity for this day: step through days, adjust each one */}
      <section aria-label="Capacity" className="mx-4 mt-2 mb-3 card px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[15px]">Capacity</div>
            {capacityIsDefault
              ? <div className="text-[12px] text-muted">Default</div>
              : <button onClick={() => onCapacity(date, null)} className="text-[12px] text-tint hover:underline">Use Default</button>}
          </div>
          <Stepper
            label={`Capacity for ${dayLabel(date, today)}`}
            value={capacity}
            onChange={(v) => onCapacity(date, v)}
            min={30} max={16 * 60} step={30} bigStep={120}
            format={(v) => fmtMinutes(v)}
          />
        </div>
        <div
          role="meter"
          aria-label="Scheduled against capacity"
          aria-valuemin={0}
          aria-valuemax={capacity}
          aria-valuenow={Math.min(scheduled, capacity)}
          aria-valuetext={over ? `Over by ${fmtMinutes(scheduled - capacity)}` : `${fmtMinutes(scheduled)} of ${fmtMinutes(capacity)} scheduled`}
          className="h-1.5 mt-3 rounded-full bg-fill overflow-hidden"
        >
          <div className={`h-full rounded-full transition-[width] duration-300 ${over ? 'bg-danger' : fill > 0.8 ? 'bg-warn' : 'bg-tint'}`} style={{ width: `${fill * 100}%` }} />
        </div>
        <div className="flex justify-between mt-1.5 text-[12px] tabular">
          <span className="text-muted">{fmtMinutes(scheduled)} scheduled</span>
          <span className={over ? 'text-danger font-medium' : 'text-muted'}>{over ? `Over by ${fmtMinutes(scheduled - capacity)}` : `${fmtMinutes(capacity - scheduled)} free`}</span>
        </div>
      </section>

      {/* Unscheduled tray: drag source, and drop target to unschedule */}
      <section
        aria-label="Unscheduled items"
        onDragOver={(e) => { if (isTallyDrag(e)) { e.preventDefault(); setTrayHot(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setTrayHot(false); }}
        onDrop={(e) => {
          if (!isTallyDrag(e)) return;
          e.preventDefault(); setTrayHot(false); endDrag();
          const d = readDrop(e);
          if (d) unschedule(d.noteId, d.itemId);
        }}
        className={`mx-4 card transition-shadow ${trayHot ? 'ring-2 ring-tint' : ''}`}
      >
        <div className="flex items-baseline justify-between px-4 pt-2.5 pb-1">
          <h3 className="text-[13px] font-semibold text-muted">Unscheduled</h3>
          <span className="text-[12px] text-muted tabular">{tray.length}</span>
        </div>
        {tray.length === 0 ? (
          <p className="px-4 pb-3 text-[13px] text-muted">{trayHot ? 'Drop here to take it off the day.' : 'Everything open in this note has a time.'}</p>
        ) : (
          <ul className="max-h-[min(30vh,200px)] overflow-y-auto pb-1.5">
            {tray.map((i) => {
              const picked = sel?.kind === 'tray' && sel.itemId === i.id;
              return (
                <li key={i.id}>
                  <button
                    draggable
                    onDragStart={(e) => { setSel(null); beginDrag(e, { noteId: note.id, itemId: i.id, minutes: durationOf(i), grab: 0 }); }}
                    onDragEnd={() => { endDrag(); setPreview(null); }}
                    onClick={() => setSel(picked ? null : { kind: 'tray', noteId: note.id, itemId: i.id })}
                    aria-pressed={picked}
                    aria-label={`${i.text.trim()}, ${fmtMinutes(durationOf(i))}. ${picked ? 'Selected. Tap a time to place it.' : 'Select to place, or drag onto the day.'}`}
                    className={`w-full flex items-center gap-2.5 min-h-9 px-4 py-1.5 text-left text-[14px] cursor-grab active:cursor-grabbing ${picked ? 'bg-tint-soft' : 'hover:bg-fill'}`}
                  >
                    <span className={`cat-${i.category} cat-fill w-2 h-2 rounded-full shrink-0`} aria-hidden />
                    <span className="flex-1 truncate">
                      {!!i.priority && <span className="text-tint font-bold mr-1" aria-label={`priority ${i.priority}`}>{PRIORITY_MARKS[i.priority]}</span>}{i.text}
                    </span>
                    <span className="tabular text-[13px] text-muted shrink-0">{i.minutes && i.minutes > 0 ? fmtMinutes(i.minutes, { compact: true }) : '30m?'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* The day */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto mt-3 pb-4">
        <div className="relative mx-4 select-none" style={{ height: DAY_MIN * PX }}>
          {hours.map((h) => (
            <div key={h} className="absolute left-0 right-0 flex items-start" style={{ top: h * HOUR_PX }}>
              <span className={`w-11 -mt-[7px] pr-2 text-right text-[11px] tabular text-muted ${isToday && Math.abs(nowMin - h * 60) < 12 ? 'invisible' : ''}`}>
                {h === 0 ? '' : hourLabel(h)}
              </span>
              <span className="flex-1 border-t-[0.5px] border-separator" />
            </div>
          ))}

          <div
            ref={gridRef}
            data-day-grid
            role="group"
            aria-label={`${dayLabel(date, today)}. ${sel ? 'Tap a time to place the selected item.' : ''}`}
            onDragOver={onGridDragOver}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setPreview(null); }}
            onDrop={onGridDrop}
            onClick={onGridClick}
            className={`absolute top-0 bottom-0 left-12 right-0 ${sel ? 'cursor-copy' : ''}`}
          >
            {blocks.map((b) => {
              const dur = resize?.itemId === b.item.id ? resize.dur : b.end - b.start;
              const h = Math.max(22, dur * PX - 2);
              const other = b.noteId !== note.id;
              const selected = sel?.kind === 'block' && sel.itemId === b.item.id;
              return (
                <button
                  key={b.item.id}
                  data-block={b.item.id}
                  draggable
                  onDragStart={(e) => {
                    if (resizeRef.current) { e.preventDefault(); return; } // resizing, not moving
                    const grab = Math.max(0, (e.clientY - e.currentTarget.getBoundingClientRect().top) / PX);
                    setSel(null);
                    beginDrag(e, { noteId: b.noteId, itemId: b.item.id, minutes: dur, grab });
                  }}
                  onDragEnd={() => { endDrag(); setPreview(null); }}
                  onClick={(e) => { e.stopPropagation(); setSel(selected ? null : { kind: 'block', noteId: b.noteId, itemId: b.item.id }); }}
                  onKeyDown={(e) => {
                    const step = e.shiftKey ? 60 : SNAP;
                    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                      e.preventDefault();
                      resizeTo(b.noteId, b.item.id, b.start, dur + (e.key === 'ArrowDown' ? SNAP : -SNAP));
                    }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel({ kind: 'block', noteId: b.noteId, itemId: b.item.id }); place(b.noteId, b.item.id, b.start - step, 'Moved'); }
                    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel({ kind: 'block', noteId: b.noteId, itemId: b.item.id }); place(b.noteId, b.item.id, b.start + step, 'Moved'); }
                    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); unschedule(b.noteId, b.item.id); }
                    else if (e.key === 'Escape') setSel(null);
                  }}
                  aria-pressed={selected}
                  aria-label={`${b.item.text.trim()}${other ? `, from ${b.noteTitle}` : ''}, ${clockRange(b.start, b.start + dur)}${b.item.done ? ', completed' : ''}. Arrow keys move it, Option-arrow changes its length, Delete removes it.`}
                  className={`group/block day-block cat-${b.item.category} absolute rounded-[7px] text-left overflow-hidden px-2 py-[3px] cursor-grab active:cursor-grabbing ${other ? 'other' : ''} ${selected ? 'ring-2 ring-tint z-10' : ''}`}
                  style={{ top: b.start * PX + 1, height: h, left: `calc(${(b.col / b.cols) * 100}% + 2px)`, width: `calc(${100 / b.cols}% - 4px)` }}
                >
                  <div className={`text-[12px] font-semibold leading-[16px] truncate ${b.item.done ? 'line-through text-muted' : ''}`}>
                    {b.item.done && <Check className="inline w-3 h-3 mr-0.5 -mt-px" aria-hidden />}
                    {!!b.item.priority && <span className="text-tint font-bold mr-0.5">{PRIORITY_MARKS[b.item.priority]}</span>}
                    {b.item.text}
                  </div>
                  {h >= 38 && <div className="text-[11px] leading-[15px] text-ink-2 truncate tabular">{clockRange(b.start, b.start + dur)}{resize?.itemId === b.item.id ? ` · ${fmtMinutes(dur)}` : ''}</div>}
                  {h >= 54 && other && <div className="text-[11px] leading-[15px] text-muted truncate">{b.noteTitle}</div>}
                  {/* Bottom edge: drag to change the length, like a Calendar event */}
                  <span
                    aria-hidden
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => {
                      e.stopPropagation(); e.preventDefault();
                      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
                      resizeRef.current = { noteId: b.noteId, itemId: b.item.id, y: e.clientY, dur: b.end - b.start, start: b.start };
                      setResize({ itemId: b.item.id, dur: b.end - b.start });
                    }}
                    onPointerMove={(e) => {
                      if (!resizeRef.current) return;
                      const d = dragDur(e.clientY);
                      setResize((cur) => (cur && cur.dur === d ? cur : { itemId: resizeRef.current!.itemId, dur: d }));
                    }}
                    onPointerUp={(e) => {
                      const r = resizeRef.current;
                      if (!r) return;
                      const d = dragDur(e.clientY);
                      resizeRef.current = null;
                      setResize(null);
                      if (d !== r.dur) resizeTo(r.noteId, r.itemId, r.start, d);
                    }}
                    onPointerCancel={() => { resizeRef.current = null; setResize(null); }}
                    className="absolute left-0 right-0 bottom-0 h-2.5 cursor-ns-resize touch-none"
                  >
                    <span className={`absolute left-1/2 -translate-x-1/2 bottom-[3px] w-7 h-[3px] rounded-full bg-[var(--c)] ${selected || resize?.itemId === b.item.id ? 'opacity-90' : 'opacity-0 group-hover/block:opacity-70'}`} />
                  </span>
                </button>
              );
            })}

            {preview && (
              <div aria-hidden className="absolute left-0.5 right-0.5 rounded-[7px] border-[1.5px] border-dashed border-tint bg-tint-soft pointer-events-none px-2 py-[3px] text-[11px] font-medium text-tint tabular z-20"
                style={{ top: preview.start * PX + 1, height: Math.max(22, preview.dur * PX - 2) }}>
                {clock(preview.start)}
              </div>
            )}

            {isToday && (
              <div aria-hidden className="absolute left-0 right-0 pointer-events-none z-30" style={{ top: nowMin * PX }}>
                <div className="relative border-t-[1.5px] border-danger">
                  <span className="absolute -left-[5px] -top-[5.5px] w-2.5 h-2.5 rounded-full bg-danger" />
                </div>
              </div>
            )}
          </div>
          {isToday && (
            <span aria-hidden className="absolute left-0 w-11 pr-2 text-right text-[11px] font-semibold tabular text-danger -mt-[7px] pointer-events-none" style={{ top: nowMin * PX }}>
              {clock(nowMin).replace(/\s?[AP]M$/i, '')}
            </span>
          )}
        </div>
      </div>

      {/* Actions for the selection: the non-drag way to do everything */}
      {sel && selItem && (
        <div className="border-t-[0.5px] border-separator px-3 py-2 flex items-center gap-1.5 safe-pb bg-grouped">
          <div className="flex-1 min-w-0 px-1">
            <div className="text-[13px] font-semibold truncate">{selItem.text}</div>
            <div className="text-[12px] text-muted truncate tabular">
              {sel.kind === 'block' && selBlock ? `${clockRange(selBlock.start, selBlock.end)} · ${fmtMinutes(selBlock.end - selBlock.start)}` : 'Tap a time to place it.'}
            </div>
          </div>
          {sel.kind === 'tray' ? (
            <>
              <BarButton label="Next Free Time" onClick={placeNextFree}><Wand2 className="w-4 h-4" /></BarButton>
              <button onClick={() => setSel(null)} className="tap h-8 px-3 rounded-full text-[14px] text-tint hover:bg-tint-soft">Cancel</button>
            </>
          ) : (
            <>
              <BarButton label="Earlier" onClick={() => nudge(-SNAP)}><ChevronUp className="w-4 h-4" /></BarButton>
              <BarButton label="Later" onClick={() => nudge(SNAP)}><ChevronDown className="w-4 h-4" /></BarButton>
              <span aria-hidden className="w-px h-5 bg-separator mx-0.5" />
              <BarButton label="Shorter" onClick={() => resizeBy(-SNAP)}><Minus className="w-4 h-4" /></BarButton>
              <BarButton label="Longer" onClick={() => resizeBy(SNAP)}><Plus className="w-4 h-4" /></BarButton>
              <span aria-hidden className="w-px h-5 bg-separator mx-0.5" />
              <BarButton label="Remove from Day" destructive onClick={() => selBlock && unschedule(selBlock.noteId, selBlock.item.id)}><CalendarX2 className="w-4 h-4" /></BarButton>
            </>
          )}
        </div>
      )}
      <div aria-live="polite" className="sr-only">{said}</div>
    </div>
  );
}

function BarButton({ label, onClick, destructive, children }: { label: string; onClick: () => void; destructive?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className={`tap h-8 min-w-8 px-2 grid place-items-center rounded-full bg-fill hover:bg-fill-2 ${destructive ? 'text-danger' : 'text-tint'}`}>
      {children}
    </button>
  );
}
