import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

export type MenuEntry =
  | { kind: 'section'; label: string }
  | { kind: 'divider' }
  | {
      kind: 'item' | 'radio' | 'checkbox';
      label: string;
      checked?: boolean;
      destructive?: boolean;
      icon?: React.ReactNode;
      onSelect: () => void;
    };

interface Props {
  label: string;
  trigger: React.ReactNode;
  entries: MenuEntry[];
  triggerClassName?: string;
}

/**
 * Pull-down menu (pull-down-buttons.md, menus.md): title-style item labels,
 * a checkmark column for state, destructive items in red, full keyboard support.
 */
export default function Menu({ label, trigger, entries, triggerClassName = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const items = () => [...(listRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
  const close = (refocus = true) => { setOpen(false); if (refocus) buttonRef.current?.focus(); };

  // The menu renders in a portal: glass nested inside another glass surface (the
  // toolbar capsule) can't blur the page behind it, because the outer
  // backdrop-filter becomes its backdrop root.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
  }, [open]);

  useEffect(() => {
    if (!open || !pos) return;
    items()[0]?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !listRef.current?.contains(t)) close(false);
    };
    const onResize = () => close(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onResize);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('resize', onResize); };
  }, [open, pos]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') { close(false); }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && pos && createPortal(
        <div
          ref={listRef}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          style={{ top: pos.top, right: pos.right }}
          className="glass glass-regular fixed z-50 min-w-[232px] max-w-[calc(100vw-16px)] rounded-[14px] p-1.5 pop-in origin-top-right"
        >
          {entries.map((entry, n) => {
            if (entry.kind === 'divider') return <div key={n} role="separator" className="my-1.5 mx-2 border-t-[0.5px] border-separator" />;
            if (entry.kind === 'section') return <div key={n} className="px-2.5 pt-1.5 pb-1 text-[12px] font-semibold text-muted">{entry.label}</div>;
            const role = entry.kind === 'radio' ? 'menuitemradio' : entry.kind === 'checkbox' ? 'menuitemcheckbox' : 'menuitem';
            return (
              <button
                key={n}
                role={role}
                aria-checked={entry.kind === 'item' ? undefined : !!entry.checked}
                tabIndex={-1}
                onClick={() => { entry.onSelect(); close(); }}
                className={`w-full flex items-center gap-2 h-8 pl-1.5 pr-2.5 rounded-[8px] text-left text-[14px] outline-none hover:bg-fill focus:bg-fill ${entry.destructive ? 'text-danger' : 'text-ink'}`}
              >
                <span className="w-4 grid place-items-center shrink-0" aria-hidden>
                  {entry.checked && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
                </span>
                <span className="flex-1">{entry.label}</span>
                {entry.icon && <span className="shrink-0 opacity-80" aria-hidden>{entry.icon}</span>}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
