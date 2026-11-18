/**
 * Proof for 0118: the internal writers stop answering the door.
 *
 * Three security-definer functions in the `bsdc` schema write to tables no client
 * may write — `bsdc.audit` into `public.audit_log`, and `bsdc.note_deployment` /
 * `bsdc.resolve_deployment_note` into `bsdc.deployment_notes` — and none of them
 * asks who is calling. PostgreSQL grants EXECUTE to PUBLIC by default, and 0002
 * grants usage on the `bsdc` schema to anon and authenticated, so all three were
 * callable by anyone holding only the publishable key. 0049 closed the helpers
 * that existed then and 0068 revoked the four-argument audit overload, but the
 * three-argument audit overload from 0024 and the two deployment-note functions
 * from 0056 were never revoked.
 *
 * This checks both directions:
 *  1. anon and authenticated can no longer execute any overload of the three
 *     names, and calling them raises 42501 rather than succeeding;
 *  2. the owner still can (the legitimate caller is a security-definer function,
 *     which runs as the owner), and the read-only helpers that RLS policies name
 *     still answer — so the fix did not over-reach into the policy layer.
 */
import { check, expectFail, makeDb } from './lib.mjs';

const MEMBER = 'aaaaaaaa-1111-4111-8111-000000000001';

const db = await makeDb();

// --- 1. the catalogue says no ------------------------------------------------
const open = (
  await db.query(`
    select p.proname as name,
           pg_get_function_identity_arguments(p.oid) as args,
           has_function_privilege('anon', p.oid, 'execute') as anon,
           has_function_privilege('authenticated', p.oid, 'execute') as auth
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'bsdc'
       and p.proname in ('audit', 'note_deployment', 'resolve_deployment_note')
     order by 1, 2
  `)
).rows;

check(open.length >= 3, `the three writers exist (${open.length} overloads)`);
const reachable = open.filter((row) => row.anon || row.auth);
check(
  reachable.length === 0,
  'no overload of audit, note_deployment or resolve_deployment_note answers a client',
  reachable.map((row) => `${row.name}(${row.args})`).join(', '),
);

// --- 2. calling them as anon raises 42501, not a silent success --------------
async function anonRefused(sql, label) {
  try {
    await db.exec(
      `set role anon; select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', false);`,
    );
    await db.query(sql);
    check(false, label, 'the statement succeeded');
  } catch (error) {
    check(error.code === '42501', label, `raised ${error.code ?? '?'}`);
  } finally {
    await db.exec('reset role;');
  }
}

await anonRefused(
  `select bsdc.audit('forged', 'somebody', '{}'::jsonb)`,
  'an anonymous caller cannot forge an audit row (42501)',
);
await anonRefused(
  `select bsdc.note_deployment('storage.schema', 'nothing to see here')`,
  'an anonymous caller cannot overwrite a deployment fault (42501)',
);
await anonRefused(
  `select bsdc.resolve_deployment_note('storage.schema')`,
  'an anonymous caller cannot resolve a live fault (42501)',
);

// --- 3. a signed-in member is refused too ------------------------------------
await expectFail(
  db,
  MEMBER,
  `select bsdc.audit('forged', 'somebody', '{}'::jsonb)`,
  '42501',
  'a signed-in member cannot forge an audit row',
);
await expectFail(
  db,
  MEMBER,
  `select bsdc.note_deployment('storage.schema', 'nothing to see here')`,
  '42501',
  'a signed-in member cannot overwrite a deployment fault',
);
await expectFail(
  db,
  MEMBER,
  `select bsdc.resolve_deployment_note('storage.schema')`,
  '42501',
  'a signed-in member cannot resolve a live fault',
);

// --- 4. the legitimate caller still works ------------------------------------
// Security-definer functions run as the owner, so the owner must still be able to
// write through them. This is the call the migration's own DO blocks make.
await db.exec(`select bsdc.audit('verify.0118', 'self-test', '{}'::jsonb)`);
const auditRows = (
  await db.query(
    `select count(*)::int as c from public.audit_log where action = 'verify.0118'`,
  )
).rows[0].c;
check(auditRows === 1, 'the owner can still write an audit row through bsdc.audit');

await db.exec(`select bsdc.note_deployment('verify.0118', 'the owner wrote this')`);
const noteRows = (
  await db.query(
    `select count(*)::int as c from bsdc.deployment_notes where topic = 'verify.0118'`,
  )
).rows[0].c;
check(noteRows === 1, 'the owner can still record a deployment note');

// --- 5. the policy helpers still answer --------------------------------------
// Revoking the writers must not have touched the read-only helpers that RLS
// policies call as the caller. If a future migration over-reaches, this is the
// check that says so.
const helpers = (
  await db.query(`
    select p.proname as name,
           has_function_privilege('anon', p.oid, 'execute') as anon
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'bsdc'
       and p.proname in ('is_staff', 'has_permission', 'actor_role')
  `)
).rows;
check(
  helpers.length === 3 && helpers.every((row) => row.anon),
  'the read-only policy helpers still answer a caller',
  helpers.map((row) => `${row.name}=${row.anon}`).join(', '),
);

await db.close();
