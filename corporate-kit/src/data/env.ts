/**
 * Public runtime configuration shared by every corporate application.
 *
 * Corporate apps authenticate against the `bsdc-second` Firebase project,
 * which is deliberately separate from the member-facing `bsdc-bd` project: a
 * compromised member session can never become a staff session. Only VITE_*
 * values appear here, because everything in this file ships to the browser.
 */
export type CorporateEnv = {
  readonly appId: string;
  readonly appName: string;
  readonly siteUrl: string;
  readonly firebase: {
    readonly apiKey: string;
    readonly authDomain: string;
    readonly projectId: string;
    readonly appId: string;
    readonly databaseURL: string;
  };
  readonly supabase: {
    readonly url: string;
    readonly publishableKey: string;
  };
};

type ViteEnv = Record<string, string | undefined>;

function read(key: string): string {
  const source = import.meta.env as unknown as ViteEnv;
  return source[key] ?? '';
}

/**
 * Builds the environment for one app. `appId` is sent as a request header so
 * the audit trail records which console an action came from.
 */
export function readEnv(appId: string, appName: string): CorporateEnv {
  return {
    appId,
    appName,
    siteUrl: read('VITE_SITE_URL') || 'https://www.bsdc.info.bd',
    firebase: {
      apiKey: read('VITE_FB2_API_KEY'),
      authDomain: read('VITE_FB2_AUTH_DOMAIN'),
      projectId: read('VITE_FB2_PROJECT_ID'),
      appId: read('VITE_FB2_APP_ID'),
      databaseURL: read('VITE_FB2_DATABASE_URL'),
    },
    supabase: {
      url: read('VITE_SUPABASE_URL'),
      publishableKey: read('VITE_SUPABASE_PUBLISHABLE_KEY'),
    },
  };
}

/** What is missing, so a misconfigured deployment says so instead of failing silently. */
export function missingConfig(env: CorporateEnv): readonly string[] {
  const missing: string[] = [];
  if (!env.firebase.apiKey) missing.push('VITE_FB2_API_KEY');
  if (!env.firebase.authDomain) missing.push('VITE_FB2_AUTH_DOMAIN');
  if (!env.firebase.projectId) missing.push('VITE_FB2_PROJECT_ID');
  if (!env.firebase.appId) missing.push('VITE_FB2_APP_ID');
  if (!env.supabase.url) missing.push('VITE_SUPABASE_URL');
  if (!env.supabase.publishableKey) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');
  return missing;
}
