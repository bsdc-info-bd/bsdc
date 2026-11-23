import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ListHeroProps {
  /** Small eyebrow label above the title, e.g. the section name. */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Icon shown in a frosted tile beside the title. */
  icon?: ReactNode;
  /** Primary and secondary actions, rendered under the copy. */
  actions?: ReactNode;
  /** Optional row of compact stats or filters rendered under the actions. */
  footer?: ReactNode;
  className?: string;
}

/**
 * Gradient header shared by the list pages (jobs, gigs, projects).
 * Decorative only — no motion, so reduced-motion needs no special handling.
 */
export function ListHero({
  eyebrow,
  title,
  description,
  icon,
  actions,
  footer,
  className,
}: ListHeroProps) {
  return (
    <header
      className={cn(
        'relative mb-6 overflow-hidden rounded-3xl bsdc-hero p-5 shadow-lg sm:p-8',
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-on-hero/10 blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-green-300/20 blur-3xl"
      />
      <div className="relative flex flex-wrap items-start gap-4">
        {icon !== undefined ? (
          <span
            aria-hidden="true"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-on-hero/15 ring-1 ring-on-hero/25 backdrop-blur"
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          {eyebrow !== undefined ? (
            <p className="text-xs font-semibold uppercase tracking-wider text-on-hero/75">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {description !== undefined ? (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-on-hero/90">{description}</p>
          ) : null}
        </div>
      </div>
      {actions !== undefined ? (
        <div className="relative mt-5 flex flex-wrap gap-2">{actions}</div>
      ) : null}
      {footer !== undefined ? <div className="relative mt-5">{footer}</div> : null}
    </header>
  );
}
