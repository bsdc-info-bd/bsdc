import { CheckCircle2, CircleAlert, CircleX, MinusCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';
import type { CheckResult, CheckState } from '@/lib/diagnostics/checks';

/**
 * One line of the system report.
 *
 * A check that failed and a check that passed look different at a glance, and
 * neither of them is a colour alone: the icon carries the meaning and the state
 * is written next to it, because colour blindness is not an edge case in a
 * platform whose audience is software developers.
 */
export function HealthCheckCard({ check }: { check: CheckResult }) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border px-3 py-2.5',
        check.state === 'fail' && 'border-danger/40 bg-danger/5',
        check.state === 'warn' && 'border-warn/40 bg-warn/5',
        check.state === 'ok' && 'border-border bg-surface',
        check.state === 'skipped' && 'border-border bg-surface-2',
      )}
    >
      <span className="mt-0.5 shrink-0">{iconFor(check.state)}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <span>{check.label}</span>
          <span className="text-2xs font-normal uppercase tracking-wide text-muted">
            {t(`diagnostics.state.${check.state}`)}
          </span>
          {check.ms !== undefined ? (
            <span className="text-2xs font-normal text-muted">{check.ms} ms</span>
          ) : null}
        </p>
        <p className="mt-0.5 break-words text-xs text-muted">{check.detail}</p>
      </div>
    </div>
  );
}

function iconFor(state: CheckState) {
  if (state === 'ok') return <CheckCircle2 aria-hidden className="size-4 text-green-700" />;
  if (state === 'warn') return <CircleAlert aria-hidden className="size-4 text-warn" />;
  if (state === 'fail') return <CircleX aria-hidden className="size-4 text-danger" />;
  return <MinusCircle aria-hidden className="size-4 text-muted" />;
}
