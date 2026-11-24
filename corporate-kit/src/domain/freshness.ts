/**
 * How old is what you are looking at?
 *
 * A console that shows a number without saying when that number was true is
 * worse than a console that shows nothing, because it invites a decision. Every
 * read in this suite therefore carries the moment it was fetched, and this
 * module turns two timestamps into the answer an operator actually needs:
 * *is this fresh enough to act on?*
 *
 * Two things here are less obvious than they look.
 *
 * The first is clock skew. The timestamp comes from Postgres (or from the
 * browser, depending on the read), and the "now" comes from the operator's
 * laptop. A laptop four minutes fast makes every reading look four minutes
 * old; a laptop four minutes slow makes them look like they come from the
 * future. Treating the second case as "0 seconds ago" would be a lie in the
 * safe direction, so a future timestamp beyond the tolerance is reported as
 * `unknown` instead — an operator who sees "unknown" refreshes, which is the
 * right response, whereas an operator who sees "just now" does not.
 *
 * The second is that the bands are a policy, not a constant. The moderation
 * queue is stale in ninety seconds; a quarterly compliance report is fresh for
 * a day. Passing the policy in keeps this module honest about that.
 */

/** A reading is never considered "from the future" within this tolerance. */
const SKEW_TOLERANCE_MS = 60_000;

/** The boundary between each band, in milliseconds of age. */
export type FreshnessPolicy = {
  /** At or below this, the reading is live: no badge is needed. */
  readonly liveMs: number;
  /** At or below this, the reading is fresh: shown with a quiet timestamp. */
  readonly freshMs: number;
  /** At or below this, the reading is aging: shown with a warning tone. */
  readonly agingMs: number;
};

/**
 * Sensible defaults for an operational screen: a queue is live to 30s, fresh to
 * five minutes, and worth a warning after half an hour.
 */
export const DEFAULT_FRESHNESS: FreshnessPolicy = {
  liveMs: 30_000,
  freshMs: 5 * 60_000,
  agingMs: 30 * 60_000,
};

/** A slower policy for documents and reports, where minutes do not matter. */
export const RELAXED_FRESHNESS: FreshnessPolicy = {
  liveMs: 5 * 60_000,
  freshMs: 60 * 60_000,
  agingMs: 24 * 60 * 60_000,
};

export type Staleness = 'live' | 'fresh' | 'aging' | 'stale' | 'unknown';

export type Freshness = {
  /** Milliseconds since the reading was taken, or null when either time is unusable. */
  readonly ageMs: number | null;
  readonly band: Staleness;
  /** True when the timestamp is ahead of the clock by more than the tolerance. */
  readonly skewed: boolean;
};

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Age of a reading, in milliseconds, never negative.
 *
 * Returns null when the timestamp is unparseable — a console must never render
 * "NaN seconds ago", and it must never pretend an unknown age is zero.
 */
export function ageOf(at: number | Date | null | undefined, now: number): number | null {
  if (at === null || at === undefined) return null;
  const moment = at instanceof Date ? at.getTime() : finiteOrNull(at);
  if (moment === null) return null;
  const current = finiteOrNull(now);
  if (current === null) return null;
  return Math.max(0, current - moment);
}

/**
 * The band a reading falls into, with clock skew called out rather than hidden.
 *
 * A timestamp more than a minute in the future is not "live"; it means one of
 * the two clocks is wrong, and the console says so.
 */
export function freshnessOf(
  at: number | Date | null | undefined,
  now: number,
  policy: FreshnessPolicy = DEFAULT_FRESHNESS,
): Freshness {
  if (at === null || at === undefined) return { ageMs: null, band: 'unknown', skewed: false };
  const moment = at instanceof Date ? at.getTime() : finiteOrNull(at);
  if (moment === null) return { ageMs: null, band: 'unknown', skewed: false };
  const current = finiteOrNull(now);
  if (current === null) return { ageMs: null, band: 'unknown', skewed: false };

  const raw = current - moment;
  if (raw < -SKEW_TOLERANCE_MS) {
    return { ageMs: Math.abs(raw), band: 'unknown', skewed: true };
  }
  // A timestamp slightly ahead of the clock is normal (a request that took a
  // moment, a server a few seconds ahead) and is reported as zero rather than
  // as a future reading.
  const age = Math.max(0, raw);
  return { ageMs: age, band: bandOf(age, policy), skewed: false };
}

/** The band for an age that is already known. */
export function bandOf(ageMs: number, policy: FreshnessPolicy = DEFAULT_FRESHNESS): Staleness {
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'unknown';
  if (ageMs <= policy.liveMs) return 'live';
  if (ageMs <= policy.freshMs) return 'fresh';
  if (ageMs <= policy.agingMs) return 'aging';
  return 'stale';
}

/**
 * A short, honest phrase for an age.
 *
 * Deliberately coarse: an operator does not need "7,412 milliseconds", and a
 * number that changes every second draws the eye away from the data. The
 * precise figure is available to a `title` or a tooltip, which is where a
 * reader who wants it will look.
 */
export function describeAge(ageMs: number | null): string {
  if (ageMs === null || !Number.isFinite(ageMs) || ageMs < 0) return 'at an unknown time';
  if (ageMs < 5_000) return 'just now';
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1_000)}s ago`;
  if (ageMs < 3_600_000) {
    const minutes = Math.floor(ageMs / 60_000);
    return minutes === 1 ? '1 min ago' : `${minutes} min ago`;
  }
  if (ageMs < 86_400_000) {
    const hours = Math.floor(ageMs / 3_600_000);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  const days = Math.floor(ageMs / 86_400_000);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

/**
 * The sentence a panel shows when its data is old enough to matter.
 *
 * Returns null while the reading is fresh, so a caller can render nothing
 * rather than an empty banner.
 */
export function freshnessNotice(freshness: Freshness): string | null {
  if (freshness.band === 'live') return null;
  if (freshness.band === 'fresh') return null;
  if (freshness.band === 'unknown') {
    return freshness.skewed
      ? 'The timestamp on this panel is ahead of your clock, so its age cannot be trusted. Refresh to re-read it.'
      : 'This panel does not know when its data was read. Refresh to find out.';
  }
  const age = describeAge(freshness.ageMs);
  if (freshness.band === 'aging') {
    return `This data is ${age}. Refresh before acting on it.`;
  }
  // Stale is the band where a whole banner is warranted, because the operator
  // is now looking at something that may have stopped being true.
  return `This data is ${age} and may no longer be correct. Refresh before making a decision.`;
}

/**
 * How often a live panel should re-read, given its policy.
 *
 * Half the live window, clamped: often enough that the badge rarely leaves
 * "live", rare enough that a console left open overnight is not making a
 * request a second. Returns null for a panel that should not poll at all.
 */
export function refreshIntervalFor(
  policy: FreshnessPolicy = DEFAULT_FRESHNESS,
  options: { readonly poll?: boolean } = {},
): number | null {
  if (options.poll === false) return null;
  if (!Number.isFinite(policy.liveMs) || policy.liveMs <= 0) return null;
  return Math.max(5_000, Math.min(120_000, Math.floor(policy.liveMs / 2)));
}
