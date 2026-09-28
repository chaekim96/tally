import { useEffect, useState } from 'react';
import { ChevronLeft, LoaderCircle, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import type { Item, Note, Schedule, Settings } from '../../lib/types';
import type { LedgerTab } from '../App';
import DayView from './DayView';
import type { AiStatus } from '../lib/ai';
import { totals } from '../lib/notes';
import { finishBy, fmtMinutes } from '../lib/time';
import { ToolButton } from './ui/controls';

interface Props {
  note: Note | null;
  notes: Note[];
  tab: LedgerTab;
  onTab: (t: LedgerTab) => void;
  dayDate: string;
  onDayDate: (d: string) => void;
  onSchedule: (noteId: string, itemId: string, s: Schedule | null) => void;
  settings: Settings;
  aiStatus: AiStatus;
  pendingCount: number;
  onEstimateAll: () => void;
  onReestimateAll: () => void;
  onBack: () => void;
  onOpenSettings: () => void;
}

export default function Ledger(props: Props) {
  const { note, notes, tab, onTab, dayDate, onDayDate, onSchedule, settings, pendingCount, onBack } = props;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!note) {
    return <div className="flex-1 grid place-items-center text-[15px] text-muted px-6 text-center">Select a note to see its ledger.</div>;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="safe-pt shrink-0">
        <div className="h-14 px-2.5 flex items-center gap-1">
          <div className="md:hidden"><ToolButton label="Back to Note" onClick={onBack}><ChevronLeft className="w-5 h-5" /></ToolButton></div>
          <h2 className="px-1.5 text-[17px] font-semibold">Ledger</h2>
          {pendingCount > 0 && <LoaderCircle className="w-4 h-4 text-muted ml-auto mr-2 animate-spin motion-reduce:animate-none" aria-label="Estimating" />}
        </div>
        <Segmented value={tab} onChange={onTab} />
      </header>
      <div role="tabpanel" id={`ledger-${tab}`} aria-labelledby={`ledger-tab-${tab}`} className="flex flex-col flex-1 min-h-0 pt-3">
        {tab === 'day' ? (
          <DayView note={note} notes={notes} date={dayDate} onDate={onDayDate} capacity={settings.dailyCapacityMinutes} now={now} onSchedule={onSchedule} />
        ) : (
          <Summary {...props} note={note} now={now} />
        )}
      </div>
    </div>
  );
}

/**
 * Segmented control for closely related subviews (segmented-controls.md):
 * text-only, noun labels, equal widths.
 */
function Segmented({ value, onChange }: { value: LedgerTab; onChange: (t: LedgerTab) => void }) {
  const tabs: { v: LedgerTab; label: string }[] = [{ v: 'day', label: 'Day' }, { v: 'summary', label: 'Summary' }];
  return (
    <div
      role="tablist"
      aria-label="Ledger view"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const next = value === 'day' ? 'summary' : 'day';
        onChange(next);
        requestAnimationFrame(() => document.getElementById(`ledger-tab-${next}`)?.focus());
      }}
      className="mx-4 grid grid-cols-2 p-[2px] rounded-[9px] bg-fill"
    >
      {tabs.map((t) => (
        <button
          key={t.v}
          id={`ledger-tab-${t.v}`}
          role="tab"
          aria-selected={value === t.v}
          aria-controls={`ledger-${t.v}`}
          tabIndex={value === t.v ? 0 : -1}
          onClick={() => onChange(t.v)}
          className={`h-7 rounded-[7px] text-[13px] font-medium transition-colors ${value === t.v ? 'bg-surface dark:bg-[#636366] shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)] text-ink' : 'text-ink-2 hover:text-ink'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Summary({ note, settings, aiStatus, onEstimateAll, onReestimateAll, onOpenSettings, now }: Props & { note: Note; now: number }) {
  const t = totals(note.items);
  const cap = settings.dailyCapacityMinutes;
  const pct = cap > 0 ? Math.min(1, t.remaining / cap) : 0;
  const over = t.remaining > cap;
  const active = note.items.filter((i) => i.text.trim() && !i.done);
  const quickWins = active.filter((i) => i.minutes != null && i.minutes > 0 && i.minutes <= 15);
  const deep = active.filter((i) => (i.minutes ?? 0) >= 90);
  const lowConf = active.filter((i) => i.confidence === 'low' && (i.minutes ?? 0) > 0);
  const meter = over ? 'bg-danger' : pct > 0.8 ? 'bg-warn' : 'bg-tint';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-4 pb-6 space-y-6">
        {/* Remaining + capacity: the one bold number on screen */}
        <section className="card p-4" aria-label="Time remaining">
          <div className="text-[13px] font-medium text-muted">Remaining</div>
          <div className="font-rounded tabular text-[44px] leading-[1.05] font-semibold tracking-[-0.01em] mt-0.5">{fmtMinutes(t.remaining)}</div>
          <div className="mt-4">
            <div
              role="meter"
              aria-label="Share of today’s capacity"
              aria-valuemin={0}
              aria-valuemax={cap}
              aria-valuenow={Math.min(t.remaining, cap)}
              aria-valuetext={over ? `Over capacity by ${fmtMinutes(t.remaining - cap)}` : `${Math.round(pct * 100)} percent of ${fmtMinutes(cap)}`}
              className="h-2 rounded-full bg-fill overflow-hidden"
            >
              <div className={`h-full rounded-full transition-[width] duration-500 ${meter}`} style={{ width: `${pct * 100}%` }} />
            </div>
            <div className="flex items-baseline justify-between mt-2 text-[13px]">
              {over ? (
                <span className="text-danger font-medium flex items-center gap-1">
                  <TriangleAlert className="w-3.5 h-3.5" aria-hidden />Over by {fmtMinutes(t.remaining - cap)}
                </span>
              ) : (
                <span className="text-muted tabular">{t.remaining === 0 ? 'Nothing left today' : `${Math.round(pct * 100)}% of ${fmtMinutes(cap)} today`}</span>
              )}
              <button onClick={onOpenSettings} className="text-tint hover:underline">Adjust</button>
            </div>
            {over && <p className="text-[13px] text-muted mt-1.5">That’s {(t.remaining / cap).toFixed(1)} days of focused work. Split it up or cut scope.</p>}
          </div>
        </section>

        {/* Stats as a grouped list */}
        <section className="card" aria-label="Summary">
          <Row label="Total" value={fmtMinutes(t.total)} />
          <Row label="Completed" value={fmtMinutes(t.done)} tone={t.done ? 'text-ok' : undefined} />
          <Row label="Items" value={`${t.doneCount} of ${t.count}`} />
          <Row label="Finish By" value={t.remaining > 0 ? finishBy(now, t.remaining) : '—'} />
        </section>

        {t.byCategory.length > 0 && (
          <Group title="Where the Time Goes">
            <div className="p-4">
              <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px]" aria-hidden>
                {t.byCategory.map((c) => (
                  <div key={c.category} className={`cat-${c.category} cat-fill`} style={{ width: `${(c.minutes / t.remaining) * 100}%` }} />
                ))}
              </div>
              <ul className="mt-3 space-y-1.5">
                {t.byCategory.map((c) => (
                  <li key={c.category} className="flex items-center gap-2 text-[14px]">
                    <span className={`cat-${c.category} cat-fill w-2.5 h-2.5 rounded-full`} aria-hidden />
                    <span>{c.category}</span>
                    <span className="ml-auto tabular text-muted">{fmtMinutes(c.minutes, { compact: true })}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Group>
        )}

        {quickWins.length > 0 && (
          <Group title="Quick Wins" footer="15 minutes or less. Knock these out first.">
            {quickWins.slice(0, 5).map((i) => <ItemLine key={i.id} item={i} />)}
          </Group>
        )}
        {deep.length > 0 && (
          <Group title="Deep Work" footer="90 minutes or more. Block real time for these.">
            {deep.slice(0, 5).map((i) => <ItemLine key={i.id} item={i} />)}
          </Group>
        )}

        <div className="space-y-2">
          {t.unestimated > 0 && (
            <button onClick={onEstimateAll} className="tap w-full h-11 rounded-[12px] bg-tint text-on-tint text-[15px] font-semibold flex items-center justify-center gap-2 hover:brightness-110 active:brightness-95">
              <Sparkles className="w-4 h-4" aria-hidden /> Estimate {t.unestimated} {t.unestimated === 1 ? 'Item' : 'Items'}
            </button>
          )}
          {t.count > 0 && (
            <button onClick={onReestimateAll} className="tap w-full h-11 rounded-[12px] bg-fill text-tint text-[15px] font-medium flex items-center justify-center gap-2 hover:bg-fill-2">
              <RefreshCw className="w-4 h-4" aria-hidden /> Re-estimate All
            </button>
          )}
          {lowConf.length > 0 && aiStatus.mode !== 'offline' && (
            <p className="text-[13px] text-muted px-1 pt-1">
              {lowConf.length} low-confidence {lowConf.length === 1 ? 'estimate' : 'estimates'}. More detail in those lines gives a tighter number.
            </p>
          )}
          {aiStatus.mode === 'offline' && (
            <p className="text-[13px] text-muted px-1 pt-1">
              <span className="text-warn font-medium">Offline.</span> Estimates marked “~” are keyword guesses.{' '}
              <button onClick={onOpenSettings} className="text-tint hover:underline">Add your key or the access code</button> to use Claude.
            </p>
          )}
        </div>

        <p className="text-[12px] text-muted px-1 safe-pb">Estimates assume one focused person. Real days run about 20% longer.</p>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="inset-row flex items-center justify-between h-11 px-4 text-[15px]">
      <span>{label}</span>
      <span className={`tabular ${tone ?? 'text-muted'}`}>{value}</span>
    </div>
  );
}

function Group({ title, footer, children }: { title: string; footer?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="px-4 pb-1.5 text-[13px] font-semibold text-muted">{title}</h3>
      <div className="card">{children}</div>
      {footer && <p className="px-4 pt-1.5 text-[12px] text-muted">{footer}</p>}
    </section>
  );
}

function ItemLine({ item }: { item: Item }) {
  return (
    <div className="inset-row flex items-center gap-3 min-h-11 px-4 py-2 text-[15px]">
      <span className="truncate">{item.text}</span>
      <span className="ml-auto tabular text-muted shrink-0">{fmtMinutes(item.minutes, { compact: true })}</span>
    </div>
  );
}
