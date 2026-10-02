import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps {
  tone?: AlertTone;
  title: string;
  children?: ReactNode;
  className?: string;
}

const TONES: Record<AlertTone, { wrapper: string; icon: ReactNode }> = {
  info: { wrapper: 'border-blue/30 bg-blue-soft text-text', icon: <Info size={18} /> },
  success: {
    wrapper: 'border-green-300/50 bg-surface-2 text-text',
    icon: <CheckCircle2 size={18} />,
  },
  warning: { wrapper: 'border-warn/40 bg-warn/10 text-text', icon: <AlertTriangle size={18} /> },
  danger: { wrapper: 'border-danger/40 bg-danger/10 text-text', icon: <OctagonAlert size={18} /> },
};

export function Alert({ tone = 'info', title, children, className }: AlertProps) {
  const config = TONES[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-2 rounded-card border p-3', config.wrapper, className)}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        {config.icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
      </div>
    </div>
  );
}
