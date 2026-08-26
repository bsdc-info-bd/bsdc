/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import type { ReactNode } from 'react';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

export const Dropdown = DropdownPrimitive.Root;
export const DropdownTrigger = DropdownPrimitive.Trigger;

export function DropdownContent({
  children,
  align = 'end',
  className,
}: {
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn(
          'bsdc-animate-fade-in z-50 min-w-52 overflow-hidden rounded-xl border border-surface-light-border bg-white p-1.5 shadow-raised',
          'dark:border-surface-dark-border dark:bg-surface-dark-raised',
          className,
        )}
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  );
}

export function DropdownItem({
  children,
  onSelect,
  danger,
  disabled,
  icon,
  className,
}: {
  children: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <DropdownPrimitive.Item
      asChild
      onSelect={(e) => {
        e.preventDefault();
        onSelect?.();
      }}
      disabled={disabled}
    >
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none transition-colors',
          'data-[highlighted]:bg-neutral-100 dark:data-[highlighted]:bg-surface-dark',
          danger ? 'text-red-600 dark:text-red-400' : 'text-neutral-700 dark:text-neutral-200',
          disabled && 'pointer-events-none opacity-50',
          className,
        )}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{children}</span>
      </button>
    </DropdownPrimitive.Item>
  );
}

export function DropdownSeparator() {
  return <DropdownPrimitive.Separator className="my-1.5 h-px bg-surface-light-border dark:bg-surface-dark-border" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <DropdownPrimitive.Label className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">{children}</DropdownPrimitive.Label>;
}
