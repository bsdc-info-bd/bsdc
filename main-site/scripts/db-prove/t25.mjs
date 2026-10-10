/**
 * Proof for 0053: the functions this round added answer signed-in members and
 * refuse anonymous callers.
 *
 * Before: every one of them carried Postgres's default EXECUTE grant to
 * PUBLIC, which includes `anon` — `grant … to authenticated` had added nothing
 * that was not already there. The guards inside refused the work, but the call
 * itself was accepted, which is a door that only says no.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDb } from './lib.mjs';
import { MIGRATIONS_DIR } from './lib.mjs';

const SIGNATURES = {
  'my_deleted_content(integer)': 'authenticated',
  'toggle_message_reaction(uuid,text)': 'authenticated',
  'mark_message_read(uuid)': 'authenticated',
  'toggle_message_pin(uuid)': 'authenticated',
  'toggle_message_star(uuid)': 'authenticated',
  'search_messages(text,uuid,integer)': 'authenticated',
  'conversation_pins(uuid)': 'authenticated',
  'conversation_state(uuid)': 'authenticated',
  'conversation_messages(uuid,timestamp with time zone,integer)': 'authenticated',
  'saved_messages(integer)': 'authenticated',
  'purge_deleted_content(integer)': 'service_role',
};

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

for (const [signature, role] of Object.entries(SIGNATURES)) {
  await check(
    `select has_function_privilege('anon', 'public.${signature}', 'execute')`,
    false,
    `anonymous cannot call ${signature.split('(')[0]}`,
  );
  await check(
    `select has_function_privilege(${role === 'service_role' ? `'service_role'` : `'authenticated'`}, 'public.${signature}', 'execute')`,
    true,
    `${role} still can`,
  );
}

// Applying the file again says the same thing.
for (let round = 1; round <= 2; round += 1) {
  try {
    await db.exec(
      readFileSync(
        join(MIGRATIONS_DIR, '0053_the_new_endpoints_stop_answering_strangers.sql'),
        'utf8',
      ),
    );
    pass += 1;
    console.log(`ok    0053 re-applied (round ${round})`);
  } catch (e) {
    bad.push(`0053 re-applied (round ${round})`);
    console.log(
      `FAIL  0053 re-applied (round ${round})  -> [${e.code ?? '?'}] ${String(e.message).split('\n')[0]}`,
    );
  }
}
await check(
  `select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'my_deleted_content'`,
  1,
  'still exactly one trash function',
);
await check(
  `select has_function_privilege('anon', 'public.toggle_message_reaction(uuid,text)', 'execute')`,
  false,
  'and the revoke held through the re-application',
);

console.log('');
console.log(`SUMMARY: ${pass} passed, ${bad.length} failed`);
if (bad.length) console.log(`  failed: ${bad.join(', ')}`);
process.exit(bad.length === 0 ? 0 : 1);
