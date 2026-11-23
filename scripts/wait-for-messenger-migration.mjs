#!/usr/bin/env node
/**
 * Read-only production rollout gate. The database and Pages workflows run
 * independently, so wait until the database has this checkout's full ordered
 * ledger and the messenger's required RPCs/column privileges before publishing
 * the new member-site bundle. Never apply migrations from this script.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as wait } from 'node:timers/promises';

const exec = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = join(root, 'scripts/db-push.mjs');
const isCurrentPlan = (output) => /^0 would be applied, \d+ skipped\. Nothing was changed\.$/m.test(output);
// The two routines are looked up by name, not by a spelled-out signature. A signature
// string is a photograph of one day's parameter list, and the database moves: 0132
// appended a defaulted `p_media_asset` to send_message_once, after which
// to_regprocedure of the old eight types resolves to nothing, and this gate — which
// only ever refuses a publish, never fixes one — would have held the member-site
// bundle back for a function that had become *more* capable. Arity is the contract the
// clients actually rely on: they call send_message_once with eight arguments and
// conversation_messages_page with four, and a defaulted tail may grow without either
// caller noticing.
const sql = `select (
  exists (select 1 from pg_catalog.pg_proc p
            join pg_catalog.pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'send_message_once'
             and p.pronargs >= 8
             and p.prorettype::regtype::text = 'public.messages')
  and exists (select 1 from pg_catalog.pg_proc p
            join pg_catalog.pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'conversation_messages_page'
             and p.pronargs >= 4
             and p.proretset)
  and exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='messages' and column_name='client_id')
  and has_column_privilege('authenticated','public.conversation_members','uid','SELECT')
  and not has_column_privilege('authenticated','public.conversation_members','draft_body','SELECT')
  and not has_column_privilege('authenticated','public.messages','client_id','UPDATE')
)::text;`;

if (process.argv.includes('--self-test')) {
  assert.equal(isCurrentPlan('  skip  0082_file.sql\n\n0 would be applied, 82 skipped. Nothing was changed.\n'), true);
  assert.equal(isCurrentPlan('1 would be applied, 81 skipped. Nothing was changed.\n'), false);
  assert.equal(isCurrentPlan('0 applied, 82 already present.'), false);
  // And the contract itself: a spelled-out parameter list is the bug this gate had, so
  // the check is that the query never grows one back.
  assert.equal(/to_regprocedure\(\s*'[^']*\(/.test(sql), false);
  assert.equal(/pronargs\s*>=\s*8/.test(sql), true);
  assert.equal(/pronargs\s*>=\s*4/.test(sql), true);
  console.log('ok    rollout gate accepts only a fully current read-only migration plan');
  process.exit(0);
}

const url = process.env.SUPABASE_DB_URL ?? '';
if (!url) {
  console.error('SUPABASE_DB_URL is required for the member-site migration gate.');
  process.exit(2);
}
const seconds = Number(process.env.BSDC_MESSENGER_WAIT_SECONDS ?? 900);
const interval = Number(process.env.BSDC_MESSENGER_POLL_SECONDS ?? 15);
if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(interval) || interval <= 0) {
  console.error('Invalid messenger migration gate timeout or polling interval.');
  process.exit(2);
}
const deadline = Date.now() + seconds * 1_000;
let last = '';
for (;;) {
  let reason = 'the database ledger is not current';
  try {
    const { stdout } = await exec(process.execPath, [dryRun, '--dry-run'], {
      cwd: root, env: { ...process.env, PGCONNECT_TIMEOUT: '10' }, timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
    });
    if (isCurrentPlan(stdout)) {
      reason = 'the required messenger database functions or privileges are missing';
      const result = await exec('psql', [url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
        env: { ...process.env, PGCONNECT_TIMEOUT: '10' }, timeout: 30_000, maxBuffer: 1024 * 1024,
      });
      if (result.stdout.trim() === 'true' || result.stdout.trim() === 't') {
        console.log('ok    the ordered migration ledger and messenger database contract are current');
        break;
      }
    }
  } catch {
    // Neither a connection string nor the database error can enter the log.
    reason = 'the database could not be checked';
  }
  if (reason !== last) {
    console.log(`Waiting: ${reason}.`);
    last = reason;
  }
  if (Date.now() >= deadline) {
    console.error('Messenger migration gate timed out. Check the Database workflow and SUPABASE_DB_URL; the member-site deployment was not published.');
    process.exit(1);
  }
  await wait(Math.min(interval * 1_000, Math.max(0, deadline - Date.now())));
}
