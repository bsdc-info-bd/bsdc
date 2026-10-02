/**
 * Field measurement, collected in the browser.
 *
 * Three principles, and they are why this is written by hand rather than
 * pulled from a package:
 *
 *   1. It measures the page, never the person. Nothing identifying is
 *      collected — no identifier, no session, no referrer, no screen size
 *      fingerprint. The route is reduced to its pattern before it leaves
 *      the device, so `/p/a-private-draft-slug` never reaches a server log.
 *   2. It costs the visitor nothing. Measurements are buffered and sent once,
 *      on the browser's own "the page is going away" signal, with
 *      `sendBeacon` so the request cannot delay a navigation.
 *   3. It is silent. A beacon that fails is forgotten. Reporting that the
 *      reporting failed is how a performance tool becomes a performance
 *      problem.
 */

export const VITALS = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const;
export type Vital = (typeof VITALS)[number];

export interface Measurement {
  readonly route: string;
  readonly metric: Vital;
  readonly value: number;
  readonly device: 'mobile' | 'tablet' | 'desktop';
  readonly connection: string;
  readonly build: string;
}

/**
 * The same reduction `bsdc.route_pattern()` performs in SQL. It runs here
 * as well so the identifier never leaves the device — the database copy is
 * a second line of defence, not the first.
 */
export function routePattern(path: string): string {
  const withoutQuery = (path ?? '/').split('#')[0]?.split('?')[0] ?? '/';
  const lowered = withoutQuery.toLowerCase().replace(/\/+$/, '');
  const pattern = lowered
    .replace(/\/@[^/]+/g, '/@:username')
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '/:id')
    .replace(/^\/(p|g|shop|learn|jobs|events|freelance|projects|messages|tag)\/[^/]+/, '/$1/:slug')
    .replace(/\/\d{2,}/g, '/:n');
  return pattern === '' ? '/' : pattern;
}

/** Phone, tablet or desktop, from the coarsest signal available. */
export function deviceKind(width: number, pointerCoarse: boolean): Measurement['device'] {
  if (width < 600) return 'mobile';
  if (width < 1024 && pointerCoarse) return 'tablet';
  return 'desktop';
}

/** A measurement nobody should believe is dropped rather than stored. */
export function isPlausible(metric: string, value: number): boolean {
  if (!(VITALS as readonly string[]).includes(metric)) return false;
  if (!Number.isFinite(value) || value < 0) return false;
  if (metric === 'CLS') return value <= 10;
  // Ten minutes. Anything beyond it is a laptop that was asleep.
  return value <= 600_000;
}

/**
 * A stable name for a fault, so a hundred copies of one broken component
 * are one row. Line numbers and identifiers are stripped before hashing:
 * the same bug in two builds must land on the same fingerprint, or the
 * board resets itself at every deploy.
 */
export function errorFingerprint(name: string, message: string, route: string): string {
  const normalised = `${name}|${message}`
    .replace(/https?:\/\/\S+/g, 'url')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'id')
    .replace(/\d+/g, 'n')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  const subject = `${normalised}@${routePattern(route)}`;
  // FNV-1a, 32 bits, written out because a dependency for eight lines of
  // arithmetic is a dependency to audit for ever.
  let hash = 0x811c9dc5;
  for (let index = 0; index < subject.length; index += 1) {
    hash ^= subject.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export interface ErrorReport {
  readonly fingerprint: string;
  readonly name: string;
  readonly message: string;
  readonly route: string;
  readonly build: string;
}

export interface Payload {
  readonly measurements: readonly Measurement[];
  readonly errors: readonly ErrorReport[];
}

/** Everything the endpoint accepts, and nothing it does not. */
export function buildPayload(
  measurements: readonly Measurement[],
  errors: readonly ErrorReport[],
): Payload {
  return {
    measurements: measurements
      .filter((item) => isPlausible(item.metric, item.value))
      .map((item) => ({
        ...item,
        route: routePattern(item.route),
        value: Math.round(item.value * 1000) / 1000,
      }))
      .slice(0, 20),
    errors: errors.slice(0, 10),
  };
}

export interface Reporter {
  readonly add: (metric: Vital, value: number) => void;
  readonly addError: (name: string, message: string) => void;
  readonly flush: () => boolean;
  readonly size: () => number;
}

export interface ReporterOptions {
  readonly endpoint?: string;
  readonly build?: string;
  readonly route: () => string;
  readonly device: () => Measurement['device'];
  readonly connection: () => string;
  readonly send: (endpoint: string, body: string) => boolean;
}

/**
 * The buffer. It is a plain object rather than a class so it can be driven
 * from a test without a DOM, which is the only way this code can be held to
 * its own rules.
 */
export function createReporter(options: ReporterOptions): Reporter {
  const endpoint = options.endpoint ?? '/api/vitals';
  const build = options.build ?? '';
  const measurements: Measurement[] = [];
  const errors: ErrorReport[] = [];
  const seenMetrics = new Set<string>();
  const seenErrors = new Set<string>();

  return {
    add(metric, value) {
      if (!isPlausible(metric, value)) return;
      const route = routePattern(options.route());
      const key = `${route}|${metric}`;
      // One reading per metric per page view: the last one is the one that
      // counts, so a later value replaces an earlier one rather than
      // being added beside it.
      const existing = measurements.findIndex((item) => `${item.route}|${item.metric}` === key);
      const entry: Measurement = {
        route,
        metric,
        value,
        device: options.device(),
        connection: options.connection(),
        build,
      };
      if (existing >= 0) measurements[existing] = entry;
      else measurements.push(entry);
      seenMetrics.add(key);
    },

    addError(name, message) {
      const route = routePattern(options.route());
      const fingerprint = errorFingerprint(name, message, route);
      if (seenErrors.has(fingerprint)) return;
      seenErrors.add(fingerprint);
      errors.push({ fingerprint, name, message: message.slice(0, 300), route, build });
    },

    flush() {
      if (measurements.length === 0 && errors.length === 0) return false;
      const payload = buildPayload(measurements, errors);
      const sent = options.send(endpoint, JSON.stringify(payload));
      measurements.length = 0;
      errors.length = 0;
      return sent;
    },

    size() {
      return measurements.length + errors.length;
    },
  };
}
