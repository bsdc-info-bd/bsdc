/**
 * BSDC — src/shared/ui/LazyDropdownMenu.tsx
 * Purpose : A dropdown whose menu implementation is loaded on first interaction (PART 25).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Radix's popper, menu and focus machinery is ~21 KB gzip. It is only needed the moment
 *           someone opens a menu, so the header (present on every page) mounts a plain button and
 *           loads the real menu on first hover, focus or click.
 *           The first click still opens the menu: the click arms the chunk AND sets the open flag,
 *           so the menu appears as soon as the component mounts (LAW-13: no dead first tap).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { lazy, Suspense, useState, type ReactNode } from 'react';
import type { DropdownMenuProps, MenuItem } from './DropdownMenu';

const DropdownMenu = lazy(async () => ({ default: (await import('./DropdownMenu')).DropdownMenu }));

/** Props for the lazy menu. */
export interface LazyDropdownMenuProps {
  readonly trigger: ReactNode;
  readonly items: readonly (MenuItem | { readonly separator: true })[];
  readonly label?: string | undefined;
  readonly align?: DropdownMenuProps['align'];
  readonly groupLabel?: string | undefined;
}

/**
 * Renders a menu whose implementation loads on first interaction.
 * @param props component props
 * @returns a trigger, upgraded to a real menu after the first interaction
 */
export function LazyDropdownMenu({
  trigger,
  items,
  label,
  align,
  groupLabel,
}: LazyDropdownMenuProps): ReactNode {
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);

  const arm = (): void => setArmed(true);

  const plain = (
    <span
      onPointerEnter={arm}
      onFocus={arm}
      onClick={(): void => {
        setArmed(true);
        setOpen(true);
      }}
      onKeyDown={(event): void => {
        if (event.key === 'Enter' || event.key === ' ') {
          setArmed(true);
          setOpen(true);
        }
      }}
    >
      {trigger}
    </span>
  );

  if (!armed) return plain;

  return (
    <Suspense fallback={plain}>
      <DropdownMenu
        trigger={trigger}
        items={items}
        open={open}
        onOpenChange={(next: boolean): void => setOpen(next)}
        {...(label !== undefined ? { label } : {})}
        {...(align !== undefined ? { align } : {})}
        {...(groupLabel !== undefined ? { groupLabel } : {})}
      />
    </Suspense>
  );
}

export type { MenuItem };
