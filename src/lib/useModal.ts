import { useEffect, useRef } from 'react';

/**
 * Modal behavior shared by sheets and alerts: Escape cancels, Tab stays inside,
 * and focus returns to whatever opened the modal (modality.md: an obvious way out).
 */
export function useModal<T extends HTMLElement>(onCancel: () => void, initialFocus?: () => HTMLElement | null) {
  const ref = useRef<T>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = ref.current;
    (initialFocus?.() ?? root)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); cancel.current(); return; }
      if (e.key !== 'Tab' || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      opener?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}
