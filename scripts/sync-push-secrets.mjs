#!/usr/bin/env node
/**
 * Synchronizes runtime push secrets (`PUSH_FLUSH_SECRET`, `PUSH_WORKER_URL`,
 * and Web Push VAPID P-256 keys) between GitHub Secrets, `bsdc.push_settings`
 * in Postgres, Cloudflare Pages (`main-site`), and the standalone Cloudflare
 * Worker (`bsdc-push`).
 *
 * Precedence:
 *   1. Explicit GitHub / CI secrets always win and overwrite `bsdc.push_settings`.
 *   2. Missing secrets read existing valid values from `bsdc.push_settings`
 *      without rotating them, so active subscribers keep receiving pushes.
 *   3. When `flush_secret` or VAPID keys have never been configured yet
 *      (verified for VAPID by checking `GET /api/push/config` first so manual
 *      Pages dashboard keys are never clobbered), cryptographically random
 *      credentials are generated and inserted atomically under a PostgreSQL
 *      advisory lock so concurrent workflows always converge on one identical set.
 *
 * Security invariants:
 *   - Secret values are transferred over `psql` stdin and written only to
 *     caller-provided temporary JSON binding files (`0600`).
 *   - No secret value is ever passed as a CLI argument or written to stdout/stderr.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, webcrypto } from 'node:crypto';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_WORKER_URL = 'https://push.api.bsdc.info.bd';
const DEFAULT_PUSH_CONFIG_URL = 'https://www.bsdc.info.bd/api/push/config';
const DEFAULT_VAPID_SUBJECT = 'mailto:admin@bsdc.info.bd';
const LOCK_KEY = 'bsdc.push_settings.sync';

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return '';
}

export function normalizeWorkerUrl(raw) {
  const candidate = firstNonEmpty(raw, DEFAULT_WORKER_URL).replace(/\/+$/, '');
  return candidate.startsWith('https://') ? candidate : DEFAULT_WORKER_URL;
}

export function normalizeVapidSubject(raw) {
  const trimmed = firstNonEmpty(raw);
  if (trimmed.startsWith('mailto:') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.includes('@') && !trimmed.includes(' ')) return `mailto:${trimmed}`;
  return DEFAULT_VAPID_SUBJECT;
}

export function sqlLiteral(value) {
  const safe = String(value ?? '').replace(/\0/g, '');
  return `'${safe.replace(/'/g, "''")}'`;
}

export async function generateCandidateVapidKeys() {
  const pair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const rawPublic = await webcrypto.subtle.exportKey('raw', pair.publicKey);
  const pkcs8Private = await webcrypto.subtle.exportKey('pkcs8', pair.privateKey);
  return {
    publicKey: Buffer.from(rawPublic).toString('base64url'),
    privateKey: Buffer.from(pkcs8Private).toString('base64url'),
  };
}

export function buildPushSyncSql({
  explicitFlushSecret = '',
  candidateFlushSecret,
  workerUrl = DEFAULT_WORKER_URL,
  explicitVapidPublicKey = '',
  explicitVapidPrivateKey = '',
  explicitVapidSubject = '',
  candidateVapidPublicKey = '',
  candidateVapidPrivateKey = '',
  allowVapidProvision = false,
}) {
  assert.ok(
    typeof candidateFlushSecret === 'string' && candidateFlushSecret.length >= 32,
    'candidateFlushSecret must be >= 32 chars',
  );
  const normalizedWorkerUrl = normalizeWorkerUrl(workerUrl);
  const hasExplicitFlush = explicitFlushSecret.trim().length >= 32;
  const hasExplicitVapid =
    explicitVapidPublicKey.trim().length >= 32 && explicitVapidPrivateKey.trim().length >= 32;
  const effectiveSubject = normalizeVapidSubject(explicitVapidSubject);

  const lines = [
    'BEGIN;',
    `SELECT pg_advisory_xact_lock(hashtext(${sqlLiteral(LOCK_KEY)}));`,
    `INSERT INTO bsdc.push_settings (name, value) VALUES ('worker_url', ${sqlLiteral(normalizedWorkerUrl)}) ON CONFLICT (name) DO UPDATE SET value = excluded.value;`,
  ];

  if (hasExplicitFlush) {
    lines.push(
      `INSERT INTO bsdc.push_settings (name, value) VALUES ('flush_secret', ${sqlLiteral(explicitFlushSecret.trim())}) ON CONFLICT (name) DO UPDATE SET value = excluded.value;`,
    );
  } else {
    lines.push(
      `INSERT INTO bsdc.push_settings (name, value) VALUES ('flush_secret', ${sqlLiteral(candidateFlushSecret)}) ON CONFLICT (name) DO UPDATE SET value = CASE WHEN char_length(bsdc.push_settings.value) >= 32 THEN bsdc.push_settings.value ELSE excluded.value END;`,
    );
  }

  if (hasExplicitVapid) {
    lines.push(
      `INSERT INTO bsdc.push_settings (name, value) VALUES ('vapid_public_key', ${sqlLiteral(explicitVapidPublicKey.trim())}), ('vapid_private_key', ${sqlLiteral(explicitVapidPrivateKey.trim())}), ('vapid_subject', ${sqlLiteral(effectiveSubject)}) ON CONFLICT (name) DO UPDATE SET value = excluded.value;`,
    );
  } else if (
    allowVapidProvision &&
    candidateVapidPublicKey.trim().length >= 32 &&
    candidateVapidPrivateKey.trim().length >= 32
  ) {
    lines.push(
      `DO $$
DECLARE
  v_has_pair boolean;
BEGIN
  SELECT (
    exists(select 1 from bsdc.push_settings where name = 'vapid_public_key' and char_length(value) >= 32)
    and exists(select 1 from bsdc.push_settings where name = 'vapid_private_key' and char_length(value) >= 32)
  ) INTO v_has_pair;
  IF NOT v_has_pair THEN
    INSERT INTO bsdc.push_settings (name, value)
    VALUES
      ('vapid_public_key', ${sqlLiteral(candidateVapidPublicKey.trim())}),
      ('vapid_private_key', ${sqlLiteral(candidateVapidPrivateKey.trim())}),
      ('vapid_subject', ${sqlLiteral(effectiveSubject)})
    ON CONFLICT (name) DO UPDATE SET value = excluded.value;
  END IF;
END
$$;`,
    );
  }

  if (explicitVapidSubject.trim().length > 0 && !hasExplicitVapid) {
    lines.push(
      `INSERT INTO bsdc.push_settings (name, value) VALUES ('vapid_subject', ${sqlLiteral(effectiveSubject)}) ON CONFLICT (name) DO UPDATE SET value = excluded.value;`,
    );
  }

  lines.push(
    `SELECT json_build_object(
  'flush_secret', (SELECT value FROM bsdc.push_settings WHERE name = 'flush_secret'),
  'worker_url', (SELECT value FROM bsdc.push_settings WHERE name = 'worker_url'),
  'vapid_public_key', (SELECT value FROM bsdc.push_settings WHERE name = 'vapid_public_key'),
  'vapid_private_key', (SELECT value FROM bsdc.push_settings WHERE name = 'vapid_private_key'),
  'vapid_subject', (SELECT value FROM bsdc.push_settings WHERE name = 'vapid_subject')
)::text;`,
    'COMMIT;',
  );

  return lines.join('\n');
}

export function mergePushSecretsIntoBindings(existing, resolved, target) {
  const out = { ...(existing ?? {}) };
  if (typeof resolved?.flush_secret === 'string' && resolved.flush_secret.trim().length >= 32) {
    out.PUSH_FLUSH_SECRET = resolved.flush_secret.trim();
  }
  if (
    target === 'pages' &&
    typeof resolved?.worker_url === 'string' &&
    resolved.worker_url.trim().startsWith('https://')
  ) {
    out.PUSH_WORKER_URL = resolved.worker_url.trim();
  }
  if (
    typeof resolved?.vapid_public_key === 'string' &&
    resolved.vapid_public_key.trim().length >= 32 &&
    typeof resolved?.vapid_private_key === 'string' &&
    resolved.vapid_private_key.trim().length >= 32
  ) {
    out.PUSH_VAPID_PUBLIC_KEY = resolved.vapid_public_key.trim();
    out.PUSH_VAPID_PRIVATE_KEY = resolved.vapid_private_key.trim();
    out.PUSH_VAPID_SUBJECT = normalizeVapidSubject(resolved.vapid_subject);
  }
  return out;
}

async function pagesAlreadyExposesPublicVapidKey(configUrl) {
  const targetUrl = firstNonEmpty(configUrl, DEFAULT_PUSH_CONFIG_URL);
  if (!targetUrl.startsWith('https://')) return false;
  try {
    const response = await fetch(targetUrl, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    const payload = await response.json();
    return (
      payload?.enabled === true &&
      typeof payload?.vapidPublicKey === 'string' &&
      payload.vapidPublicKey.trim().length >= 32
    );
  } catch {
    return false;
  }
}

async function runPsql(dbUrl, sql) {
  const { stdout } = await execFileAsync('psql', [dbUrl, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    input: sql,
    env: { ...process.env, PGCONNECT_TIMEOUT: '10' },
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  return stdout;
}

function parseJsonLine(stdout) {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].startsWith('{') && lines[i].endsWith('}')) {
      return JSON.parse(lines[i]);
    }
  }
  return null;
}

async function runSelfTests() {
  const pair = await generateCandidateVapidKeys();
  assert.ok(pair.publicKey.length >= 80 && pair.publicKey.length <= 120);
  assert.ok(pair.privateKey.length >= 160 && pair.privateKey.length <= 240);
  assert.equal(normalizeWorkerUrl('https://push.api.bsdc.info.bd/'), 'https://push.api.bsdc.info.bd');
  assert.equal(normalizeWorkerUrl('http://insecure.test'), DEFAULT_WORKER_URL);
  assert.equal(normalizeVapidSubject('ops@bsdc.info.bd'), 'mailto:ops@bsdc.info.bd');
  assert.equal(normalizeVapidSubject(''), DEFAULT_VAPID_SUBJECT);
  assert.equal(sqlLiteral("o'hara\0"), "'o''hara'");

  const explicitSql = buildPushSyncSql({
    explicitFlushSecret: 'x'.repeat(48),
    candidateFlushSecret: 'y'.repeat(48),
    workerUrl: 'https://push.api.bsdc.info.bd/',
    explicitVapidPublicKey: pair.publicKey,
    explicitVapidPrivateKey: pair.privateKey,
    explicitVapidSubject: 'mailto:security@bsdc.info.bd',
    allowVapidProvision: true,
  });
  assert.ok(explicitSql.includes("ON CONFLICT (name) DO UPDATE SET value = excluded.value"));
  assert.ok(!explicitSql.includes('WHEN char_length(bsdc.push_settings.value) >= 32'));

  const preserveSql = buildPushSyncSql({
    explicitFlushSecret: 'too-short',
    candidateFlushSecret: 'c'.repeat(48),
    workerUrl: 'https://push.api.bsdc.info.bd',
    allowVapidProvision: false,
  });
  assert.ok(preserveSql.includes('WHEN char_length(bsdc.push_settings.value) >= 32'));
  assert.ok(!preserveSql.includes('v_has_pair'));

  const provisionSql = buildPushSyncSql({
    explicitFlushSecret: '',
    candidateFlushSecret: 'c'.repeat(48),
    candidateVapidPublicKey: pair.publicKey,
    candidateVapidPrivateKey: pair.privateKey,
    allowVapidProvision: true,
  });
  assert.ok(provisionSql.includes('v_has_pair'));
  assert.ok(provisionSql.includes('pg_advisory_xact_lock'));

  const mergedWorker = mergePushSecretsIntoBindings(
    { FB_PROJECT_ID: 'bsdc-bd' },
    {
      flush_secret: 'f'.repeat(48),
      worker_url: 'https://push.api.bsdc.info.bd',
      vapid_public_key: pair.publicKey,
      vapid_private_key: pair.privateKey,
      vapid_subject: '',
    },
    'worker',
  );
  assert.equal(mergedWorker.FB_PROJECT_ID, 'bsdc-bd');
  assert.equal(mergedWorker.PUSH_FLUSH_SECRET, 'f'.repeat(48));
  assert.equal(mergedWorker.PUSH_WORKER_URL, undefined);
  assert.equal(mergedWorker.PUSH_VAPID_PUBLIC_KEY, pair.publicKey);
  assert.equal(mergedWorker.PUSH_VAPID_PRIVATE_KEY, pair.privateKey);
  assert.equal(mergedWorker.PUSH_VAPID_SUBJECT, DEFAULT_VAPID_SUBJECT);

  const mergedPages = mergePushSecretsIntoBindings(
    { IMGBB_API_KEY: 'key' },
    {
      flush_secret: 'f'.repeat(48),
      worker_url: 'https://push.api.bsdc.info.bd',
      vapid_public_key: pair.publicKey,
      vapid_private_key: pair.privateKey,
      vapid_subject: 'mailto:rrc@bsdc.info.bd',
    },
    'pages',
  );
  assert.equal(mergedPages.IMGBB_API_KEY, 'key');
  assert.equal(mergedPages.PUSH_WORKER_URL, 'https://push.api.bsdc.info.bd');
  assert.equal(mergedPages.PUSH_VAPID_SUBJECT, 'mailto:rrc@bsdc.info.bd');

  console.log('12 push secret sync checks passed. No credentials printed.');
}

function readFlagValue(args, name) {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : '';
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    await runSelfTests();
    return;
  }

  const target = readFlagValue(args, '--target') || 'db';
  const bindingsPath = readFlagValue(args, '--bindings');
  if (target !== 'db' && bindingsPath === '') {
    throw new Error('--bindings <path> is required for pages and worker targets.');
  }

  const dbUrl = (process.env.SUPABASE_DB_URL ?? '').trim();
  if (dbUrl === '') {
    console.log('SUPABASE_DB_URL is not set; skipping database push settings sync.');
    return;
  }

  const existsOut = await runPsql(
    dbUrl,
    "SELECT (to_regclass('bsdc.push_settings') IS NOT NULL)::text;",
  );
  if (!['t', 'true'].includes(existsOut.trim())) {
    console.log('bsdc.push_settings table does not exist yet; skipping push secret sync.');
    return;
  }

  const explicitPublic = firstNonEmpty(
    process.env.PUSH_VAPID_PUBLIC_KEY,
    process.env.VITE_PUSH_VAPID_PUBLIC_KEY,
  );
  const explicitPrivate = firstNonEmpty(process.env.PUSH_VAPID_PRIVATE_KEY);
  const hasExplicitVapid = explicitPublic.length >= 32 && explicitPrivate.length >= 32;

  const pagesHasPublic = hasExplicitVapid
    ? false
    : await pagesAlreadyExposesPublicVapidKey(process.env.BSDC_PUSH_CONFIG_URL);
  const allowVapidProvision = !hasExplicitVapid && !pagesHasPublic;

  const candidateFlushSecret = randomBytes(36).toString('base64url');
  const candidateVapid = allowVapidProvision
    ? await generateCandidateVapidKeys()
    : { publicKey: '', privateKey: '' };

  const sql = buildPushSyncSql({
    explicitFlushSecret: process.env.PUSH_FLUSH_SECRET ?? '',
    candidateFlushSecret,
    workerUrl: process.env.PUSH_WORKER_URL ?? DEFAULT_WORKER_URL,
    explicitVapidPublicKey: explicitPublic,
    explicitVapidPrivateKey: explicitPrivate,
    explicitVapidSubject: process.env.PUSH_VAPID_SUBJECT ?? '',
    candidateVapidPublicKey: candidateVapid.publicKey,
    candidateVapidPrivateKey: candidateVapid.privateKey,
    allowVapidProvision,
  });

  const stdout = await runPsql(dbUrl, sql);
  const resolved = parseJsonLine(stdout);
  if (!resolved) {
    throw new Error('Failed to parse synchronized push settings summary from database.');
  }

  if (bindingsPath !== '') {
    let existing = {};
    try {
      existing = JSON.parse(readFileSync(bindingsPath, 'utf8'));
    } catch {
      existing = {};
    }
    const merged = mergePushSecretsIntoBindings(existing, resolved, target);
    writeFileSync(bindingsPath, JSON.stringify(merged), { mode: 0o600 });
    chmodSync(bindingsPath, 0o600);
  }

  const flushReady =
    typeof resolved.flush_secret === 'string' && resolved.flush_secret.trim().length >= 32;
  const vapidReady =
    typeof resolved.vapid_public_key === 'string' &&
    resolved.vapid_public_key.trim().length >= 32 &&
    typeof resolved.vapid_private_key === 'string' &&
    resolved.vapid_private_key.trim().length >= 32;

  console.log(
    `Synchronized bsdc.push_settings (target=${target}, flush_secret=${flushReady}, vapid=${vapidReady}, pages_existing_public=${pagesHasPublic}).`,
  );
  if (!vapidReady && pagesHasPublic) {
    console.warn(
      '::warning title=Web Push VAPID private key missing::Pages already serves a VAPID public key, so no automatic pair was generated. Set PUSH_VAPID_PUBLIC_KEY and PUSH_VAPID_PRIVATE_KEY in GitHub Secrets to enable encrypted Web Push on bsdc-push.',
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`::error::${error instanceof Error ? error.message : 'Push secret sync failed.'}`);
    process.exitCode = 1;
  });
}
