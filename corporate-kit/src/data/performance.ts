import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import type { CorporateEnv } from './env';

/** A single anonymous observation: no UID, query string, code or error message. */
export function corporateVitalPayload(
  app: string,
  metric: Pick<Metric, 'name' | 'value'>,
  width: number,
  coarse: boolean,
  build = '',
): Record<string, string | number> | null {
  if (!['LCP', 'INP', 'CLS', 'FCP', 'TTFB'].includes(metric.name)) return null;
  if (!Number.isFinite(metric.value) || metric.value < 0) return null;
  if (metric.name === 'CLS' ? metric.value > 10 : metric.value > 600000) return null;
  return {
    p_app: app,
    // These are single-page consoles. Never transmit a query or document code.
    p_route: '/',
    p_metric: metric.name,
    p_value: metric.value,
    p_device: width < 600 ? 'mobile' : width < 1024 && coarse ? 'tablet' : 'desktop',
    p_connection: '',
    p_build: build.slice(0, 40),
  };
}

export function privacyOptOut(nav: {
  readonly doNotTrack?: string | null;
  readonly globalPrivacyControl?: boolean;
}): boolean {
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

const started = new Set<string>();

/**
 * Collect standard Web Vitals from each deployed console. These are anonymous
 * best-effort beacons; blocked requests and unsupported APIs stay as gaps. DNT,
 * GPC and VITE_CORPORATE_VITALS=false disable collection before any observer.
 */
export function startCorporatePerformance(env: CorporateEnv): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (!env.supabase.url || !env.supabase.publishableKey || privacyOptOut(navigator)) return;
  if ((import.meta.env as Record<string, string | undefined>)['VITE_CORPORATE_VITALS'] === 'false')
    return;
  if (started.has(env.appId)) return;
  started.add(env.appId);

  const report = (metric: Metric): void => {
    const build = (import.meta.env as Record<string, string | undefined>)['VITE_BUILD_SHA'] ?? '';
    const payload = corporateVitalPayload(
      env.appId,
      metric,
      window.innerWidth,
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
      build,
    );
    if (!payload) return;
    const key = env.supabase.publishableKey;
    const headers: Record<string, string> = { apikey: key, 'content-type': 'application/json' };
    // New publishable keys are API keys, not JWT bearer tokens.
    if (!key.startsWith('sb_publishable_')) headers['authorization'] = `Bearer ${key}`;
    try {
      void fetch(`${env.supabase.url.replace(/\/+$/, '')}/rest/v1/rpc/record_vital`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      // Measurements must never interrupt a console.
    }
  };
  for (const observe of [onCLS, onFCP, onINP, onLCP, onTTFB]) {
    try {
      observe(report);
    } catch {
      /* Unsupported browser: this metric remains absent. */
    }
  }
}
