#!/usr/bin/env node
// Turns the deployment credential into server-only Pages bindings. Never print
// the JSON, parse errors, or key material; write outside the checkout with 0600.
import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

export function bindingsFromCredential(raw, expectedProject) {
  let credential;
  try {
    credential = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BSDC_BD must contain valid service-account JSON.');
  }
  if (!credential || credential.type !== 'service_account' ||
      credential.project_id !== 'bsdc-bd' || expectedProject !== credential.project_id) {
    throw new Error('The service account and VITE_FB_PROJECT_ID must both belong to bsdc-bd.');
  }
  if (typeof credential.client_email !== 'string' ||
      !credential.client_email.endsWith('@bsdc-bd.iam.gserviceaccount.com') ||
      typeof credential.private_key !== 'string') {
    throw new Error('The Firebase service account is missing its email or private key.');
  }
  try {
    const key = createPrivateKey(credential.private_key);
    if (key.asymmetricKeyType !== 'rsa') throw new Error('not RSA');
  } catch {
    throw new Error('The Firebase service account private key must be a valid RSA PEM key.');
  }
  return {
    FB_PROJECT_ID: credential.project_id,
    FB_CLIENT_EMAIL: credential.client_email,
    FB_PRIVATE_KEY: credential.private_key,
  };
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
  console.log('8 Firebase binding checks passed. No credentials printed.');
} else {
  try {
    const output = process.argv[2];
    if (!output) throw new Error('A temporary output path is required.');
    const bindings = bindingsFromCredential(
      process.env.FIREBASE_SERVICE_ACCOUNT_BSDC_BD ?? '',
      process.env.VITE_FB_PROJECT_ID ?? '',
    );
    writeFileSync(output, JSON.stringify(bindings), { mode: 0o600, flag: 'wx' });
    console.log('Validated server-only Firebase bindings written to temporary storage.');
  } catch (error) {
    // File-system errors may contain a path but never include the file content.
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
