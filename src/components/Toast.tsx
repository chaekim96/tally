import { TriangleAlert, X } from 'lucide-react';

export interface ToastMsg { kind: 'info' | 'warn'; text: string }

/**
 * A banner that stays until dismissed. Timed auto-dismissal is hard on people
 * who need longer to read (accessibility.md › Cognitive).
 */
export default function Toast({ msg, onDone }: { msg: ToastMsg | null; onDone: () => void }) {
  if (!msg) return null;
  return (
    <div className="fixed bottom-5 inset-x-4 z-50 flex justify-center pointer-events-none safe-pb">
      <div role="status" aria-live="polite" className="glass glass-regular pointer-events-auto flex items-center gap-2.5 max-w-md rounded-full pl-4 pr-1 py-1 pop-in">
        {msg.kind === 'warn' && <TriangleAlert className="w-4 h-4 text-warn shrink-0" aria-hidden />}
        <span className="text-[13px] leading-snug py-1.5">{msg.text}</span>
        <button onClick={onDone} aria-label="Dismiss" className="tap w-8 h-8 shrink-0 grid place-items-center rounded-full text-muted hover:bg-fill hover:text-ink">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
