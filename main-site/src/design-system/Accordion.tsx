import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface AccordionItemProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

/** Native disclosure semantics: works without JavaScript and with a screen reader. */
export function AccordionItem({
  title,
  children,
  defaultOpen = false,
  className,
}: AccordionItemProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn('border-b border-border last:border-0', className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="fab-tap flex w-full items-center justify-between gap-2 py-3 text-start text-sm font-semibold"
      >
        <span className="min-w-0">{title}</span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={cn(
            'shrink-0 transition-transform duration-150 ease-app',
            open && 'rotate-180',
          )}
        />
      </button>
      {open ? <div className="pb-3 text-sm text-muted">{children}</div> : null}
    </div>
  );
}
