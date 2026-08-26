/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClass = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
} as const;

export function Modal({ open, onOpenChange, title, description, children, footer, size = 'md' }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bsdc-animate-fade-in fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            'bsdc-modal-content fixed z-50 flex w-full flex-col overflow-hidden border border-surface-light-border bg-white shadow-raised',
            'dark:border-surface-dark-border dark:bg-surface-dark-muted',
            'left-0 right-0 bottom-0 max-h-[92dvh] rounded-t-2xl',
            'sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2.5rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:max-h-[88dvh]',
            'bsdc-animate-slide-up',
            sizeClass[size],
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-surface-light-border px-5 py-4 dark:border-surface-dark-border">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-bold leading-tight">{title || 'Dialog'}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close
              asChild
              aria-label="Close dialog"
              className="bsdc-tap shrink-0 rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-surface-dark-raised"
            >
              <span>
                <X className="h-5 w-5" aria-hidden />
              </span>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="flex flex-col-reverse gap-2 border-t border-surface-light-border px-5 py-4 dark:border-surface-dark-border sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  danger,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      footer={
        <>
          <Dialog.Close asChild>
            <button
              type="button"
              className="bsdc-tap inline-flex items-center justify-center rounded-lg border border-surface-light-border px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-surface-dark-border dark:text-neutral-200 dark:hover:bg-surface-dark-raised"
            >
              {cancelLabel}
            </button>
          </Dialog.Close>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'bsdc-tap inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60',
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700',
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-neutral-600 dark:text-neutral-300">{body}</p>
    </Modal>
  );
}
