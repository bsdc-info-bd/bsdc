/**
 * BSDC — src/shared/ui/Dialog.tsx
 * Purpose : Confirmation before destructive actions, optionally requiring a typed phrase
 *           (PART 04 LAW-12, LAW-19).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Destructive confirmations ask for a reason that is written to the audit log; the typed
 *           phrase (when used) must match exactly, which is what prevents a slip of the finger.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState, type ReactNode } from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { cn } from '@/shared/lib/cn';
import { Button } from './Button';
import { Input } from './Input';

/** Props for the ConfirmDialog component. */
export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string | undefined;
  readonly confirmLabel?: string | undefined;
  readonly cancelLabel?: string | undefined;
  readonly tone?: ('default' | 'danger') | undefined;
  readonly onConfirm: () => void;
  /** When set, the user must type this phrase exactly before confirming. */
  readonly confirmPhrase?: string | undefined;
  /** When true, a written reason is collected (required by LAW-12 for privileged actions). */
  readonly requireReason?: boolean | undefined;
  readonly reasonLabel?: string | undefined;
  readonly children?: ReactNode | undefined;
}

/**
 * Renders a confirmation dialog.
 * @param props component props
 * @returns an alert dialog element
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  confirmPhrase,
  requireReason = false,
  reasonLabel = 'Reason',
  children,
}: ConfirmDialogProps): React.ReactElement {
  const [phrase, setPhrase] = useState('');
  const [reason, setReason] = useState('');
  const phraseMatches = confirmPhrase === undefined || phrase === confirmPhrase;
  const reasonOk = !requireReason || reason.trim().length >= 3;
  const canConfirm = phraseMatches && reasonOk;

  const reset = (): void => {
    setPhrase('');
    setReason('');
  };

  return (
    <AlertDialogPrimitive.Root
      open={open}
      onOpenChange={(next: boolean): void => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="bsdc-modal__overlay" />
        <AlertDialogPrimitive.Content
          className={cn('bsdc-dialog__content', 'bsdc-modal__content')}
          data-tone={tone}
        >
          <AlertDialogPrimitive.Title className="bsdc-dialog__title">
            {title}
          </AlertDialogPrimitive.Title>
          {description !== undefined && (
            <AlertDialogPrimitive.Description className="bsdc-dialog__description">
              {description}
            </AlertDialogPrimitive.Description>
          )}
          {children}
          {requireReason && (
            <div className="bsdc-dialog__confirm-input">
              <Input
                label={reasonLabel}
                value={reason}
                onChange={(event): void => setReason(event.target.value)}
                required
                maxLength={280}
              />
            </div>
          )}
          {confirmPhrase !== undefined && (
            <div className="bsdc-dialog__confirm-input">
              <Input
                label={`Type "${confirmPhrase}" to confirm`}
                value={phrase}
                onChange={(event): void => setPhrase(event.target.value)}
                autoComplete="off"
              />
            </div>
          )}
          <div className="bsdc-dialog__actions">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="secondary" onClick={reset}>
                {cancelLabel}
              </Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button
                variant={tone === 'danger' ? 'danger' : 'primary'}
                disabled={!canConfirm}
                onClick={(): void => {
                  onConfirm();
                  reset();
                }}
              >
                {confirmLabel}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
