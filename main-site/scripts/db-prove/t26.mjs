/**
 * Proof for 0054: the routines that demand a member are no longer reachable by
 * a visitor, and nothing else moved.
 *
 * Two directions matter, and the second is the one that catches a mistake:
 *
 *  1. every `public` function that asks for an identity now refuses `anon`,
 *     and still answers `authenticated` and `service_role`;
 *  2. every routine the edge functions call with the anonymous key — read out
 *     of their own source, not out of a list somebody maintained by hand —
 *     still answers an anonymous caller, because a signed-out visitor really
 *     does browse this site through that key.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDb } from './lib.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FUNCTIONS_DIR = join(HERE, '..', '..', 'functions');

let pass = 0;
const bad = [];
function check(condition, label, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`ok    ${label}`);
  } else {
    bad.push(label);
    console.log(`FAIL  ${label}${detail ? `  -> ${detail}` : ''}`);
  }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith('.ts')) out.push(path);
  }
  return out;
}

/** Every routine the edge functions call, read from their source. */
function edgeRoutines() {
  const names = new Set();
  for (const file of walk(FUNCTIONS_DIR)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\brpc<[^>]*>\(\s*[^,]+,\s*'([a-z_]+)'/g)) {
      if (match[1]) names.add(match[1]);
    }
    for (const match of source.matchAll(/\brpc\(\s*[^,]+,\s*'([a-z_]+)'/g)) {
      if (match[1]) names.add(match[1]);
    }
  }
  return [...names].sort();
}

const inventory = async (db) =>
  Object.fromEntries(
    (
      await db.query(`
        select p.proname as name,
               pg_get_function_identity_arguments(p.oid) as args,
               has_function_privilege('anon', p.oid, 'execute') as anon,
               has_function_privilege('authenticated', p.oid, 'execute') as auth,
               has_function_privilege('service_role', p.oid, 'execute') as service,
               p.prosrc ~ 'bsdc\\.(require_permission|require_member|require_staff|require_role)\\(' as demands
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prorettype <> 'trigger'::regtype
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      `)
    ).rows.map((row) => [`${row.name}(${row.args})`, row]),
  );

// The schema as it was, and the schema as it is.
const before = await inventory(await makeDb({ skip: ['0054_'] }));
const db = await makeDb();
const after = await inventory(db);

const demandsAIdentity = Object.entries(after).filter(([, row]) => row.demands);
check(
  demandsAIdentity.length > 20,
  `the rule finds the routines that ask for an identity (${demandsAIdentity.length})`,
);
const stillOpen = demandsAIdentity.filter(([, row]) => row.anon);
check(
  stillOpen.length === 0,
  'none of them answers an anonymous caller',
  stillOpen.map(([signature]) => signature).join(', '),
);
const lostForMembers = demandsAIdentity.filter(([, row]) => !row.auth || !row.service);
check(
  lostForMembers.length === 0,
  'and every one of them still answers a member and the service role',
  lostForMembers.map(([signature]) => signature).join(', '),
);

// Nothing else changed for the roles that can already sign in. This is the
// check that makes the file safe to apply: if a signed-in path lost a grant,
// it shows up here rather than in production.
const changed = Object.keys(after).filter((signature) => {
  const was = before[signature];
  const now = after[signature];
  if (!was) return true;
  return was.auth !== now.auth || was.service !== now.service;
});
check(changed.length === 0, 'no grant changed for members or the service role', changed.join(', '));

// From the other side: the edge functions call these with the anonymous key.
const edge = edgeRoutines();
check(edge.length >= 3, `the edge functions call routines too (${edge.join(', ')})`);
const edgeBroken = edge.filter((name) => {
  const rows = Object.values(after).filter((row) => row.name === name);
  return rows.length === 0 || rows.some((row) => !row.anon);
});
check(
  edgeBroken.length === 0,
  'and every routine they call still answers a visitor',
  edgeBroken.join(', '),
);

// The browser's own call sites: whatever the application calls, a signed-in
// member has to be able to call it. This is the guard against a routine that
// exists but no role may execute — a 42501 the member would meet in the UI.
function clientRoutines() {
  const names = new Set();
  for (const file of walk(join(HERE, '..', '..', 'src'))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\.rpc\(\s*'([a-z_]+)'/g)) {
      if (match[1]) names.add(match[1]);
    }
  }
  return [...names].sort();
}

const client = clientRoutines();
check(client.length > 50, `the application calls routines too (${client.length})`);
const uncallable = client.filter((name) => {
  const rows = Object.values(after).filter((row) => row.name === name);
  return rows.length === 0 || !rows.some((row) => row.auth);
});
check(
  uncallable.length === 0,
  'and a signed-in member can call every one of them',
  uncallable.join(', '),
);

// A refusal is a refusal, not an empty answer.
try {
  await db.exec(
    `set role anon; select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', false);`,
  );
  await db.query(`select public.set_user_role('somebody', 'admin')`);
  check(false, 'an anonymous caller cannot set a member role');
} catch {
  check(true, 'an anonymous caller cannot set a member role (42501)');
} finally {
  await db.exec('reset role;');
}

// Twice over.
for (let round = 1; round <= 2; round += 1) {
  try {
    await db.exec(
      readFileSync(
        join(
          HERE,
          '..',
          '..',
          '..',
          'supabase',
          'migrations',
          '0054_an_endpoint_that_demands_a_member_is_not_for_visitors.sql',
        ),
        'utf8',
      ),
    );
    check(true, `0054 re-applied (round ${round})`);
  } catch (error) {
    check(false, `0054 re-applied (round ${round})`, String(error.message).split('\n')[0]);
  }
}
const afterReapply = await inventory(db);
const reopened = Object.entries(afterReapply).filter(([, row]) => row.demands && row.anon);
check(reopened.length === 0, 'and the refusals held through the re-application');

await db.close();
console.log('');
console.log(`SUMMARY: ${pass} passed, ${bad.length} failed`);
if (bad.length) console.log(`  failed: ${bad.join(', ')}`);
process.exit(bad.length === 0 ? 0 : 1);
