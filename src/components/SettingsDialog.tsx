import { useRef, useState } from 'react';
import type { Note, Settings } from '../../lib/types';
import type { AiStatus } from '../lib/ai';
import { useModal } from '../lib/useModal';
import { fmtMinutes } from '../lib/time';
import Alert from './ui/Alert';
import { Stepper, Switch } from './ui/controls';

interface Props {
  settings: Settings;
  notes: Note[];
  aiStatus: AiStatus;
  onChange: (s: Settings) => void;
  onImport: (notes: Note[]) => void;
  onClose: () => void;
  onToast: (text: string) => void;
}

/**
 * Settings as an inset grouped sheet (settings.md, sheets.md). Appearance is
 * intentionally absent: Tally follows the system (dark-mode.md).
 */
export default function SettingsDialog({ settings, notes, aiStatus, onChange, onImport, onClose, onToast }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const [pendingImport, setPendingImport] = useState<Note[] | null>(null);
  const ref = useModal<HTMLDivElement>(() => { if (!pendingImport) onClose(); }, () => doneRef.current);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), notes }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tally-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const readImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const list: Note[] = Array.isArray(data) ? data : data.notes;
      if (!Array.isArray(list)) throw new Error('bad');
      setPendingImport(list);
    } catch {
      onToast('That file isn’t a Tally backup.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const aiLine =
    aiStatus.mode === 'browser' ? 'Using your own key. Usage is billed to your Anthropic account.'
    : aiStatus.mode === 'server' ? 'Using the server’s key, unlocked by your access code.'
    : aiStatus.mode === 'offline' ? `Offline: ${aiStatus.reason}. Estimates use built-in keyword guesses.`
    : 'Checking…';

  return (
    <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-black/35 fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        className="w-full md:w-[480px] max-h-[92vh] flex flex-col bg-grouped rounded-t-[14px] md:rounded-[14px] shadow-2xl sheet-in md:pop-in outline-none overflow-hidden"
      >
        <header className="relative h-14 shrink-0 flex items-center justify-center border-b-[0.5px] border-separator">
          <h2 id="settings-title" className="text-[17px] font-semibold">Settings</h2>
          <button ref={doneRef} onClick={onClose} className="tap absolute right-2 h-9 px-3 rounded-full text-[17px] font-semibold text-tint hover:bg-tint-soft">
            Done
          </button>
        </header>

        <div className="overflow-y-auto px-4 pt-5 pb-8 space-y-7 safe-pb">
          <Group title="Planning" footer="The focused hours you realistically have in a day. The ledger compares what’s left against this.">
            <Row label="Daily Capacity">
              <Stepper
                label="Daily capacity"
                value={settings.dailyCapacityMinutes}
                onChange={(v) => set('dailyCapacityMinutes', v)}
                min={60} max={16 * 60} step={30} bigStep={120}
                format={(v) => fmtMinutes(v)}
              />
            </Row>
          </Group>

          <Group title="Estimates" footer={aiLine}>
            <Row label="Estimate as You Type">
              <Switch label="Estimate as you type" checked={settings.autoEstimate} onChange={(v) => set('autoEstimate', v)} />
            </Row>
          </Group>

          <Group
            title="Claude"
            footer="Your own key always takes priority, and usage goes on your Anthropic account. Without one, the access code unlocks the server’s key. Both stay in this browser."
          >
            <FieldRow label="Your API Key" value={settings.apiKey} placeholder="Optional" onChange={(v) => set('apiKey', v)} />
            <FieldRow label="Access Code" value={settings.accessCode} placeholder="Optional" onChange={(v) => set('accessCode', v)} />
          </Group>

          <Group title="Backup" footer="Notes are stored in this browser. Export a backup before clearing site data.">
            <ActionRow onClick={exportJson}>Export Backup</ActionRow>
            <ActionRow onClick={() => fileRef.current?.click()}>Import Backup…</ActionRow>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && readImport(e.target.files[0])} />
          </Group>

          <Group title="Keyboard Shortcuts">
            {[
              ['New Note', '⌘N'], ['Settings', '⌘,'], ['New Line', '↩'], ['Indent · Outdent', '⇥ · ⇧⇥'],
              ['Complete Item', '⌘↩'], ['Move Line', '⌥↑ · ⌥↓'], ['Estimate Again', '⌘E'], ['Break Down', '⌘B'],
            ].map(([label, keys]) => (
              <Row key={label} label={label}><kbd className="tabular text-[15px] text-muted">{keys}</kbd></Row>
            ))}
          </Group>
        </div>
      </div>

      {pendingImport && (
        <Alert
          title="Replace Your Notes?"
          message={`Your ${notes.length} ${notes.length === 1 ? 'note' : 'notes'} will be replaced by ${pendingImport.length} from this backup.`}
          confirmLabel="Replace"
          destructive
          onConfirm={() => { onImport(pendingImport); setPendingImport(null); }}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </div>
  );
}

function Group({ title, footer, children }: { title: string; footer?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="px-4 pb-1.5 text-[13px] font-semibold text-muted">{title}</h3>
      <div className="card">{children}</div>
      {footer && <p className="px-4 pt-1.5 text-[13px] text-muted leading-snug">{footer}</p>}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="inset-row flex items-center justify-between gap-3 min-h-11 pl-4 pr-3 py-1.5 text-[15px]">
      <span>{label}</span>
      {children}
    </div>
  );
}

function FieldRow({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <label className="inset-row flex items-center gap-3 min-h-11 pl-4 pr-3 text-[15px]">
      <span className="shrink-0">{label}</span>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder={placeholder}
        className="flex-1 min-w-0 h-8 bg-transparent text-right text-[15px] rounded-[6px] px-1"
      />
    </label>
  );
}

function ActionRow({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="inset-row w-full min-h-11 px-4 text-left text-[15px] text-tint hover:bg-fill">
      {children}
    </button>
  );
}
