#!/usr/bin/env node
/**
 * Resolves and validates Supabase + Google Sign-In build configuration for Android.
 *
 * Secret lookup order:
 *   - Supabase URL: `ANDROID_SUPABASE_URL` -> `VITE_SUPABASE_URL` -> `SUPABASE_URL`
 *   - Supabase publishable key: `ANDROID_SUPABASE_PUBLISHABLE_KEY` -> `VITE_SUPABASE_PUBLISHABLE_KEY`
 *   - Google Web Client ID: `ANDROID_GOOGLE_WEB_CLIENT_ID` -> `client_type == 3` entry in `app/google-services.json`
 *
 * Writes normalized `ANDROID_SUPABASE_URL`, `ANDROID_SUPABASE_PUBLISHABLE_KEY`, and
 * `ANDROID_GOOGLE_WEB_CLIENT_ID` to `GITHUB_ENV`.
 * When `--require-supabase` is passed (release builds), fails loudly if Supabase URL
 * or publishable key is still absent so an unconfigured release APK is never shipped.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const googleServicesPath = join(root, 'app', 'google-services.json');

function firstNonEmpty(candidates) {
  for (const [name, raw] of candidates) {
    const val = (raw ?? '').trim();
    if (val.length > 0) return { name, value: val };
  }
  return { name: '', value: '' };
}

function extractWebClientIdFromGoogleServices(filePath) {
  if (!existsSync(filePath)) return '';
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    if (parsed?.project_info?.project_id === 'bsdc-placeholder') return '';
    for (const client of parsed?.client ?? []) {
      for (const oauth of client?.oauth_client ?? []) {
        if (oauth?.client_type === 3 && typeof oauth?.client_id === 'string' && oauth.client_id.trim()) {
          return oauth.client_id.trim();
        }
      }
      for (const oauth of client?.services?.appinvite_service?.other_platform_oauth_client ?? []) {
        if (oauth?.client_type === 3 && typeof oauth?.client_id === 'string' && oauth.client_id.trim()) {
          return oauth.client_id.trim();
        }
      }
    }
  } catch {
    return '';
  }
  return '';
}

function appendGithubEnv(envFile, key, value) {
  const delimiter = `BSDC_ENV_${key}_${process.pid}`;
  writeFileSync(envFile, `${key}<<${delimiter}\n${value}\n${delimiter}\n`, { flag: 'a' });
}

const urlRes = firstNonEmpty([
  ['ANDROID_SUPABASE_URL', process.env['RAW_ANDROID_SUPABASE_URL']],
  ['VITE_SUPABASE_URL', process.env['RAW_VITE_SUPABASE_URL']],
  ['SUPABASE_URL', process.env['RAW_SUPABASE_URL']],
]);

const keyRes = firstNonEmpty([
  ['ANDROID_SUPABASE_PUBLISHABLE_KEY', process.env['RAW_ANDROID_SUPABASE_PUBLISHABLE_KEY']],
  ['VITE_SUPABASE_PUBLISHABLE_KEY', process.env['RAW_VITE_SUPABASE_PUBLISHABLE_KEY']],
]);

let webClientRes = firstNonEmpty([
  ['ANDROID_GOOGLE_WEB_CLIENT_ID', process.env['RAW_ANDROID_GOOGLE_WEB_CLIENT_ID']],
]);
if (!webClientRes.value) {
  const extracted = extractWebClientIdFromGoogleServices(googleServicesPath);
  if (extracted) {
    webClientRes = { name: 'google-services.json(client_type=3)', value: extracted };
  }
}

const requireSupabase = process.argv.includes('--require-supabase');

if (urlRes.value) {
  let parsed;
  try {
    parsed = new URL(urlRes.value);
  } catch {
    process.stderr.write(`::error::Resolved Supabase URL from ${urlRes.name} is not a valid URL.\n`);
    process.exit(1);
  }
  if (parsed.protocol !== 'https:') {
    process.stderr.write(`::error::Resolved Supabase URL from ${urlRes.name} must use https://.\n`);
    process.exit(1);
  }
}

if (requireSupabase && (!urlRes.value || !keyRes.value)) {
  const missing = [];
  if (!urlRes.value) missing.push('ANDROID_SUPABASE_URL / VITE_SUPABASE_URL / SUPABASE_URL');
  if (!keyRes.value) missing.push('ANDROID_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_PUBLISHABLE_KEY');
  process.stderr.write(
    `::error::Refusing Android release build without Supabase configuration. Missing: ${missing.join(', ')}. ` +
      'Verify GitHub Secrets under Actions / production environment.\n',
  );
  process.exit(1);
}

if (urlRes.value) process.stdout.write(`::add-mask::${urlRes.value}\n`);
if (keyRes.value) process.stdout.write(`::add-mask::${keyRes.value}\n`);

const githubEnv = process.env['GITHUB_ENV'];
if (githubEnv) {
  appendGithubEnv(githubEnv, 'ANDROID_SUPABASE_URL', urlRes.value);
  appendGithubEnv(githubEnv, 'ANDROID_SUPABASE_PUBLISHABLE_KEY', keyRes.value);
  appendGithubEnv(githubEnv, 'ANDROID_GOOGLE_WEB_CLIENT_ID', webClientRes.value);
}

process.stdout.write(
  `backend: supabaseUrl=${urlRes.value ? `set(${urlRes.name})` : 'unset'}, ` +
    `supabaseKey=${keyRes.value ? `set(${keyRes.name}, len=${keyRes.value.length})` : 'unset'}, ` +
    `googleWebClientId=${webClientRes.value ? `set(${webClientRes.name})` : 'unset'}\n`,
);
