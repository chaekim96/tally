import { useRef } from 'react';
import { useModal } from '../../lib/useModal';

interface Props {
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Apple-style alert (alerts.md): a short title, an optional message, and two
 * buttons. Cancel gets initial focus so a destructive action is never the
 * default (pull-down-buttons.md › confirm destructive intent).
 */
export default function Alert({ title, message, confirmLabel, destructive, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const ref = useModal<HTMLDivElement>(onCancel, () => cancelRef.current);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 fade-in p-6" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-title"
        aria-describedby={message ? 'alert-message' : undefined}
        tabIndex={-1}
        className="w-full max-w-[300px] bg-surface rounded-[18px] shadow-2xl pop-in overflow-hidden outline-none"
      >
        <div className="px-5 pt-5 pb-4 text-center">
          <h2 id="alert-title" className="text-[17px] font-semibold leading-snug">{title}</h2>
          {message && <p id="alert-message" className="text-[13px] text-ink-2 mt-1.5 leading-snug">{message}</p>}
        </div>
        <div className="grid grid-cols-2 border-t-[0.5px] border-separator">
          <button ref={cancelRef} onClick={onCancel} className="h-11 text-[17px] text-tint hover:bg-fill">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`h-11 text-[17px] font-semibold border-l-[0.5px] border-separator hover:bg-fill ${destructive ? 'text-danger' : 'text-tint'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
