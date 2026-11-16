#!/usr/bin/env node
/**
 * Verifies the signed Android release APK (`apksigner verify` + release `BuildConfig`),
 * extracts both SHA-1 and SHA-256 signing certificate fingerprints, inspects
 * `google-services.json` OAuth client readiness, and renders a copy-ready
 * GitHub Step Summary (`GITHUB_STEP_SUMMARY`) covering Firebase, Google OAuth,
 * and Cloudflare Pages App Links (`assetlinks.json`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const androidRoot = join(here, '..');

function normalizeColonFingerprint(rawHex, expectedPairs) {
  const clean = (rawHex ?? '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (clean.length !== expectedPairs * 2) return '';
  return clean.match(/.{2}/g).join(':');
}

export function extractFingerprints(apksignerText, keytoolText = '') {
  let sha256 = '';
  let sha1 = '';

  const s256Match = apksignerText.match(/SHA-256\s+digest:\s*([0-9a-fA-F:]+)/i);
  if (s256Match) sha256 = normalizeColonFingerprint(s256Match[1], 32);

  const s1Match = apksignerText.match(/SHA-1\s+digest:\s*([0-9a-fA-F:]+)/i);
  if (s1Match) sha1 = normalizeColonFingerprint(s1Match[1], 20);

  if (!sha256 && keytoolText) {
    const kt256 = keytoolText.match(/SHA256:\s*([0-9a-fA-F:]+)/i);
    if (kt256) sha256 = normalizeColonFingerprint(kt256[1], 32);
  }
  if (!sha1 && keytoolText) {
    const kt1 = keytoolText.match(/SHA1:\s*([0-9a-fA-F:]+)/i);
    if (kt1) sha1 = normalizeColonFingerprint(kt1[1], 20);
  }

  return { sha1, sha256 };
}

function findReleaseApk() {
  const releaseDir = join(androidRoot, 'app', 'build', 'outputs', 'apk', 'release');
  if (!existsSync(releaseDir)) {
    throw new Error(`Release APK output directory not found: ${releaseDir}`);
  }
  const apks = readdirSync(releaseDir)
    .filter((name) => name.endsWith('.apk'))
    .sort();
  if (apks.length === 0) {
    throw new Error(`Signed release APK not found under ${releaseDir}`);
  }
  return join(releaseDir, apks[0]);
}

function findApksigner() {
  const sdk = process.env['ANDROID_HOME'] || process.env['ANDROID_SDK_ROOT'];
  if (!sdk) throw new Error('ANDROID_HOME / ANDROID_SDK_ROOT is not set');
  const buildToolsDir = join(sdk, 'build-tools');
  if (!existsSync(buildToolsDir)) {
    throw new Error(`Android build-tools directory not found: ${buildToolsDir}`);
  }
  const versions = readdirSync(buildToolsDir).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  for (let i = versions.length - 1; i >= 0; i -= 1) {
    const candidate = join(buildToolsDir, versions[i], 'apksigner');
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`apksigner not found under ${buildToolsDir}`);
}

function inspectBuildConfig() {
  const bcPath = join(
    androidRoot,
    'app',
    'build',
    'generated',
    'source',
    'buildConfig',
    'release',
    'bd',
    'info',
    'bsdc',
    'app',
    'BuildConfig.java',
  );
  if (!existsSync(bcPath)) {
    throw new Error(`Release BuildConfig.java not found: ${bcPath}`);
  }
  const content = readFileSync(bcPath, 'utf8');
  if (!/SUPABASE_URL\s*=\s*"https:\/\/[^"]+"/.test(content)) {
    throw new Error('Release BuildConfig.SUPABASE_URL is empty or invalid');
  }
  if (!/SUPABASE_PUBLISHABLE_KEY\s*=\s*"[^"]+"/.test(content)) {
    throw new Error('Release BuildConfig.SUPABASE_PUBLISHABLE_KEY is empty');
  }
  const hasGoogleWebClientId = /GOOGLE_WEB_CLIENT_ID\s*=\s*"[^"]+"/.test(content);
  return { hasGoogleWebClientId };
}

function inspectFirebaseJson() {
  const gsPath = join(androidRoot, 'app', 'google-services.json');
  if (!existsSync(gsPath)) {
    return { projectId: 'missing', hasAndroidOAuth: false, hasWebOAuth: false };
  }
  const parsed = JSON.parse(readFileSync(gsPath, 'utf8'));
  const projectId = String(parsed?.project_info?.project_id ?? 'unknown');
  let hasAndroidOAuth = false;
  let hasWebOAuth = false;
  for (const client of parsed?.client ?? []) {
    for (const oauth of client?.oauth_client ?? []) {
      if (oauth?.client_type === 1) hasAndroidOAuth = true;
      if (oauth?.client_type === 3) hasWebOAuth = true;
    }
    for (const oauth of client?.services?.appinvite_service?.other_platform_oauth_client ?? []) {
      if (oauth?.client_type === 3) hasWebOAuth = true;
    }
  }
  return { projectId, hasAndroidOAuth, hasWebOAuth };
}

function main() {
  const { hasGoogleWebClientId } = inspectBuildConfig();
  const firebaseInfo = inspectFirebaseJson();
  const apk = findReleaseApk();
  const apksigner = findApksigner();

  const apksignerOut = execFileSync(
    apksigner,
    ['verify', '--verbose', '--print-certs', apk],
    { encoding: 'utf8' },
  );
  process.stdout.write(apksignerOut);

  let keytoolOut = '';
  try {
    keytoolOut = execFileSync('keytool', ['-printcert', '-jarfile', apk], {
      encoding: 'utf8',
    });
  } catch {
    // keytool fallback is optional when apksigner already prints both digests
  }

  const { sha1, sha256 } = extractFingerprints(apksignerOut, keytoolOut);
  if (!sha256) {
    throw new Error('Could not parse SHA-256 signing certificate fingerprint from APK');
  }
  if (!sha1) {
    throw new Error('Could not parse SHA-1 signing certificate fingerprint from APK');
  }

  process.stdout.write(`\nSHA-1:   ${sha1}\nSHA-256: ${sha256}\n`);

  const summaryPath = process.env['GITHUB_STEP_SUMMARY'];
  if (summaryPath) {
    const summary = [
      '## Native Release Signed (`bd.info.bsdc.app`)',
      '',
      '| Fingerprint | Value (Copy-Ready) | Where to Configure |',
      '| --- | --- | --- |',
      `| **SHA-1** | \`${sha1}\` | Firebase Console → \`${firebaseInfo.projectId}\` → Project settings → \`bd.info.bsdc.app\` → **Add fingerprint** (required for Google & GitHub OAuth) |`,
      `| **SHA-256** | \`${sha256}\` | Firebase Console **Add fingerprint** AND Cloudflare Pages (\`bsdc\` & \`bsdc-vf\`) → \`ANDROID_CERT_FINGERPRINT\` (required for App Links) |`,
      '',
      '### Release Configuration Readiness',
      '- **Supabase (`BuildConfig.SUPABASE_URL` & `SUPABASE_PUBLISHABLE_KEY`)**: verified non-empty',
      `- **Google Sign-In Web Client ID (\`BuildConfig.GOOGLE_WEB_CLIENT_ID\`)**: ${
        hasGoogleWebClientId
          ? 'configured'
          : 'unset — add SHA-1 in Firebase Console, enable Google Sign-In, re-download `google-services.json`, update `ANDROID_GOOGLE_SERVICES_JSON` (or set `ANDROID_GOOGLE_WEB_CLIENT_ID`), and re-run release build'
      }`,
      `- **Firebase \`google-services.json\`**: project \`${firebaseInfo.projectId}\`, Android OAuth client (\`client_type: 1\`): ${
        firebaseInfo.hasAndroidOAuth ? 'present' : 'missing (register SHA-1 in Firebase and re-download `google-services.json`)'
      }, Web OAuth client (\`client_type: 3\`): ${
        firebaseInfo.hasWebOAuth ? 'present' : 'missing (enable Google Sign-In in Firebase and re-download `google-services.json`)'
      }`,
      '- **App Links check URLs**: `https://www.bsdc.info.bd/.well-known/assetlinks.json` and `https://vf.bsdc.info.bd/.well-known/assetlinks.json`',
      '',
    ].join('\n');
    writeFileSync(summaryPath, summary, { flag: 'a' });
  }
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntrypoint) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`::error::${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
