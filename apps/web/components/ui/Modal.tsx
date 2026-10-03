'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Accessible dialog primitive built on the native <dialog> element.
 *
 * Features:
 *  - Native focus trap and Escape-to-close via the browser.
 *  - Click-outside-the-card closes via a backdrop click handler.
 *  - Backdrop dims via `::backdrop` CSS (see `app/globals.css`).
 *  - `prefers-reduced-motion` suppresses the scale/opacity transition.
 *
 * Consumers render their content as children. Use `header` and `footer`
 * props for the title and action row, or just put your own markup inside.
 */
export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Optional right-aligned header content (e.g. a Close X). */
  headerRight?: ReactNode;
  children: ReactNode;
  /** Optional action row rendered at the bottom inside the card. */
  footer?: ReactNode;
  /** 'default' (max-w-md) or 'wide' (max-w-2xl). */
  variant?: 'default' | 'wide';
  /** Optional aria-label when there's no title. */
  ariaLabel?: string;
};

export const Modal = ({
  open,
  onClose,
  title,
  headerRight,
  children,
  footer,
  variant = 'default',
  ariaLabel,
}: ModalProps) => {
  const ref = useRef<HTMLDialogElement | null>(null);
  const lastActiveRef = useRef<HTMLElement | null>(null);

  // Open/close the <dialog> in lockstep with `open`. The browser handles
  // focus and Escape natively; we just call showModal()/close().
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      lastActiveRef.current = (document.activeElement as HTMLElement | null) ?? null;
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  // Keep `onClose` in sync so Escape/backdrop fires the React handler.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handler = () => onClose();
    dlg.addEventListener('close', handler);
    dlg.addEventListener('cancel', handler);
    return () => {
      dlg.removeEventListener('close', handler);
      dlg.removeEventListener('cancel', handler);
    };
  }, [onClose]);

  // Restore focus when the dialog closes — important for keyboard users.
  useEffect(() => {
    if (!open) {
      const last = lastActiveRef.current;
      if (last && document.contains(last)) last.focus();
    }
  }, [open]);

  const widthClass = variant === 'wide' ? 'max-w-2xl' : 'max-w-md';

  return (
    <dialog
      ref={ref}
      aria-label={typeof title === 'string' ? title : ariaLabel}
      className={`modal-card glass w-[92vw] rounded-glass border border-glass-border p-0 text-fg shadow-xl backdrop:bg-black/60 ${widthClass}`}
      onClick={(e) => {
        // Click on the dialog backdrop (outside the inner card) closes.
        // The dialog element itself is the entire surface; the inner
        // content uses `onClick` stopPropagation to swallow clicks.
        if (e.target === ref.current) onClose();
      }}
    >
      <div
        className="flex max-h-[85vh] flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {(title || headerRight) && (
          <header className="flex items-center justify-between gap-3 border-b border-glass-border px-5 py-3">
            <div className="font-display text-base tracking-display text-fg">{title}</div>
            {headerRight ?? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-muted hover:text-fg"
              >
                ×
              </button>
            )}
          </header>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-glass-border px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
};