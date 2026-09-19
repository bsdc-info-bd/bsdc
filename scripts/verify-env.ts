/**
 * BSDC — scripts/verify-env.ts
 * Purpose : Environment guard run before every build (PART 06.01).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   :
 *   1. Fails the build when a variable that must never reach the client is prefixed VITE_, or is
 *      present in an environment that will be bundled (ADR-014: secrets live in Firebase
 *      Functions configuration, never in the bundle). This check is absolute; it never degrades.
 *   2. Treats the Firebase *public* configuration as required-for-remote-backend. When it is
 *      absent the build still succeeds, loudly, in device-local mode: the platform is designed to
 *      run on a device without a network (ADR-019), and a preview build must be reproducible from
 *      a bare clone with no secrets at all. Set BSDC_REQUIRE_REMOTE_ENV=true in the deployment
 *      pipeline to turn the same check back into a hard failure for production releases.
 *   3. Warns when an optional integration key is absent; the feature degrades instead of breaking.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { readFileSync } from 'node:fs';

/** Variables needed before the client can talk to Firebase at all. */
const REMOTE_PUBLIC = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

/** Variables that must NEVER be exposed to the browser. */
const FORBIDDEN_CLIENT = [
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'FIREBASE_ADMIN_PRIVATE_KEY',
  'ADMIN_ROOT_PASSKEY_HASH',
  'ADMIN_PASSKEY_PEPPER',
  'ADS_ACCESS_PEPPER',
  'PLUGIN_PASSKEY',
  'VENDOR_REVIEW_PASSKEY',
  'CLOUDINARY_API_SECRET',
  'ONESIGNAL_REST_API_KEY',
  'BKASH_APP_SECRET',
  'REPORT_SIGNING_KEY',
  'LICENSE_SIGNING_KEY',
  'GITHUB_TOKEN',
] as const;

/** Optional integrations that degrade gracefully when absent. */
const OPTIONAL = [
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_FIREBASE_MEASUREMENT_ID',
  'VITE_FIREBASE_VAPID_KEY',
  'VITE_FIREBASE_APP_CHECK_SITE_KEY',
  'VITE_CLOUDINARY_CLOUD_NAME',
  'VITE_CLOUDINARY_API_KEY',
  'VITE_CLOUDINARY_UNSIGNED_PRESET',
  'VITE_IMGBB_API_KEY',
  'VITE_ONESIGNAL_APP_ID',
  'VITE_APP_LAUNCH_DATE',
  'VITE_ANALYTICS_ENABLED',
  'VITE_ENABLE_INDEXNOW',
] as const;

/** When "true", a missing remote-backend variable fails the build instead of warning. */
const REQUIRE_REMOTE = process.env.BSDC_REQUIRE_REMOTE_ENV === 'true';

/**
 * Loads a dotenv file into process.env without overriding real environment variables.
 * @param file path to the dotenv file
 */
function loadDotEnv(file: string): void {
  let contents: string;
  try {
    contents = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

loadDotEnv('.env');
loadDotEnv('.env.local');
loadDotEnv('.env.production');

const errors: string[] = [];
const warnings: string[] = [];

// ---- absolute rule: no secret may be bundled -------------------------------
for (const key of FORBIDDEN_CLIENT) {
  if (process.env[`VITE_${key}`] !== undefined) {
    errors.push(
      `Secret "${key}" is exposed through VITE_${key}. Remove it immediately and rotate the secret.`,
    );
  }
}
for (const key of Object.keys(process.env)) {
  const upper = key.toUpperCase();
  if (!upper.startsWith('VITE_')) continue;
  for (const secret of FORBIDDEN_CLIENT) {
    if (upper === `VITE_${secret}`) {
      errors.push(`Secret "${secret}" is bundled through ${key}. Remove it and rotate the secret.`);
    }
  }
  if (/SECRET|PRIVATE_KEY|PASSKEY|SERVICE_ACCOUNT|PEPPER/i.test(upper)) {
    errors.push(
      `Client variable ${key} looks like a secret. Nothing prefixed VITE_ may be confidential.`,
    );
  }
}

// ---- remote backend configuration ------------------------------------------
const missingRemote = REMOTE_PUBLIC.filter((key) => {
  const value = process.env[key];
  return value === undefined || value.trim().length === 0;
});

if (missingRemote.length > 0) {
  const detail = missingRemote.join(', ');
  if (REQUIRE_REMOTE) {
    errors.push(
      `Remote backend configuration is incomplete (${detail}). Copy .env.example to .env and fill it, or unset BSDC_REQUIRE_REMOTE_ENV to build in device-local mode.`,
    );
  } else {
    warnings.push(
      `No Firebase configuration found (${detail}). The bundle will run in device-local mode: reads and writes stay on the device until a backend is configured. Set BSDC_REQUIRE_REMOTE_ENV=true in the release pipeline to make this a hard error.`,
    );
  }
}

// Firebase keys are public by design (PART 06.01): they identify a project, they do not authorise.
const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
if (projectId !== undefined && projectId.trim().length > 0 && projectId !== 'bsdc-bd') {
  warnings.push(
    `Firebase project id is "${projectId}" — expected "bsdc-bd" for the production build.`,
  );
}

for (const key of OPTIONAL) {
  const value = process.env[key];
  if (value === undefined || value.trim().length === 0) {
    warnings.push(`Optional variable ${key} is not set; the related feature degrades gracefully.`);
  }
}

for (const warning of warnings) console.warn(`[bsdc:env] ${warning}`);

if (errors.length > 0) {
  for (const error of errors) console.error(`[bsdc:env] ${error}`);
  console.error('[bsdc:env] Environment verification failed. Build stopped.');
  process.exit(1);
}

console.log(
  missingRemote.length === 0
    ? '[bsdc:env] Environment verified: remote backend configured.'
    : '[bsdc:env] Environment verified: device-local mode (no backend configured).',
);
