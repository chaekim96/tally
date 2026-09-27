import { Minus, Plus } from 'lucide-react';

/** iOS switch, used only in a list row (toggles.md › Mobile). */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-[51px] h-[31px] rounded-full transition-colors duration-200 ${checked ? 'bg-[var(--switch-on)]' : 'bg-fill-2'}`}
    >
      <span
        aria-hidden
        className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.2),0_0_0_0.5px_rgb(0_0_0/0.04)] transition-transform duration-200 ${checked ? 'translate-x-[20px]' : ''}`}
      />
    </button>
  );
}

/**
 * Stepper with its value shown beside it (steppers.md). Shift-click moves in
 * larger steps for a wide range.
 */
export function Stepper({
  value, onChange, min, max, step, bigStep, label, format,
}: {
  value: number; onChange: (v: number) => void; min: number; max: number; step: number; bigStep: number;
  label: string; format: (v: number) => string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const nudge = (dir: 1 | -1, e: React.MouseEvent) => onChange(clamp(value + dir * (e.shiftKey ? bigStep : step)));
  return (
    <div role="group" aria-label={label} className="flex items-center gap-3">
      <output aria-live="polite" className="tabular text-[15px] text-ink-2 min-w-[4ch] text-right">{format(value)}</output>
      <div className="flex items-center h-8 rounded-[9px] bg-fill">
        <button
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={(e) => nudge(-1, e)}
          className="tap w-11 h-8 grid place-items-center rounded-l-[9px] hover:bg-fill disabled:opacity-35 disabled:hover:bg-transparent"
        >
          <Minus className="w-4 h-4" />
        </button>
        <span aria-hidden className="w-[0.5px] h-4 bg-separator" />
        <button
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={(e) => nudge(1, e)}
          className="tap w-11 h-8 grid place-items-center rounded-r-[9px] hover:bg-fill disabled:opacity-35 disabled:hover:bg-transparent"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/** A borderless symbol button in a floating glass capsule group (toolbars.md › Actions). */
export function ToolButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`tap w-9 h-9 grid place-items-center rounded-full transition-colors ${active ? 'text-tint' : 'text-ink'} hover:bg-fill`}
    >
      {children}
    </button>
  );
}
