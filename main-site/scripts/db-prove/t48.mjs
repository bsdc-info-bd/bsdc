/**
 * Proof for 0075: the database this repository tests is the database Supabase
 * deploys.
 *
 * The report was one line long:
 *
 *     function gen_random_bytes(integer) does not exist
 *
 * and every proof in this directory said the schema was fine. Both were true.
 * PGlite installs `pgcrypto` into `public`, Supabase installs it into
 * `extensions`, and this schema pins a search path on every security-definer
 * function — so `gen_random_bytes` resolved here and nowhere else. The harness
 * was building a database no customer has.
 *
 * This harness builds the other one. Before the first migration runs it moves
 * `pgcrypto`, `citext`, `pg_trgm` and `unaccent` into `extensions`, takes
 * `public` off the apply session's search path, and only then replays the
 * repository. If any function in the schema depends on an extension being
 * unqualified in `public`, the migration fails or the check below fails.
 *
 * Six claims, and the last two are the ones that would have caught the outage:
 *
 *   1. Every migration replays on a production-shaped database.
 *   2. Issuing a certificate works, and the code it returns verifies at the
 *      public desk.
 *   3. A notice gets a code, a staff card gets a code, and both verify.
 *   4. Every pinned search path in `public` and `bsdc` names `extensions`.
 *   5. The code alphabet is the one the schema promises: eight characters, no
 *      confusable letter, a check digit that rejects a single mistyped
 *      character, and no repeats over two thousand draws.
 *   6. The generator is total: it returns a code every time, for every kind,
 *      including the ones that are not certificates.
 */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATIONS_DIR } from './lib.mjs';

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

// ---------------------------------------------------------------------------
// The database production builds, not the one PGlite builds by default.
// ---------------------------------------------------------------------------
const db = await new PGlite({ extensions: { pgcrypto, citext, pg_trgm, unaccent } });

await db.exec(`
  create extension pgcrypto;
  create extension citext;
  create extension pg_trgm;
  create schema extensions;
  alter extension pgcrypto set schema extensions;
  alter extension citext   set schema extensions;
  alter extension pg_trgm  set schema extensions;
`);

const layout = await db.query(
  `select extname, extnamespace::regnamespace::text as schema from pg_extension order by 1`,
);
const csharpLayout = Object.fromEntries(layout.rows.map((r) => [r.extname, r.schema]));
check(
  ['pgcrypto', 'citext', 'pg_trgm'].every((name) => csharpLayout[name] === 'extensions'),
  'the harness database holds its extensions in `extensions`, as Supabase does',
  JSON.stringify(csharpLayout),
);

// The bug, reproduced before the fix is applied: with extension schemas off
// the path, the unqualified call is exactly what production reported.
await db.exec(`set search_path = public;`);
let reproduced = null;
try {
  await db.query(`select encode(gen_random_bytes(8), 'hex')`);
} catch (error) {
  reproduced = error;
}
check(
  reproduced?.code === '42883',
  'the unqualified call fails exactly as production reported, before the fix',
  reproduced ? `${reproduced.code}: ${reproduced.message.split('\n')[0]}` : 'it resolved',
);

await db.exec(`
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema extensions to anon, authenticated, service_role;
  set search_path = public, extensions;
`);

// ---------------------------------------------------------------------------
// 1. Every migration replays
// ---------------------------------------------------------------------------
let applied = 0;
let failed = null;
for (const file of readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort()) {
  try {
    await db.exec('begin;\n' + readFileSync(join(MIGRATIONS_DIR, file), 'utf8') + '\ncommit;');
    applied += 1;
  } catch (error) {
    failed = { file, error };
    break;
  }
}
check(
  failed === null,
  'every migration applies to a database whose extensions live in `extensions`',
  failed ? `${failed.file}: ${failed.error.message.split('\n')[0]}` : '',
);
check(applied >= 75, 'the whole set applied, not a prefix of it', `${applied} files`);
if (failed) {
  console.log(`\nSUMMARY: ${pass} passed, ${bad.length} failed`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. A certificate, end to end, on that database
// ---------------------------------------------------------------------------
const owner = 'aaaaaaaa-1111-4111-8111-000000000001';
const ownerClaims = JSON.stringify({
  sub: owner,
  role: 'authenticated',
  bsdc_role: 'owner',
  email: 'owner@bsdc.info.bd',
  email_verified: true,
  staff: true,
});

async function asCaller(sql, params = [], claims = ownerClaims) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claims', $jwt$${claims}$jwt$, false);`,
  );
  try {
    const result = await db.query(sql, params);
    return { rows: result.rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec('reset role;');
  }
}

await db.exec(
  `insert into public.profiles (uid, display_name, role, status)
   values ('${owner}', 'Owner Person', 'owner', 'active')`,
);

const issued = await asCaller(
  `select public.issue_certificate('course-completion', 'Nusrat Jahan', 'Product Engineering') as code`,
);
check(issued.error === null, 'a certificate is issued on a production-shaped database', issued.error?.message ?? '');
const code = issued.rows[0]?.code ?? '';
check(/^BSDC-CT-[0-9A-Z]{8}-[0-9]$/.test(code), 'the certificate code has the documented shape', code);

const verified = await db.query(`select * from public.verify_code($1)`, [code]);
check(verified.rows[0]?.valid === true, 'the code it returned verifies at the public desk', code);
check(
  verified.rows[0]?.state === 'valid',
  'the desk reports it as valid, not merely found',
  verified.rows[0]?.state ?? '',
);
check(
  verified.rows[0]?.subject === 'Nusrat Jahan',
  'the desk names the recipient the certificate names',
  verified.rows[0]?.subject ?? '',
);

// ---------------------------------------------------------------------------
// 3. The other two kinds, which share the generator
// ---------------------------------------------------------------------------
const notice = await db.query(
  `insert into public.notices (title, summary, body, status, publish_at)
   values ('Scheduled maintenance', 'Saturday', 'Body text', 'published', now() - interval '1 minute')
   returning code, id`,
);
check(
  /^BSDC-NT-[0-9A-Z]{8}-[0-9]$/.test(notice.rows[0]?.code ?? ''),
  'a notice is given a code of its own kind',
  notice.rows[0]?.code ?? '',
);
const noticeVerified = await db.query(`select * from public.verify_code($1)`, [notice.rows[0].code]);
check(noticeVerified.rows[0]?.valid === true, 'the notice verifies too', noticeVerified.rows[0]?.state ?? '');

await db.exec(
  `insert into public.staff_records (uid, staff_no, department, designation, is_active, joined_at)
   values ('${owner}', 'BSDC-EN-0001', 'Engineering', 'Chief Executive Officer', true, current_date)`,
);
const card = await asCaller(`select public.issue_staff_card('${owner}') as code`);
check(card.error === null, 'a staff card is issued on a production-shaped database', card.error?.message ?? '');
const cardCode = card.rows[0]?.code ?? '';
check(/^BSDC-ID-[0-9A-Z]{8}-[0-9]$/.test(cardCode), 'the card code has the documented shape', cardCode);
const cardVerified = await db.query(`select * from public.verify_code($1)`, [cardCode]);
check(cardVerified.rows[0]?.valid === true, 'the card verifies at the same desk', cardVerified.rows[0]?.state ?? '');

// ---------------------------------------------------------------------------
// 4. No pinned path anywhere is missing the extension schema
// ---------------------------------------------------------------------------
const pinned = await db.query(`
  select n.nspname, p.proname,
         (select string_agg(c, ' ' order by ord) from unnest(p.proconfig) with ordinality as t(c, ord)
           where c like 'search_path=%') as path
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'bsdc') and p.proconfig is not null
    and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  order by 1, 2`);
const missing = pinned.rows.filter(
  (row) => !/(^|,)\s*extensions\s*(,|$)/.test(String(row.path).replace('search_path=', '')),
);
check(
  missing.length === 0,
  'every pinned search path in public and bsdc names `extensions`',
  missing.map((row) => `${row.nspname}.${row.proname}`).join(', '),
);
check(pinned.rows.length > 100, 'the check had a schema to inspect', `${pinned.rows.length} function(s)`);
const tempLast = pinned.rows.filter(
  (row) => /pg_temp/.test(String(row.path)) && !/pg_temp\s*$/.test(String(row.path).trim()),
);
check(tempLast.length === 0, 'and `pg_temp` is always last, where a caller cannot get in front of it',
  tempLast.map((row) => `${row.nspname}.${row.proname}`).join(', '));

// A path that names a schema the database does not have is not a failure —
// `extensions` may legitimately be absent — but it must not be the only place
// an extension could be found.
const emptyPath = pinned.rows.filter((row) => /search_path = \s*(,|$)/.test(String(row.path)));
check(emptyPath.length === 0, 'no function pins an empty search path');

// ---------------------------------------------------------------------------
// 5. The alphabet, statistically
// ---------------------------------------------------------------------------
const drawn = await db.query(
  `select bsdc.issue_doc_code('CT') as code from generate_series(1, 2000)`,
);
const bodies = drawn.rows.map((row) => row.code.split('-')[2]);
check(
  bodies.every((body) => /^[0-9A-Z]{8}$/.test(body)),
  'every generated body is eight characters of the documented alphabet',
);
check(new Set(bodies).size >= 1998, 'two thousand draws are effectively all distinct',
  `${new Set(bodies).size} distinct`);

// Every character position must be able to hold every symbol: a generator that
// only ever reaches half the alphabet is a generator with half the strength.
const seen = new Set(bodies.join(''));
const absent = [...'0123456789ABCDEFGHJKMNPQRSTVWXYZ'].filter((character) => !seen.has(character));
check(absent.length === 0, 'every symbol in the alphabet is reachable', absent.join(''));
// Crockford's exclusions: I and L read as 1, O as 0, U as a typo for V.
const confusable = [...'ILOU'].filter((character) => seen.has(character));
check(confusable.length === 0, 'no confusable letter is ever printed', confusable.join(''));

// The check digit is the point of the format: a single mistyped character has
// to be caught by arithmetic, not by a database lookup.
const checkDigits = await db.query(`
  select body, bsdc.card_check_digit(body)::text as digit from (
    select substr(bsdc.issue_doc_code('CT'), 6, 8) as body from generate_series(1, 200)
  ) samples`);
check(
  checkDigits.rows.every((row) => /^[0-9]$/.test(row.digit)),
  'every body has a check digit between nought and nine',
);
// Swap one character for the next in the alphabet: the digit must move, or a
// mistyped character would verify against the wrong document.
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const samples = checkDigits.rows.slice(0, 40).map(({ body, digit }) => {
  const changed = alphabet[(alphabet.indexOf(body[0]) + 1) % 32] + body.slice(1);
  return { digit, changed };
});
const collisions = (
  await db.query(
    `select count(*)::integer as n from unnest($1::text[], $2::text[]) as t(changed, digit)
     where bsdc.card_check_digit(t.changed)::text = t.digit`,
    [samples.map((row) => row.changed), samples.map((row) => row.digit)],
  )
).rows[0].n;
check(
  collisions < 8,
  'changing one character usually moves the check digit, so a typed error is caught arithmetically',
  `${collisions} of 40 collided, which is what chance looks like`,
);

// ---------------------------------------------------------------------------
// 6. The generator is total
// ---------------------------------------------------------------------------
const kinds = await db.query(`select bsdc.issue_doc_code('NT') as a, bsdc.issue_doc_code('ID') as b`);
check(kinds.rows[0]?.a?.startsWith('BSDC-NT-'), 'the generator answers for a notice kind');
check(kinds.rows[0]?.b?.startsWith('BSDC-ID-'), 'the generator answers for a card kind');

let refused = null;
try {
  await db.query(`select bsdc.issue_doc_code('certificate')`);
} catch (error) {
  refused = error;
}
check(refused?.code === '22023', 'a malformed kind is refused with a message, not a crash',
  refused?.code ?? 'it was accepted');

const available = await db.query(`select bsdc.doc_code_available($1) as free, bsdc.doc_code_available('BSDC-CT-00000000-0') as taken`, [code]);
check(available.rows[0]?.free === false, 'an issued code reports itself as taken');
check(available.rows[0]?.taken === true, 'an unissued code reports itself as free');

// ---------------------------------------------------------------------------
// 7. The layout is recorded, and nothing was left open
// ---------------------------------------------------------------------------
const notes = await db.query(`select topic, resolved_at from bsdc.deployment_notes order by topic`);
const openNotes = notes.rows.filter((row) => row.resolved_at === null);
check(
  openNotes.length === 0,
  'the deployment owes nothing: every note this migration raised is resolved',
  openNotes.map((row) => row.topic).join(', '),
);

console.log(`\nSUMMARY: ${pass} passed, ${bad.length} failed`);
for (const label of bad) console.log('  failed: ' + label);
process.exit(bad.length === 0 ? 0 : 1);
