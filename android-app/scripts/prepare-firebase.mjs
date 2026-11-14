#!/usr/bin/env node
/**
 * Prepares `android-app/app/google-services.json` safely for CI and local debug builds.
 *
 * - Reads `GOOGLE_SERVICES_JSON` (raw JSON or base64) when provided via CI secrets.
 * - Falls back to a deterministic debug-only placeholder matching `bd.info.bsdc.app`
 *   when unset so debug PR builds compile without production Firebase secrets.
 * - Refuses release builds if `--require-real-firebase` is passed against a placeholder.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ID = 'bd.info.bsdc.app';
const PLACEHOLDER_PROJECT = 'bsdc-placeholder';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const targetPath = join(root, 'app', 'google-services.json');

export function placeholderGoogleServices(appId = APP_ID) {
  return `${JSON.stringify(
    {
      project_info: {
        project_number: '000000000000',
        project_id: PLACEHOLDER_PROJECT,
        firebase_url: `https://${PLACEHOLDER_PROJECT}-default-rtdb.firebaseio.com`,
        storage_bucket: `${PLACEHOLDER_PROJECT}.appspot.com`,
      },
      client: [
        {
          client_info: {
            mobilesdk_app_id: '1:000000000000:android:0000000000000000000000',
            android_client_info: { package_name: appId },
          },
          oauth_client: [],
          api_key: [{ current_key: 'placeholder-debug-key-do-not-ship' }],
          services: { appinvite_service: { other_platform_oauth_client: [] } },
        },
      ],
      configuration_version: '1',
    },
    null,
    2,
  )}\n`;
}

export function isPlaceholderConfig(jsonText) {
  try {
    const parsed = JSON.parse(jsonText);
    return parsed?.project_info?.project_id === PLACEHOLDER_PROJECT;
  } catch {
    return true;
  }
}

mkdirSync(dirname(targetPath), { recursive: true });

const supplied = process.env['GOOGLE_SERVICES_JSON'] ?? '';
if (supplied.trim() !== '') {
  const decoded = supplied.trimStart().startsWith('{')
    ? supplied
    : Buffer.from(supplied, 'base64').toString('utf8');
  JSON.parse(decoded);
  writeFileSync(targetPath, decoded.endsWith('\n') ? decoded : `${decoded}\n`);
  process.stdout.write('firebase: real google-services.json written\n');
} else if (!existsSync(targetPath)) {
  writeFileSync(targetPath, placeholderGoogleServices(APP_ID));
  process.stdout.write(
    'firebase: debug placeholder google-services.json written (FCM disabled in placeholder build)\n',
  );
}

if (
  process.argv.includes('--require-real-firebase') &&
  isPlaceholderConfig(readFileSync(targetPath, 'utf8'))
) {
  process.stderr.write(
    'Refusing release build against placeholder Firebase configuration.\n',
  );
  process.exit(1);
}
