#!/usr/bin/env node
/**
 * Re-applies everything the generated Android project needs that Capacitor
 * does not generate: the intent filters that make app links work, the
 * version, the release signing configuration, and a Firebase file.
 *
 *   npm run build && node scripts/configure-android.mjs
 *
 * It runs after `npx cap add android` and before Gradle. It is idempotent,
 * so running it twice changes nothing the second time, and every decision
 * it makes lives in `src/android-config.ts` with tests beside it.
 *
 * Environment it reads:
 *   GOOGLE_SERVICES_JSON        the real file, raw or base64. Optional.
 *   GITHUB_REF_NAME / RELEASE_TAG   the tag, if this is a release build.
 *   GITHUB_RUN_NUMBER           becomes the versionCode.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const {
  withIntentFilters,
  withoutCleartextTraffic,
  withVersion,
  withReleaseSigning,
  versionFrom,
  placeholderGoogleServices,
  isPlaceholderConfig,
} = await import(join(root, 'dist', 'android-config.js'));

const APP_ID = 'bd.info.bsdc.app';
const manifestPath = join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const gradlePath = join(root, 'android', 'app', 'build.gradle');
const servicesPath = join(root, 'android', 'app', 'google-services.json');

if (!existsSync(manifestPath)) {
  process.stderr.write('No android/ project found. Run `npx cap add android` first.\n');
  process.exit(2);
}

/* The manifest: app links, the custom scheme, and no cleartext. */
const manifest = readFileSync(manifestPath, 'utf8');
const patchedManifest = withoutCleartextTraffic(withIntentFilters(manifest));
writeFileSync(manifestPath, patchedManifest);
process.stdout.write(
  patchedManifest === manifest
    ? 'manifest: already configured\n'
    : 'manifest: intent filters applied\n',
);

/* The Gradle file: version and signing. */
const tag = process.env['RELEASE_TAG'] ?? process.env['GITHUB_REF_NAME'] ?? '';
const runNumber = Number(process.env['GITHUB_RUN_NUMBER'] ?? '1');
const version = versionFrom(tag, Number.isFinite(runNumber) ? runNumber : 1);

const gradle = readFileSync(gradlePath, 'utf8');
writeFileSync(gradlePath, withReleaseSigning(withVersion(gradle, version)));
process.stdout.write(
  `gradle: version ${version.name} (code ${version.code}), signing configured\n`,
);

/* Firebase: the real file if CI supplied one, otherwise something Gradle
   can parse so a debug build does not need a production secret. */
const supplied = process.env['GOOGLE_SERVICES_JSON'] ?? '';
if (supplied.trim() !== '') {
  const decoded = supplied.trimStart().startsWith('{')
    ? supplied
    : Buffer.from(supplied, 'base64').toString('utf8');
  JSON.parse(decoded); // fail loudly here rather than inside Gradle
  writeFileSync(servicesPath, decoded.endsWith('\n') ? decoded : `${decoded}\n`);
  process.stdout.write('firebase: real google-services.json written\n');
} else if (!existsSync(servicesPath)) {
  writeFileSync(servicesPath, placeholderGoogleServices(APP_ID));
  process.stdout.write(
    'firebase: placeholder written — push notifications will not work in this build\n',
  );
}

/* A release must never ship against the placeholder. */
if (
  process.argv.includes('--require-real-firebase') &&
  isPlaceholderConfig(readFileSync(servicesPath, 'utf8'))
) {
  process.stderr.write(
    'Refusing to build a release against the placeholder Firebase configuration.\n',
  );
  process.exit(1);
}
