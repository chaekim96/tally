import { useEffect } from 'react';

export interface ToastMsg { kind: 'info' | 'warn'; text: string }

export default function Toast({ msg, onDone }: { msg: ToastMsg | null; onDone: () => void }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDone, 3800);
    return () => clearTimeout(t);
  }, [msg, onDone]);
  if (!msg) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 row-in">
      <div className={`px-4 py-2.5 rounded-xl text-sm shadow-lg border ${msg.kind === 'warn' ? 'bg-warn-soft text-warn border-warn/30' : 'bg-surface text-ink border-line'}`}>
        {msg.text}
      </div>
    </div>
  );
}
