import { useEffect, useState } from 'react';
import { ChevronLeft, RefreshCw, Sparkles, Zap } from 'lucide-react';
import type { Note, Settings } from '../../lib/types';
import type { AiStatus } from '../lib/ai';
import { CATEGORY_BAR, totals } from '../lib/notes';
import { finishBy, fmtMinutes } from '../lib/time';

interface Props {
  note: Note | null;
  settings: Settings;
  aiStatus: AiStatus;
  pendingCount: number;
  onEstimateAll: () => void;
  onReestimateAll: () => void;
  onBack: () => void;
  onOpenSettings: () => void;
}

export default function Ledger({ note, settings, aiStatus, pendingCount, onEstimateAll, onReestimateAll, onBack, onOpenSettings }: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted px-6 text-center">Select a note to see its ledger.</div>
    );
  }

  const t = totals(note.items);
  const cap = settings.dailyCapacityMinutes;
  const pct = cap > 0 ? Math.min(1, t.remaining / cap) : 0;
  const over = t.remaining > cap;
  const days = t.remaining / cap;
  const active = note.items.filter((i) => i.text.trim() && !i.done);
  const quickWins = active.filter((i) => i.minutes != null && i.minutes > 0 && i.minutes <= 15);
  const deep = active.filter((i) => (i.minutes ?? 0) >= 90);
  const lowConf = active.filter((i) => i.confidence === 'low' && (i.minutes ?? 0) > 0);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-5 pt-5 pb-3 flex items-center gap-2 safe-pt">
        <button onClick={onBack} className="md:hidden p-1.5 -ml-1 rounded-lg text-ink-2 hover:bg-surface-2"><ChevronLeft className="w-5 h-5" /></button>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Ledger</h2>
        {pendingCount > 0 && <Sparkles className="w-3.5 h-3.5 text-accent estimating ml-auto" />}
      </div>

      {/* Headline */}
      <div className="px-5">
        <div className="text-[11px] text-muted">Remaining</div>
        <div className="font-mono tnum text-[40px] leading-none font-medium tracking-tight mt-1">{fmtMinutes(t.remaining)}</div>
        <div className="mt-3 text-[12.5px]">
          <Stat label="Total" value={fmtMinutes(t.total)} />
          <Stat label="Done" value={fmtMinutes(t.done)} tone={t.done ? 'text-ok' : ''} />
          <Stat label="Items" value={`${t.doneCount}/${t.count}`} />
          <Stat label="Finish by" value={t.remaining > 0 ? finishBy(now, t.remaining) : '—'} />
        </div>
      </div>

      {/* Capacity */}
      <div className="px-5 mt-6">
        <div className="flex items-baseline justify-between text-[11px] mb-2">
          <span className="text-muted">Day capacity · {fmtMinutes(cap)}</span>
          <span className={`font-mono tnum ${over ? 'text-danger' : 'text-ink-2'}`}>
            {t.remaining === 0 ? 'clear' : over ? `${days.toFixed(1)} days` : `${Math.round(pct * 100)}%`}
          </span>
        </div>
        <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${over ? 'bg-danger' : pct > 0.8 ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${pct * 100}%` }} />
        </div>
        {over && (
          <p className="text-[11.5px] text-danger mt-2">Over capacity by {fmtMinutes(t.remaining - cap)}. Split it across days or cut scope.</p>
        )}
        <button onClick={onOpenSettings} className="text-[11px] text-muted hover:text-ink mt-2 underline decoration-dotted underline-offset-2">Adjust capacity</button>
      </div>

      {/* Category mix */}
      {t.byCategory.length > 0 && (
        <div className="px-5 mt-6">
          <div className="text-[11px] text-muted mb-2">Where the time goes</div>
          <div className="flex h-2 rounded-full overflow-hidden gap-px">
            {t.byCategory.map((c) => (
              <div key={c.category} className={CATEGORY_BAR[c.category]} style={{ width: `${(c.minutes / t.remaining) * 100}%` }} title={`${c.category} ${fmtMinutes(c.minutes)}`} />
            ))}
          </div>
          <ul className="mt-2.5 space-y-1">
            {t.byCategory.slice(0, 5).map((c) => (
              <li key={c.category} className="flex items-center gap-2 text-[12px]">
                <span className={`w-1.5 h-1.5 rounded-full ${CATEGORY_BAR[c.category]}`} />
                <span className="text-ink-2">{c.category}</span>
                <span className="ml-auto font-mono tnum text-ink-2">{fmtMinutes(c.minutes, { compact: true })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggestions */}
      {(quickWins.length > 0 || deep.length > 0) && (
        <div className="px-5 mt-6 space-y-4">
          {quickWins.length > 0 && (
            <Group title="Quick wins" hint="≤15m — knock these out first">
              {quickWins.slice(0, 4).map((i) => <Line key={i.id} text={i.text} mins={i.minutes!} />)}
            </Group>
          )}
          {deep.length > 0 && (
            <Group title="Deep work" hint="≥90m — needs a real block">
              {deep.slice(0, 4).map((i) => <Line key={i.id} text={i.text} mins={i.minutes!} />)}
            </Group>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="px-5 mt-6 mb-6 space-y-2">
        {t.unestimated > 0 && (
          <button onClick={onEstimateAll} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-ink text-canvas text-[12.5px] font-medium hover:opacity-90 active:scale-[0.99] transition">
            <Zap className="w-3.5 h-3.5" /> Estimate {t.unestimated} unestimated
          </button>
        )}
        {t.count > 0 && (
          <button onClick={onReestimateAll} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-surface-2 text-ink-2 text-[12.5px] font-medium hover:bg-line transition">
            <RefreshCw className="w-3.5 h-3.5" /> Re-estimate everything
          </button>
        )}
        {lowConf.length > 0 && aiStatus.mode !== 'offline' && (
          <p className="text-[11px] text-muted pt-1">{lowConf.length} low-confidence {lowConf.length === 1 ? 'estimate' : 'estimates'} — add detail to those lines for a tighter number.</p>
        )}
        {aiStatus.mode === 'offline' && (
          <p className="text-[11px] text-warn pt-1">Offline mode: estimates marked “~” are keyword guesses. <button onClick={onOpenSettings} className="underline">Add an API key</button> for Claude estimates.</p>
        )}
      </div>

      <div className="mt-auto px-5 py-3 border-t border-line text-[10.5px] text-muted safe-pb">
        Estimates are for one focused person. Reality adds ~20%.
      </div>
    </div>
  );
}

function Stat({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line/70 py-1">
      <span className="text-muted">{label}</span>
      <span className={`font-mono tnum whitespace-nowrap ${tone}`}>{value}</span>
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-[11px] font-semibold text-ink-2">{title}</span>
        <span className="text-[10.5px] text-muted">{hint}</span>
      </div>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function Line({ text, mins }: { text: string; mins: number }) {
  return (
    <li className="flex items-center gap-2 text-[12px]">
      <span className="truncate text-ink-2">{text}</span>
      <span className="ml-auto font-mono tnum text-muted shrink-0">{fmtMinutes(mins, { compact: true })}</span>
    </li>
  );
}
