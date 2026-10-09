/**
 * Proof for 0056: a migration that meets a schema it does not own.
 *
 * Production refused the first version of this file on its seventy-third line —
 * `create table if not exists storage.buckets` — with `42501 permission denied
 * for schema storage`, because `storage` belongs to `supabase_storage_admin` and
 * the role that applies migrations has no CREATE there. `IF NOT EXISTS` does not
 * save it: Postgres checks the right to create in the namespace before it checks
 * whether the thing exists. One file, one transaction, so all seventeen pending
 * migrations rolled back with it.
 *
 * This harness builds that exact shape — the schema owned by somebody else, its
 * tables already there, row level security already on, and an applying role with
 * rights over everything this platform created and none over Storage — and then
 * applies the migration as that role. What has to happen is not that everything
 * gets created. It is that the file applies, the work that this role can do is
 * done, the work it cannot do is written down, and the next run by a role that
 * can, does it and clears the note.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDb, MIGRATIONS_DIR } from './lib.mjs';
import { DEPLOYMENT_NOTES_SQL, storageHealth } from '../../../scripts/db-health.mjs';

const MIGRATION = join(MIGRATIONS_DIR, '0056_a_picture_needs_somewhere_to_live.sql');
const sql = readFileSync(MIGRATION, 'utf8');

const POLICY_NAMES = [
  'bsdc media is readable by anybody',
  'bsdc media is written in your own folder',
  'bsdc media is moved in your own folder',
  'bsdc media is deleted by its owner',
  'bsdc media is reachable by staff',
];

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

/** Everything up to, but not including, the migration under test. */
const db = await makeDb({ maxExclusive: '0056_' });

// ------------------------------------------------------------- production ---
// Storage's own shape: the schema and its tables belong to Storage's role, row
// level security is already on, and the applying role can look but not touch.
await db.exec(`
  create role supabase_storage_admin nologin;
  create role bsdc_applier login;

  create schema storage authorization supabase_storage_admin;
  create table storage.buckets (
    id                   text primary key,
    name                 text not null unique,
    owner                text,
    created_at           timestamptz default now(),
    updated_at           timestamptz default now(),
    "public"             boolean default false,
    avif_autodetection   boolean default false,
    file_size_limit      bigint,
    allowed_mime_types   text[],
    owner_id             text
  );
  create table storage.objects (
    id                uuid primary key default gen_random_uuid(),
    bucket_id         text references storage.buckets (id),
    name              text,
    owner             text,
    created_at        timestamptz default now(),
    updated_at        timestamptz default now(),
    last_accessed_at  timestamptz default now(),
    metadata          jsonb,
    version           text,
    owner_id          text,
    unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  alter table storage.buckets owner to supabase_storage_admin;
  alter table storage.objects owner to supabase_storage_admin;

  grant usage on schema storage to anon, authenticated, service_role, bsdc_applier;
  grant select on storage.buckets to bsdc_applier;

  -- Everything this platform built, the applying role owns or may create in —
  -- which is exactly the position postgres is in on a real project, where the
  -- role owns the database and every schema this platform created, and owns
  -- nothing of Storage's.
  grant create on database postgres to bsdc_applier;
  grant create, usage on schema bsdc to bsdc_applier;
  grant create, usage on schema public to bsdc_applier;
  alter type bsdc_media_provider owner to bsdc_applier;
`);

const before = await db.query(`
  select has_schema_privilege('bsdc_applier', 'storage', 'CREATE') as may_create,
         (select count(*)::int from pg_policies
           where schemaname = 'storage' and tablename = 'objects') as policies,
         (select count(*)::int from storage.buckets) as buckets
`);
check(
  before.rows[0]?.may_create === false &&
    before.rows[0]?.policies === 0 &&
    before.rows[0]?.buckets === 0,
  'the shape is production\u2019s: no CREATE on storage, nothing in it that is ours',
  JSON.stringify(before.rows[0]),
);

// ------------------------------------------------------- the migration runs ---
await db.exec('set role bsdc_applier;');
let failure = null;
try {
  await db.exec(`begin;\n${sql}\ncommit;`);
} catch (error) {
  failure = error;
  // A refused statement leaves the transaction aborted; roll it back so the
  // harness can look at what the migration did manage to do.
  await db.exec('rollback;').catch(() => {});
}
await db.exec('reset role;');

check(
  failure === null,
  'the migration applies, which is the whole of the fix',
  failure === null ? '' : String(failure.message).split('\n').slice(0, 3).join(' | '),
);

/** The shape `db-push --check` hands to storageHealth: one row, one column, text. */
const ask = async (sql) => {
  const result = await db.query(sql);
  const row = result.rows[0];
  if (!row) return '';
  const value = Object.values(row)[0];
  return value === null || value === undefined ? '' : String(value);
};

// --------------------------------------------- and did what it was allowed ---
const enumValue = await db.query(
  `select exists (
     select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'bsdc_media_provider' and e.enumlabel = 'supabase'
   ) as added`,
);
check(enumValue.rows[0]?.added === true, 'the provider value it came to add is added');

const notes = await db.query(
  `select topic, detail from bsdc.deployment_notes where resolved_at is null order by topic`,
);
const topics = (notes.rows ?? []).map((row) => row.topic);
check(
  topics.includes('storage.policies'),
  'and the five policies it was refused are written down, not forgotten',
  JSON.stringify(topics),
);
check(
  topics.includes('storage.bucket'),
  'as is the bucket it could not create',
  JSON.stringify(topics),
);
check(
  (notes.rows ?? []).every((row) => row.detail.length > 40),
  'each note saying what to do about it',
);

const untouched = await db.query(`
  select (select count(*)::int from pg_policies
            where schemaname = 'storage' and tablename = 'objects') as policies,
         (select count(*)::int from storage.buckets) as buckets,
         (select pg_get_userbyid(relowner) from pg_class
           where oid = 'storage.objects'::regclass) as owner,
         (select relrowsecurity from pg_class
           where oid = 'storage.objects'::regclass) as rls
`);
check(
  untouched.rows[0]?.policies === 0 && untouched.rows[0]?.buckets === 0,
  'nothing was written into a schema this role does not own',
  JSON.stringify(untouched.rows[0]),
);
check(
  untouched.rows[0]?.owner === 'supabase_storage_admin' && untouched.rows[0]?.rls === true,
  'and Storage\u2019s own table is still Storage\u2019s, with its security still on',
);

const owed = await storageHealth(ask);
check(
  owed.problems.some((problem) => problem.includes('policies')) &&
    owed.problems.some((problem) => problem.includes('media')),
  '`db-push --check` names what is missing while it is missing',
  JSON.stringify(owed.problems),
);
check(
  owed.lines.every((line) => typeof line.ok === 'boolean' && line.label.length > 0),
  'and every question it asks of a real catalog gets an answer',
  String(owed.lines.length),
);

const openNotes = await db.query(DEPLOYMENT_NOTES_SQL);
check(
  openNotes.rows.length >= 2,
  'the notes query the deploy script runs returns them',
  String(openNotes.rows.length),
);

const notesProtected = await db.query(`
  select relrowsecurity as rls,
         (select count(*)::int from pg_policy p
           where p.polrelid = 'bsdc.deployment_notes'::regclass) as policies
    from pg_class where oid = 'bsdc.deployment_notes'::regclass
`);
check(
  notesProtected.rows[0]?.rls === true && notesProtected.rows[0]?.policies === 1,
  'the notes themselves are behind row level security, readable by staff',
);

// --------------------------------------------------- a role that can, does ---
await db.exec(`
  grant create on schema storage to bsdc_applier;
  alter table storage.buckets owner to bsdc_applier;
  alter table storage.objects owner to bsdc_applier;
  grant insert, update, delete on storage.buckets to bsdc_applier;
`);
await db.exec('set role bsdc_applier;');
let second = null;
try {
  await db.exec(`begin;\n${sql}\ncommit;`);
} catch (error) {
  second = error;
  await db.exec('rollback;').catch(() => {});
}
await db.exec('reset role;');

check(
  second === null,
  'the same file applies again once the rights are there',
  second === null ? '' : String(second.message).split('\n')[0],
);

const done = await db.query(
  `
  select (select count(*)::int from pg_policies p
            where p.schemaname = 'storage' and tablename = 'objects'
              and p.policyname = any ($1::text[])) as policies,
         (select count(*)::int from storage.buckets where id = 'media') as bucket,
         (select "public" from storage.buckets where id = 'media') as is_public,
         (select count(*)::int from bsdc.deployment_notes where resolved_at is null) as open_notes
`,
  [POLICY_NAMES],
);
check(done.rows[0]?.policies === 5, 'all five policies are there', String(done.rows[0]?.policies));
check(done.rows[0]?.bucket === 1, 'and so is the bucket', String(done.rows[0]?.bucket));
check(done.rows[0]?.is_public === true, 'public, so a media URL serves');
check(
  done.rows[0]?.open_notes === 0,
  'and every note that was owed is resolved, so the table is not a museum',
  String(done.rows[0]?.open_notes),
);

const settled = await storageHealth(ask);
check(
  settled.problems.length === 0,
  'and once a role with the rights has run it, `--check` says nothing is owed',
  JSON.stringify(settled.problems),
);
check(
  settled.lines.length === owed.lines.length + 2,
  'because it now gets far enough to ask about the bucket\u2019s limits',
  `${owed.lines.length} -> ${settled.lines.length}`,
);

const history = await db.query(
  `select count(*)::int as n from bsdc.deployment_notes where resolved_at is not null`,
);
check(history.rows[0]?.n >= 2, 'while the record of what was owed is kept');

await db.close();
console.log('');
console.log(`SUMMARY: ${pass} passed, ${bad.length} failed`);
if (bad.length) console.log(`  failed: ${bad.join(', ')}`);
process.exit(bad.length === 0 ? 0 : 1);
