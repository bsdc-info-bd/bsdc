/**
 * Proof that the migrations waiting to be applied can be applied twice.
 *
 * A migration that is not re-runnable is a migration that fails in the middle
 * of a production push, halfway through a file, and the way to know is to run
 * it twice against a database that already has it: `create or replace` is a
 * no-op, `drop … if exists` before `create` is a no-op, and a `grant` or
 * `revoke` that is issued again says the same thing. Anything that only
 * *looks* idempotent — a policy created without dropping it first, a function
 * whose result shape changed, a publication member added twice — errors here.
 *
 * The files under test are the ones not yet in production: 0046, 0047, 0048,
 * 0049, 0050, 0051 and 0052, applied a second and a third time.
 */
import { readFileSync } from 'node:fs';
import { makeDb } from './lib.mjs';
import { MIGRATIONS_DIR } from './lib.mjs';

const FILES = [
  '0046_maintenance_is_not_a_public_endpoint.sql',
  '0047_message_notification_kind.sql',
  '0048_a_message_is_not_a_comment.sql',
  '0049_internal_helpers_stop_answering.sql',
  '0050_thirty_day_recovery.sql',
  '0051_the_messenger_is_live.sql',
  '0052_a_moderator_is_not_a_stranger.sql',
  '0053_the_new_endpoints_stop_answering_strangers.sql',
  '0054_an_endpoint_that_demands_a_member_is_not_for_visitors.sql',
  '0055_the_first_owner_has_nobody_to_ask.sql',
];
const DIR = MIGRATIONS_DIR;

let pass = 0;
const bad = [];
async function check(sql, expected, label) {
  try {
    const result = await db.query(sql);
    const got = result.rows[0] ? Object.values(result.rows[0])[0] : undefined;
    if (String(got) === String(expected)) {
      pass += 1;
      console.log(`ok    ${label}`);
    } else {
      bad.push(label);
      console.log(
        `FAIL  ${label}  -> got ${JSON.stringify(got)}, wanted ${JSON.stringify(expected)}`,
      );
    }
  } catch (e) {
    bad.push(label);
    console.log(`FAIL  ${label}  -> [${e.code ?? '?'}] ${String(e.message).split('\n')[0]}`);
  }
}

const db = await makeDb();

// Everything is in place after the first application.
await check(
  `select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'comments' and cmd = 'UPDATE'`,
  1,
  'one update policy on comments after the first pass',
);
await check(
  `select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'`,
  8,
  'the realtime publication holds eight tables after the first pass',
);
await check(
  `select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'my_deleted_content'`,
  1,
  'one trash function after the first pass',
);

// Apply every pending file twice more.
for (const round of [2, 3]) {
  for (const file of FILES) {
    const sql = readFileSync(`${DIR}/${file}`, 'utf8');
    try {
      await db.exec(`begin;\n${sql}\ncommit;`);
      pass += 1;
      console.log(`ok    round ${round}: ${file}`);
    } catch (e) {
      // A failed statement leaves the session in an aborted transaction; the
      // rollback is what lets the remaining files report their own verdict
      // instead of inheriting this one's.
      await db.exec('rollback').catch(() => undefined);
      bad.push(`round ${round}: ${file}`);
      console.log(
        `FAIL  round ${round}: ${file}  -> [${e.code ?? '?'}] ${String(e.message).split('\n')[0]}`,
      );
    }
  }
}

// And the state it promised is still exactly one of each.
await check(
  `select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'comments' and cmd = 'UPDATE'`,
  1,
  'still one update policy on comments',
);
await check(
  `select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'comments' and cmd = 'SELECT'`,
  1,
  'still one select policy on comments',
);
await check(
  `select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'`,
  8,
  'still eight tables in the publication',
);
await check(
  `select count(*)::int from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'messages'`,
  1,
  'and messages is in it once, not twice',
);
await check(
  `select count(*)::int
     from information_schema.columns
     where table_schema = 'public' and table_name = 'conversation_members'
       and column_name in ('is_pinned', 'is_archived', 'draft_body')`,
  3,
  'the member settings columns exist exactly once each',
);
await check(
  `select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in
       ('toggle_message_reaction', 'mark_message_read', 'toggle_message_pin', 'toggle_message_star',
        'search_messages', 'conversation_pins', 'conversation_state', 'saved_messages')`,
  8,
  'the messenger RPCs exist once each',
);
await check(
  `select count(*)::int from public.my_deleted_content(10)`,
  0,
  'the trash function still answers after three passes',
);
await check(
  `select count(*)::int
     from information_schema.routines r
     where r.routine_schema = 'public' and r.routine_name = 'my_deleted_content'`,
  1,
  'and there is exactly one of it',
);
await check(
  `select (select count(*)::int from information_schema.parameters
             where specific_schema = 'public' and specific_name like 'my_deleted_content%'
               and parameter_mode = 'OUT')`,
  9,
  'whose result carries all nine columns, including the one 0052 added',
);
await check(
  `select has_function_privilege('anon', 'public.my_deleted_content(integer)', 'execute')`,
  false,
  'and it is still not an anonymous endpoint',
);
await check(
  `select has_function_privilege('anon', 'public.prune_feed_seen(integer)', 'execute')`,
  false,
  'the maintenance routine is still refused to anonymous callers after re-applying 0046',
);
await check(
  `select has_function_privilege('service_role', 'public.prune_feed_seen(integer)', 'execute')`,
  true,
  'and still granted to the role maintenance runs as',
);

console.log('');
console.log(`SUMMARY: ${pass} passed, ${bad.length} failed`);
if (bad.length) console.log(`  failed: ${bad.join(', ')}`);
process.exit(bad.length === 0 ? 0 : 1);
