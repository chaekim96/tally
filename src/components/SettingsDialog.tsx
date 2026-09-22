import { useEffect, useRef, useState } from 'react';
import { Download, Upload, X } from 'lucide-react';
import type { Note, Settings } from '../../lib/types';
import type { AiStatus } from '../lib/ai';

interface Props {
  settings: Settings;
  notes: Note[];
  aiStatus: AiStatus;
  onChange: (s: Settings) => void;
  onImport: (notes: Note[]) => void;
  onClose: () => void;
}

export default function SettingsDialog({ settings, notes, aiStatus, onChange, onImport, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [capacityHours, setCapacityHours] = useState(String(settings.dailyCapacityMinutes / 60));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), notes }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tally-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const list: Note[] = Array.isArray(data) ? data : data.notes;
      if (!Array.isArray(list)) throw new Error('bad');
      if (confirm(`Replace your ${notes.length} notes with ${list.length} from this file?`)) onImport(list);
    } catch {
      alert('That file is not a Tally backup.');
    }
  };

  const aiLine =
    aiStatus.mode === 'server' ? 'Using the server key (ANTHROPIC_API_KEY on Vercel).'
    : aiStatus.mode === 'browser' ? 'Using the key saved in this browser.'
    : aiStatus.mode === 'offline' ? `Offline: ${aiStatus.reason}. Estimates use built-in heuristics.`
    : 'Checking…';

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full sm:w-[440px] max-h-[92vh] overflow-y-auto bg-surface rounded-t-2xl sm:rounded-2xl shadow-2xl border border-line row-in">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line">
          <h2 className="font-semibold">Settings</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-2"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-6 text-sm">
          <Section title="Appearance">
            <div className="flex gap-1 bg-surface-2 p-1 rounded-lg w-fit">
              {(['system', 'light', 'dark'] as const).map((t) => (
                <button key={t} onClick={() => set('theme', t)} className={`px-3 py-1.5 rounded-md capitalize text-xs font-medium transition ${settings.theme === t ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink'}`}>{t}</button>
              ))}
            </div>
          </Section>

          <Section title="Daily capacity" hint="Focused hours you realistically have per day. The ledger compares remaining work against this.">
            <div className="flex items-center gap-2">
              <input
                type="number" min={1} max={16} step={0.5}
                value={capacityHours}
                onChange={(e) => setCapacityHours(e.target.value)}
                onBlur={() => { const h = parseFloat(capacityHours); if (h > 0) set('dailyCapacityMinutes', Math.round(h * 60)); else setCapacityHours(String(settings.dailyCapacityMinutes / 60)); }}
                className="w-20 bg-surface-2 rounded-lg px-3 py-2 font-mono tnum outline-none focus:ring-2 focus:ring-line-strong"
              />
              <span className="text-muted">hours / day</span>
            </div>
          </Section>

          <Section title="Estimates">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={settings.autoEstimate} onChange={(e) => set('autoEstimate', e.target.checked)} className="accent-[var(--accent)] w-4 h-4" />
              <span>Estimate automatically as I type</span>
            </label>
            <p className="text-xs text-muted mt-2">{aiLine}</p>
          </Section>

          <Section title="Anthropic API key (optional)" hint="Only needed if the server has no key. Stored in this browser only and sent straight to the estimate function.">
            <input
              type="password"
              autoComplete="off"
              value={settings.apiKey}
              onChange={(e) => set('apiKey', e.target.value.trim())}
              placeholder="sk-ant-…"
              className="w-full bg-surface-2 rounded-lg px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-line-strong"
            />
          </Section>

          <Section title="Backup">
            <div className="flex gap-2">
              <button onClick={exportJson} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 hover:bg-line text-xs font-medium transition"><Download className="w-3.5 h-3.5" /> Export JSON</button>
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 hover:bg-line text-xs font-medium transition"><Upload className="w-3.5 h-3.5" /> Import JSON</button>
              <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
            </div>
            <p className="text-xs text-muted mt-2">Notes live in this browser's local storage. Export before clearing site data.</p>
          </Section>

          <Section title="Shortcuts">
            <ul className="grid grid-cols-2 gap-y-1.5 text-xs text-ink-2">
              <Key k="⌘N" v="New note" /><Key k="⌘," v="Settings" />
              <Key k="Enter" v="New line" /><Key k="Tab / ⇧Tab" v="Indent / outdent" />
              <Key k="⌘Enter" v="Toggle done" /><Key k="⌥↑ / ⌥↓" v="Move line" />
              <Key k="⌘E" v="Estimate line" /><Key k="⌘B" v="Break down line" />
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted mb-2">{title}</div>
      {children}
      {hint && <p className="text-xs text-muted mt-2">{hint}</p>}
    </div>
  );
}

function Key({ k, v }: { k: string; v: string }) {
  return (
    <li className="flex items-center gap-2"><kbd className="font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-surface-2 border border-line">{k}</kbd>{v}</li>
  );
}
