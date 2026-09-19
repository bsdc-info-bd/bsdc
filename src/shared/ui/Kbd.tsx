/**
 * BSDC — src/shared/ui/Kbd.tsx
 * Purpose : Keyboard-shortcut hint (PART 08.09, F-214).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Rendered inside tooltips, menus and the shortcut help overlay. Never used as the only
 *           affordance: every shortcut has a reachable control.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * Renders a key hint.
 * @param props component props
 * @returns a kbd element
 */
export function Kbd({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string | undefined;
}): React.ReactElement {
  return (
    <kbd
      className={cn(
        'inline-flex min-h-[20px] items-center rounded-[var(--radius-xs)] border border-line',
        'bg-surface-2 px-[6px] font-mono text-2xs font-semibold text-ink-2',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
