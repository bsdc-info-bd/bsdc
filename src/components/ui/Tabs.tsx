/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import type { ReactNode } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.List
      className={cn(
        'bsdc-scroll-x -mx-1 flex shrink-0 gap-1 overflow-x-auto px-1 pb-px',
        className,
      )}
    >
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({
  value,
  children,
  icon,
  className,
}: {
  value: string;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={cn(
        'bsdc-tap inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-surface-dark-raised dark:hover:text-neutral-200',
        'data-[state=active]:bg-brand-50 data-[state=active]:text-brand-700 dark:data-[state=active]:bg-brand-950/60 dark:data-[state=active]:text-brand-300',
        className,
      )}
    >
      {icon}
      {children}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.Content value={value} className={cn('mt-4 min-w-0 focus-visible:outline-none', className)}>
      {children}
    </TabsPrimitive.Content>
  );
}
