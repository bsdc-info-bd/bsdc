import { useEffect, useState, type ReactElement } from 'react';
import {
  DEFAULT_FRESHNESS,
  describeAge,
  freshnessNotice,
  freshnessOf,
  type FreshnessPolicy,
} from '../domain/freshness';

/**
 * "Read 4 min ago", and a banner when that is too long ago.
 *
 * The tick is deliberate rather than incidental: a timestamp rendered once and
 * never updated is a lie that gets worse with time, and an operator glancing at
 * a console left open since this morning would read "just now". A one-second
 * interval is far too often for a label, so it advances on the cadence the
 * wording actually changes at.
 */
export function FreshnessBadge({
  at,
  policy = DEFAULT_FRESHNESS,
  label = 'Read',
}: {
  readonly at: number | null | undefined;
  readonly policy?: FreshnessPolicy;
  readonly label?: string;
}): ReactElement {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Re-render on the boundary the text changes at, not every second: at most
    // four times a minute for a fresh reading, once a minute after that.
    const interval = setInterval(
      () => {
        const current = Date.now();
        setNow((previous) => {
          const age = current - previous;
          // Only update state when the displayed string would actually change.
          const bucketBefore = Math.floor(previous / 30_000);
          const bucketNow = Math.floor(current / 30_000);
          return age >= 30_000 && bucketBefore !== bucketNow ? current : previous;
        });
      },
      10_000,
    );
    return () => clearInterval(interval);
  }, []);

  const freshness = freshnessOf(at, now, policy);
  if (freshness.ageMs === null) {
    return <span className="kit-fresh kit-fresh--unknown">Age unknown</span>;
  }
  return (
    <span
      className={`kit-fresh kit-fresh--${freshness.band}`}
      title={`Read at ${new Date(at ?? 0).toLocaleString()}`}
    >
      <span className="kit-fresh-dot" aria-hidden="true" />
      {label} {describeAge(freshness.ageMs)}
    </span>
  );
}

/**
 * The banner a panel shows when its data has aged out.
 *
 * Separated from the badge because a panel may show one without the other: a
 * small KPI row has room for the badge, a full queue needs the sentence.
 */
export function FreshnessNotice({
  at,
  policy = DEFAULT_FRESHNESS,
  onRefresh,
}: {
  readonly at: number | null | undefined;
  readonly policy?: FreshnessPolicy;
  readonly onRefresh?: (() => void) | undefined;
}): ReactElement | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const notice = freshnessNotice(freshnessOf(at, now, policy));
  if (notice === null) return null;
  return (
    <div className="kit-fresh-notice" role="status">
      <span>{notice}</span>
      {onRefresh !== undefined && (
        <button type="button" className="kit-btn kit-btn--small kit-btn--quiet" onClick={onRefresh}>
          Refresh
        </button>
      )}
    </div>
  );
}
