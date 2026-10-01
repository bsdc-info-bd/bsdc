import type { ReactNode } from 'react';
import { Logo } from '@/design-system';

export interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Centred, narrow card shared by every authentication screen. */
export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="fab-container flex justify-center py-8 sm:py-12">
      <div className="w-full max-w-md">
        <div className="mb-5 flex justify-center">
          <Logo variant="full" className="h-10" title={title} />
        </div>
        <div className="rounded-card border border-border bg-surface p-4 shadow-card sm:p-6">
          <h1 className="text-2xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
          <div className="mt-5">{children}</div>
        </div>
        {footer ? <div className="mt-4 text-center text-sm text-muted">{footer}</div> : null}
      </div>
    </div>
  );
}
