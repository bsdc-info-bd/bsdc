/**
 * BSDC — src/shared/ui/DropdownMenu.tsx
 * Purpose : Action menus for posts, comments, chats and admin tables (PART 08.09).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Destructive items are colour-coded AND icon-prefixed so meaning never depends on
 *           colour alone (LAW-14). Disabled actions are hidden with a tooltip elsewhere in the
 *           admin panel; here they are disabled only when the reason is obvious.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import * as MenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/shared/lib/cn';
import { Icon, type IconProps } from './Icon';

/** A menu item definition. */
export interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconProps['name'] | undefined;
  readonly onSelect?: () => void;
  readonly tone?: ('default' | 'danger') | undefined;
  readonly disabled?: boolean | undefined;
  readonly shortcut?: string | undefined;
}

/** Props for the DropdownMenu component. */
export interface DropdownMenuProps {
  /** Trigger element. Must be a single element that accepts a ref. */
  readonly trigger: ReactNode;
  readonly items: readonly (MenuItem | { readonly separator: true })[];
  readonly label?: string | undefined;
  readonly align?: ('start' | 'center' | 'end') | undefined;
  readonly groupLabel?: string | undefined;
  /** Controlled open state; omit to let the menu manage itself. */
  readonly open?: boolean | undefined;
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
}

/**
 * Renders a dropdown menu.
 * @param props component props
 * @returns a menu element
 */
export function DropdownMenu({
  trigger,
  items,
  label = 'Actions',
  align = 'end',
  groupLabel,
  open,
  onOpenChange,
}: DropdownMenuProps): React.ReactElement {
  return (
    <MenuPrimitive.Root
      {...(open !== undefined ? { open } : {})}
      {...(onOpenChange !== undefined ? { onOpenChange } : {})}
    >
      <MenuPrimitive.Trigger asChild aria-label={label}>
        {trigger}
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Content
          className="bsdc-menu__content"
          align="end"
          alignOffset={0}
          sideOffset={6}
          data-align={align}
        >
          {groupLabel !== undefined && <div className="bsdc-menu__label">{groupLabel}</div>}
          {items.map((item, index) =>
            'separator' in item ? (
              <MenuPrimitive.Separator
                key={`separator-${index}`}
                className="bsdc-menu__separator"
              />
            ) : (
              <MenuPrimitive.Item
                key={item.id}
                className="bsdc-menu__item"
                data-tone={item.tone ?? 'default'}
                {...(item.disabled !== undefined ? { disabled: item.disabled } : {})}
                {...(item.onSelect !== undefined ? { onSelect: item.onSelect } : {})}
              >
                {item.icon !== undefined && <Icon name={item.icon} size={16} />}
                <span>{item.label}</span>
                {item.shortcut !== undefined && (
                  <span className="bsdc-menu__shortcut">{item.shortcut}</span>
                )}
              </MenuPrimitive.Item>
            ),
          )}
        </MenuPrimitive.Content>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

/**
 * Renders a labelled menu group wrapper for reuse inside composite menus.
 * @param label group label
 * @param children menu items
 * @returns a menu group
 */
export function MenuGroup({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): React.ReactElement {
  return (
    <MenuPrimitive.Group className={cn('bsdc-menu__group')}>
      <div className="bsdc-menu__label">{label}</div>
      {children}
    </MenuPrimitive.Group>
  );
}
