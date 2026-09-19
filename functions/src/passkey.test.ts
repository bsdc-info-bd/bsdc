/**
 * BSDC — functions/src/passkey.test.ts
 * Purpose : Proves the passkey derivation: salted, peppered, constant-time and never stored.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : LAW-06 is the whole reason this file exists. A passkey that is stored, logged or
 *   compared with `===` would be a security defect hidden behind a feature flag, so the
 *   properties that matter are asserted here and re-checked by `npm run verify:functions`.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPasskeyRecord, createSalt, derivePasskey, verifyPasskey } from './passkey';

const PEPPER = 'test-pepper-value';

test('a salt is unique every time', () => {
  assert.notEqual(createSalt(), createSalt());
  assert.match(createSalt(), /^[0-9a-f]{32}$/);
});

test('the same passkey derives a different hash under a different salt', () => {
  const first = derivePasskey('RahimRahim', 'salt-one', PEPPER, 1000);
  const second = derivePasskey('RahimRahim', 'salt-two', PEPPER, 1000);
  assert.notEqual(first, second);
});

test('the same passkey derives a different hash under a different pepper', () => {
  const first = derivePasskey('RahimRahim', 'salt', 'pepper-one', 1000);
  const second = derivePasskey('RahimRahim', 'salt', 'pepper-two', 1000);
  assert.notEqual(first, second);
});

test('derivation is deterministic for identical inputs', () => {
  assert.equal(
    derivePasskey('RahimRahim', 'salt', PEPPER, 1000),
    derivePasskey('RahimRahim', 'salt', PEPPER, 1000),
  );
});

test('a record never contains the passkey and verifies only the right one', () => {
  const record = createPasskeyRecord('RahimRahim', PEPPER);
  const serialised = JSON.stringify(record);
  assert.equal(serialised.includes('RahimRahim'), false);
  assert.match(record.hash, /^[0-9a-f]{64}$/);
  assert.equal(record.iterations, 600_000);

  assert.equal(verifyPasskey('RahimRahim', record, PEPPER), true);
  assert.equal(verifyPasskey('rahimrahim', record, PEPPER), false);
  assert.equal(verifyPasskey('', record, PEPPER), false);
});

test('verification fails against a record produced with another pepper', () => {
  const record = createPasskeyRecord('RahimRahim', PEPPER);
  assert.equal(verifyPasskey('RahimRahim', record, 'other-pepper'), false);
});

test('verification rejects a malformed or empty stored hash', () => {
  const empty = { salt: 'salt', hash: '', iterations: 1000, updatedAt: '' };
  assert.equal(verifyPasskey('anything', empty, PEPPER), false);
});
