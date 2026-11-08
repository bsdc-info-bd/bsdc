#!/usr/bin/env node
// Turns the deployment credential into server-only Pages bindings. Never print
// the JSON, parse errors, or key material; write outside the checkout with 0600.
import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

function validatedCredential(raw, expectedProject, project, secretName) {
  let credential;
  try {
    credential = JSON.parse(raw);
  } catch {
    throw new Error(`${secretName} must contain valid service-account JSON.`);
  }
  if (!credential || credential.type !== 'service_account' ||
      credential.project_id !== project || expectedProject !== credential.project_id) {
    throw new Error(`The service account and Firebase project ID must both belong to ${project}.`);
  }
  if (typeof credential.client_email !== 'string' ||
      !credential.client_email.endsWith(`@${project}.iam.gserviceaccount.com`) ||
      typeof credential.private_key !== 'string') {
    throw new Error('The Firebase service account is missing its email or private key.');
  }
  try {
    const key = createPrivateKey(credential.private_key);
    if (key.asymmetricKeyType !== 'rsa') throw new Error('not RSA');
  } catch {
    throw new Error('The Firebase service account private key must be a valid RSA PEM key.');
  }
  return credential;
}

export function bindingsFromCredential(raw, expectedProject) {
  const credential = validatedCredential(raw, expectedProject, 'bsdc-bd', 'FIREBASE_SERVICE_ACCOUNT_BSDC_BD');
  return {
    FB_PROJECT_ID: credential.project_id,
    FB_CLIENT_EMAIL: credential.client_email,
    FB_PRIVATE_KEY: credential.private_key,
  };
}

export function corporateBindingsFromCredential(raw, expectedProject) {
  const credential = validatedCredential(raw, expectedProject, 'bsdc-second', 'FIREBASE_SERVICE_ACCOUNT_BSDC_SECOND');
  return {
    FB2_PROJECT_ID: credential.project_id,
    FB2_CLIENT_EMAIL: credential.client_email,
    FB2_PRIVATE_KEY: credential.private_key,
  };
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return '';
}

/**
 * Optional runtime-only Pages Function bindings synced when present in CI.
 * Empty values are omitted so existing Cloudflare Pages secrets are never overwritten.
 */
export function runtimeServiceBindings(source = process.env) {
  const extra = {};
  const imgbbKey = firstNonEmpty(source.IMGBB_API_KEY);
  if (imgbbKey !== '') extra.IMGBB_API_KEY = imgbbKey;

  const supabaseUrl = firstNonEmpty(source.SUPABASE_URL, source.VITE_SUPABASE_URL);
  if (supabaseUrl !== '') extra.SUPABASE_URL = supabaseUrl;

  const supabaseAnonKey = firstNonEmpty(
    source.SUPABASE_ANON_KEY,
    source.SUPABASE_PUBLISHABLE_KEY,
    source.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  if (supabaseAnonKey !== '') extra.SUPABASE_ANON_KEY = supabaseAnonKey;

  const flushSecret = firstNonEmpty(source.PUSH_FLUSH_SECRET);
  if (flushSecret.length >= 32) extra.PUSH_FLUSH_SECRET = flushSecret;

  return extra;
}

if (process.argv.includes('--self-test')) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const fixture = {
    type: 'service_account', project_id: 'bsdc-bd',
    client_email: 'test@bsdc-bd.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
  const valid = JSON.stringify(fixture);
  const bindings = bindingsFromCredential(valid, 'bsdc-bd');
  assert.deepEqual(Object.keys(bindings).sort(), ['FB_CLIENT_EMAIL', 'FB_PRIVATE_KEY', 'FB_PROJECT_ID']);
  assert.equal(bindings.FB_PRIVATE_KEY, fixture.private_key);
  assert.throws(() => bindingsFromCredential('', 'bsdc-bd'));
  assert.throws(() => bindingsFromCredential('null', 'bsdc-bd'));
  assert.throws(() => bindingsFromCredential(valid, 'wrong-project'));
  assert.throws(() => bindingsFromCredential(JSON.stringify({ ...fixture, type: 'authorized_user' }), 'bsdc-bd'));
  assert.throws(() => bindingsFromCredential(JSON.stringify({ ...fixture, client_email: 'wrong@example.com' }), 'bsdc-bd'));
  assert.throws(() => bindingsFromCredential(JSON.stringify({ ...fixture, private_key: 'not-a-key' }), 'bsdc-bd'));
  const corporate = { ...fixture, project_id: 'bsdc-second', client_email: 'test@bsdc-second.iam.gserviceaccount.com' };
  const corporateValid = JSON.stringify(corporate);
  const corporateBindings = corporateBindingsFromCredential(corporateValid, 'bsdc-second');
  assert.deepEqual(Object.keys(corporateBindings).sort(), ['FB2_CLIENT_EMAIL', 'FB2_PRIVATE_KEY', 'FB2_PROJECT_ID']);
  assert.equal(corporateBindings.FB2_PRIVATE_KEY, fixture.private_key);
  assert.throws(() => corporateBindingsFromCredential('', 'bsdc-second'));
  assert.throws(() => corporateBindingsFromCredential(valid, 'bsdc-second'));
  assert.throws(() => corporateBindingsFromCredential(corporateValid, 'bsdc-bd'));
  assert.throws(() => corporateBindingsFromCredential(JSON.stringify({ ...corporate, client_email: 'wrong@example.com' }), 'bsdc-second'));
  assert.throws(() => corporateBindingsFromCredential(JSON.stringify({ ...corporate, private_key: 'not-a-key' }), 'bsdc-second'));
  assert.deepEqual(runtimeServiceBindings({}), {});
  assert.deepEqual(
    runtimeServiceBindings({
      IMGBB_API_KEY: 'imgbb-secret',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pub-key',
      PUSH_FLUSH_SECRET: 'short',
    }),
    {
      IMGBB_API_KEY: 'imgbb-secret',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'pub-key',
    },
  );
  console.log('17 Firebase and runtime binding checks passed. No credentials printed.');
} else {
  try {
    const output = process.argv[2];
    if (!output) throw new Error('A temporary output path is required.');
    const bindings = bindingsFromCredential(
      process.env.FIREBASE_SERVICE_ACCOUNT_BSDC_BD ?? '',
      process.env.VITE_FB_PROJECT_ID ?? '',
    );
    const corporate = process.env.FIREBASE_SERVICE_ACCOUNT_BSDC_SECOND ?? '';
    if (corporate.trim() !== '') {
      Object.assign(bindings, corporateBindingsFromCredential(corporate, process.env.VITE_FB2_PROJECT_ID ?? ''));
    } else {
      // Cloudflare may already have these secrets. Bulk upload does not erase
      // other bindings; the post-deploy readiness check verifies their presence.
      console.log('Corporate credential not supplied; checking existing Pages bindings after deployment.');
    }
    Object.assign(bindings, runtimeServiceBindings(process.env));
    writeFileSync(output, JSON.stringify(bindings), { mode: 0o600, flag: 'wx' });
    console.log('Validated server-only Firebase bindings written to temporary storage.');
  } catch (error) {
    // File-system errors may contain a path but never include the file content.
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
