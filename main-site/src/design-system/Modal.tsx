import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
  /** Hidden on small screens where the dialog becomes a bottom sheet. */
  footer?: ReactNode;
}

/**
 * Accessible dialog. Below 640px it presents as a bottom sheet, matching the
 * native app patterns required by the BSDC design system.
 */
export function Modal({ open, onClose, title, closeLabel, children, footer }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isSheet = useMediaQuery('(max-width: 639px)');
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-green-900/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex max-h-[92dvh] w-full flex-col border border-border bg-bg shadow-sheet',
          isSheet ? 'rounded-t-sheet' : 'max-w-lg rounded-card',
          'animate-fade-up',
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <h2 className="fab-truncate text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="fab-tap inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-2"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="fab-scroll min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
        {footer ? <div className="border-t border-border p-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
