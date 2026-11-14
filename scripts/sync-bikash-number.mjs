#!/usr/bin/env node
/**
 * Copies the BSDC bKash number from the GitHub Actions secret
 * `BSDC_BIKASH_NUMBER` into `public.mk_settings` (key `bikash_number`) so the
 * vendor payment screen can show it.
 *
 * - Runs only in the deploy job, which already holds `SUPABASE_DB_URL`.
 * - If the secret is not set, it changes nothing: an admin-entered value stays.
 * - The number is checked against the Bangladesh mobile format before use.
 * - The SQL is written to a 0600 temp file and run through `psql -f`, so the
 *   value never appears in argv, stdout, or stderr.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const BD_MOBILE = /^01[3-9]\d{8}$/;

export function normalizeBikashNumber(raw) {
  const digits = String(raw ?? '').replace(/[\s-]/g, '');
  const local = digits.startsWith('+880') ? `0${digits.slice(4)}` : digits;
  return BD_MOBILE.test(local) ? local : null;
}

export function buildSql(number) {
  // The value has passed normalizeBikashNumber, so it is digits only.
  return [
    'insert into public.mk_settings (key, value) values',
    `  ('bikash_number', '${number}')`,
    'on conflict (key) do update set value = excluded.value, updated_at = now();',
    '',
  ].join('\n');
}

function selfTest() {
  const cases = [
    ['01712345678', '01712345678'],
    ['+8801712345678', '01712345678'],
    ['017 1234-5678', '01712345678'],
    ['0201234567', null],
    ['', null],
    ['01712345678; drop table x', null],
  ];
  for (const [input, expected] of cases) {
    const got = normalizeBikashNumber(input);
    if (got !== expected) {
      console.error(`self-test failed for an input of length ${input.length}`);
      process.exit(1);
    }
  }
  if (!buildSql('01712345678').includes("'01712345678'")) process.exit(1);
  console.log('sync-bikash-number self-test passed');
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();

  const raw = process.env.BSDC_BIKASH_NUMBER ?? '';
  if (raw.trim() === '') {
    console.log('BSDC_BIKASH_NUMBER is not set; leaving the stored bKash number unchanged.');
    return;
  }
  const number = normalizeBikashNumber(raw);
  if (number === null) {
    console.error('BSDC_BIKASH_NUMBER is set but is not an 11-digit Bangladesh mobile number. Nothing was changed.');
    process.exit(1);
  }
  const dbUrl = (process.env.SUPABASE_DB_URL ?? '').trim();
  if (dbUrl === '') {
    console.error('SUPABASE_DB_URL is not set; cannot sync the bKash number.');
    process.exit(1);
  }

  const dir = mkdtempSync(join(tmpdir(), 'bsdc-bkash-'));
  const file = join(dir, 'sync.sql');
  try {
    writeFileSync(file, buildSql(number), { mode: 0o600 });
    chmodSync(file, 0o600);
    execFileSync('psql', [dbUrl, '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-q', '-f', file], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    console.log('bKash number synced to mk_settings.');
  } catch {
    console.error('syncing the bKash number failed (the database error is not printed, to keep the value private).');
    process.exit(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
