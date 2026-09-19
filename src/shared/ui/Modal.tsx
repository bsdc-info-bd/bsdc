/**
 * BSDC — src/shared/ui/Modal.tsx
 * Purpose : Centred dialog for pointer-fine viewports; renders as a sheet on touch (PART 08.04 R-19).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Radix handles focus trapping, scroll locking (through useLockScroll), Escape and
 *           aria-modal. Nothing in the product builds a modal by hand.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Icon } from './Icon';

/** Props for the Modal component. */
export interface ModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string | undefined;
  readonly children?: ReactNode | undefined;
  readonly footer?: ReactNode | undefined;
  readonly size?: ('sm' | 'md' | 'lg' | 'xl' | 'full') | undefined;
  /** Accessible label for the close control. */
  readonly closeLabel?: string | undefined;
}

/**
 * Renders a modal dialog.
 * @param props component props
 * @returns a dialog element
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeLabel = 'Close',
}: ModalProps): React.ReactElement {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="bsdc-modal__overlay" />
        <DialogPrimitive.Content
          className="bsdc-modal__content"
          data-size={size}
          aria-describedby={description}
        >
          <header className="bsdc-modal__header">
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
          <div className="bsdc-modal__body">{children}</div>
          {footer !== undefined && <footer className="bsdc-modal__footer">{footer}</footer>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
