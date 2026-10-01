import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Long-form text container with readable measure, used by static pages today
 * and by the markdown renderer from Response 4 onwards.
 */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'max-w-[72ch] space-y-3 text-base leading-relaxed text-text',
        '[&_a]:text-blue [&_a]:underline [&_a]:underline-offset-2',
        '[&_h2]:mt-6 [&_h2]:text-xl [&_h3]:mt-4 [&_h3]:text-lg',
        '[&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold',
        className,
      )}
    >
      {children}
    </div>
  );
}
