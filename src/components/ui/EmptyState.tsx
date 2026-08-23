/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)} role="status">
      <div className="mb-5 text-brand-600/70 dark:text-brand-400/70">
        {icon || <EmptyIllustration />}
      </div>
      <h3 className="text-base font-bold sm:text-lg">{title}</h3>
      {body ? <p className="mt-1.5 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function EmptyIllustration({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" role="img" aria-label="Empty state illustration">
      <rect x="12" y="20" width="72" height="56" rx="8" className="fill-brand-50 dark:fill-brand-950/40" />
      <rect x="12" y="20" width="72" height="56" rx="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M12 32h72" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <circle cx="20" cy="26" r="2" fill="currentColor" fillOpacity="0.4" />
      <circle cx="27" cy="26" r="2" fill="currentColor" fillOpacity="0.4" />
      <path
        d="M34 48h28M34 56h18"
        stroke="currentColor"
        strokeOpacity="0.4"
        strokeWidth="3"
        strokeLinecap="round"
        className="bsdc-animate-fade-in"
      />
      <path d="M74 12l8 8-22 22-10 2 2-10 22-22z" className="fill-brand-100 dark:fill-brand-900" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center" role="alert">
      <svg width="96" height="96" viewBox="0 0 96 96" fill="none" role="img" aria-label="Error illustration" className="mb-4 text-red-400">
        <circle cx="48" cy="48" r="34" stroke="currentColor" strokeWidth="3" className="fill-red-50 dark:fill-red-950/30" />
        <path d="M48 30v22" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <circle cx="48" cy="63" r="2.6" fill="currentColor" />
      </svg>
      <h3 className="text-base font-bold sm:text-lg">Something went wrong</h3>
      <p className="mt-1.5 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="bsdc-tap mt-5 inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function NotFoundState() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <svg width="140" height="96" viewBox="0 0 140 96" fill="none" role="img" aria-label="404 illustration" className="mb-6">
        <text x="70" y="58" textAnchor="middle" className="fill-brand-600 dark:fill-brand-400" fontSize="40" fontWeight="800" fontFamily="Inter, sans-serif">404</text>
        <path d="M20 80c18-10 30 6 46-2s28-12 54-4" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" strokeLinecap="round" />
        <circle cx="26" cy="20" r="4" className="fill-fb-500" />
        <circle cx="116" cy="24" r="3" className="fill-accent-teal" />
      </svg>
      <h1 className="text-xl font-bold sm:text-2xl">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
        The page you are looking for does not exist or has moved.
      </p>
      <Link
        to="/"
        className="bsdc-tap mt-6 inline-flex items-center justify-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Back to home
      </Link>
    </div>
  );
}
