/**
 * BSDC — src/shared/ui/Drawer.tsx
 * Purpose : Navigation drawer for the mobile shell and the admin panel (PART 08.09).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Always mounted through the Sheet primitive so focus, Escape and scroll locking behave
 *           identically across the product.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/shared/lib/cn';
import { Icon } from './Icon';

/** Props for the Drawer component. */
export interface DrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly children?: ReactNode | undefined;
  readonly footer?: ReactNode | undefined;
  readonly side?: ('left' | 'right') | undefined;
  readonly closeLabel?: string | undefined;
  readonly className?: string | undefined;
}

/**
 * Renders a navigation drawer.
 * @param props component props
 * @returns a drawer element
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  footer,
  side = 'left',
  closeLabel = 'Close menu',
  className,
}: DrawerProps): React.ReactElement {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="bsdc-sheet__overlay" />
        <DialogPrimitive.Content
          className={cn('bsdc-drawer', 'bsdc-sheet__content', className)}
          data-side={side}
          style={{ position: 'fixed', insetBlock: 0, [side]: 0 }}
        >
          <header className="bsdc-drawer__header">
            <DialogPrimitive.Title className="bsdc-modal__title">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="bsdc-button"
              data-variant="ghost"
              data-size="sm"
              aria-label={closeLabel}
            >
              <Icon name="close" size={18} />
            </DialogPrimitive.Close>
          </header>
          <div className="bsdc-drawer__body">{children}</div>
          {footer !== undefined && <footer className="bsdc-drawer__footer">{footer}</footer>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
