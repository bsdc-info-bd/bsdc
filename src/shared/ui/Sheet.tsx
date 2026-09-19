/**
 * BSDC — src/shared/ui/Sheet.tsx
 * Purpose : Bottom sheet on touch, side sheet with a pointer (PART 08.04 R-19, PART 08.05).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The drag handle is decorative; dismissal is always achievable with Escape or the close
 *           button so the gesture is an enhancement, never the only way out (LAW-14).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/shared/lib/cn';
import { Icon } from './Icon';

export type SheetSide = 'bottom' | 'right' | 'left';

/** Props for the Sheet component. */
export interface SheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string | undefined;
  readonly children?: ReactNode | undefined;
  readonly footer?: ReactNode | undefined;
  readonly side?: SheetSide | undefined;
  readonly closeLabel?: string | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders a sheet.
 * @param props component props
 * @returns a sheet element
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = 'bottom',
  closeLabel = 'Close',
  className,
}: SheetProps): React.ReactElement {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="bsdc-sheet__overlay" />
        <DialogPrimitive.Content className={cn('bsdc-sheet__content', className)} data-side={side}>
          {side === 'bottom' && <div className="bsdc-sheet__handle" aria-hidden="true" />}
          <header className="bsdc-sheet__header">
            <div className="min-w-0">
              <DialogPrimitive.Title className="bsdc-modal__title">{title}</DialogPrimitive.Title>
              {description !== undefined && (
                <DialogPrimitive.Description className="bsdc-card__description">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              className="bsdc-button"
              data-variant="ghost"
              data-size="sm"
              aria-label={closeLabel}
            >
              <Icon name="close" size={18} />
            </DialogPrimitive.Close>
          </header>
          <div className="bsdc-sheet__body">{children}</div>
          {footer !== undefined && <footer className="bsdc-modal__footer">{footer}</footer>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
