/**
 * Proof for 0056: legacy Supabase Storage remains locked to the owner of each
 * object, while the current upload client routes new bytes only to ImgBB or
 * Cloudinary. The bucket and policies remain useful for old rows created before
 * the external-host rule; they are not an upload destination anymore.
 *
 * These database checks prove that any object already in that bucket stays
 * protected: the first path segment is the member uid, which the RLS policy
 * compares against `bsdc.current_uid()`. Separate client-source checks prove
 * new uploads do not call the Storage REST endpoint and ordinary images use
 * ImgBB's required base64 body.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDb, MIGRATIONS_DIR } from './lib.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const MIGRATION = join(MIGRATIONS_DIR, '0056_a_picture_needs_somewhere_to_live.sql');
const UPLOAD_MODULE = join(HERE, '..', '..', 'src', 'lib', 'storage', 'upload.ts');
// The routing table moved into its own module so the browser and the edge read
// the same answer. A source check that only read the transport would pass on a
// contract that had quietly changed underneath it.
const CONTRACT_MODULE = join(HERE, '..', '..', 'src', 'lib', 'storage', 'media-contract.ts');
const EDGE_MEDIA_MODULE = join(HERE, '..', '..', 'functions', '_media.ts');
const EDGE_UPLOAD_ENDPOINT = join(HERE, '..', '..', 'functions', 'api', 'media', 'upload.ts');

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

const db = await makeDb();

await db.exec(`
  insert into public.profiles (uid, username, display_name, role) values
    ('me-1',  'mefirst',  'Me First',  'member'),
    ('you-2', 'yousecond','You Second','member'),
    ('mod-3', 'modthird', 'Moderator', 'moderator');
`);

async function as(sub, sql) {
  const payload = JSON.stringify({
    sub,
    role: 'authenticated',
    bsdc_role: 'member',
    email: `${sub}@bsdc.info.bd`,
    email_verified: true,
  });
  try {
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claims', $jwt$${payload}$jwt$, false);`,
    );
    return { ok: true, rows: (await db.query(sql)).rows };
  } catch (error) {
    return { ok: false, code: error.code, message: String(error.message).split('\n')[0] };
  } finally {
    await db.exec('reset role;');
  }
}

// ---------------------------------------------------------------- the bucket ---
const bucket = await db.query(
  `select id, name, "public", file_size_limit, allowed_mime_types
     from storage.buckets where id = 'media'`,
);
check(bucket.rows.length === 1, 'the media bucket exists');
const row = bucket.rows[0] ?? {};
check(row.public === true, 'and it is public, so a picture has a URL anybody can open');
check(
  Number(row.file_size_limit) === 20 * 1024 * 1024,
  'with a twenty megabyte ceiling',
  String(row.file_size_limit),
);
const mimes = row.allowed_mime_types ?? [];
for (const wanted of ['image/jpeg', 'image/webp', 'audio/webm', 'video/mp4', 'application/pdf']) {
  check(mimes.includes(wanted), `accepting ${wanted}`);
}

const providers = await db.query(
  `select unnest(enum_range(null::bsdc_media_provider))::text as provider`,
);
check(
  providers.rows.map((entry) => entry.provider).includes('supabase'),
  'media_assets can record the new provider',
);

const policies = await db.query(
  `select policyname, cmd from pg_policies
    where schemaname = 'storage' and tablename = 'objects' order by 1`,
);
check(policies.rows.length === 5, `five policies guard the objects (${policies.rows.length})`);
for (const command of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL']) {
  check(
    policies.rows.some((policy) => policy.cmd === command),
    `one of them is for ${command}`,
  );
}

// The convention has to be the same one the client writes, or every upload is
// refused by a policy that is looking in the wrong segment.
const written = policies.rows.filter((policy) => policy.cmd === 'INSERT');
const definition = await db.query(
  `select pg_get_expr(coalesce(polwithcheck, polqual), polrelid) as insert_check
     from pg_policy p join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects' and p.polcmd = 'a'`,
);
const checkText = String(definition.rows[0]?.insert_check ?? '');
check(
  checkText.includes('split_part') && checkText.includes('current_uid'),
  'the write policy compares the first path segment with the signed-in member',
  checkText.slice(0, 120),
);
check(written.length === 1, 'and there is exactly one write policy to get wrong');

const source = readFileSync(UPLOAD_MODULE, 'utf8');
check(
  !/storage\/v1\/object\/media\//.test(source) && !/uploadToSupabase/.test(source),
  'new client uploads never send image bytes to Supabase Storage',
);
check(
  source.includes("body.append('image', base64)") && source.includes('api.imgbb.com/1/upload?key='),
  'ordinary images reach ImgBB as base64 with the key in the URL',
);
const contract = readFileSync(CONTRACT_MODULE, 'utf8');
const edgeMedia = readFileSync(EDGE_MEDIA_MODULE, 'utf8');
const edgeUpload = readFileSync(EDGE_UPLOAD_ENDPOINT, 'utf8');

check(
  contract.includes("'project-cover'") && source.includes('api.cloudinary.com/v1_1/'),
  'important covers have a Cloudinary-only route',
);

// One routing table, two readers. If the edge ever grew its own copy of
// `chooseProvider`, the two could disagree and a cover would land where the
// reader cannot fetch it — which is the failure this harness exists to catch.
check(
  edgeMedia.includes("from '../src/lib/storage/media-contract'") &&
    !/function chooseProvider/.test(edgeMedia),
  'the edge imports the routing table rather than restating it',
);

// The endpoint holds the keys, and the ImgBB one is a secret that must not be
// handed back to a browser that asks what is configured.
check(
  edgeUpload.includes('memberOf') && edgeUpload.includes('isMediaPurpose'),
  'the upload endpoint identifies its caller and validates the purpose',
);
check(
  !/IMGBB_API_KEY/.test(readFileSync(join(HERE, '..', '..', 'functions', 'api', 'media', 'providers.ts'), 'utf8')),
  'the capability endpoint never returns a key',
);

// ------------------------------------------------------------ whose folder ---
const mine = await as(
  'me-1',
  `insert into storage.objects (bucket_id, name, metadata)
   values ('media', 'me-1/post-image/202610/a.jpg', '{}'::jsonb) returning name`,
);
check(mine.ok, 'a member stores a picture in their own folder', mine.message ?? '');

const yours = await as(
  'me-1',
  `insert into storage.objects (bucket_id, name, metadata)
   values ('media', 'you-2/post-image/202610/b.jpg', '{}'::jsonb) returning name`,
);
check(
  !yours.ok && yours.code === '42501',
  "and cannot store one in somebody else's",
  yours.code ?? 'unexpectedly allowed',
);

const elsewhere = await as(
  'me-1',
  `insert into storage.objects (bucket_id, name, metadata)
   values ('private', 'me-1/x.jpg', '{}'::jsonb) returning name`,
);
check(
  !elsewhere.ok && elsewhere.code === '42501',
  'or in another bucket',
  elsewhere.code ?? 'unexpectedly allowed',
);

await as(
  'you-2',
  `insert into storage.objects (bucket_id, name, metadata)
   values ('media', 'you-2/avatar/202610/c.png', '{}'::jsonb) returning name`,
);

const moved = await as(
  'me-1',
  `update storage.objects set name = 'me-1/post-image/202610/renamed.jpg'
    where name = 'me-1/post-image/202610/a.jpg' returning name`,
);
check(moved.ok, 'a member may rename their own object', moved.message ?? '');

const stolen = await as(
  'me-1',
  `update storage.objects set name = 'me-1/stolen.jpg'
    where name = 'you-2/avatar/202610/c.png' returning name`,
);
// Row security on an update does not raise: the row is simply not there to
// match, so the honest assertion is that nothing changed.
check(
  !stolen.ok || (stolen.rows ?? []).length === 0,
  "and may not move somebody else's into their folder",
  JSON.stringify(stolen.rows ?? stolen.code),
);
const untouched = await db.query(
  `select count(*)::int as n from storage.objects where name = 'you-2/avatar/202610/c.png'`,
);
check((untouched.rows[0]?.n ?? 0) === 1, 'and it is still where its owner put it');

const deletedTheirs = await as(
  'me-1',
  `delete from storage.objects where name = 'you-2/avatar/202610/c.png' returning name`,
);
check(
  !deletedTheirs.ok || (deletedTheirs.rows ?? []).length === 0,
  'a member cannot delete a picture that is not theirs',
);
const stillThere = await db.query(
  `select count(*)::int as n from storage.objects where name = 'you-2/avatar/202610/c.png'`,
);
check((stillThere.rows[0]?.n ?? 0) === 1, 'and it is still there afterwards');

const deletedMine = await as(
  'me-1',
  `delete from storage.objects
    where name = 'me-1/post-image/202610/renamed.jpg' returning name`,
);
check(
  deletedMine.ok && (deletedMine.rows ?? []).length === 1,
  'but can delete their own',
  deletedMine.message ?? '',
);

// 0057: staff is what the database says, not what a claim happens to carry.
// This moderator was promoted in the panel and has no `staff` claim at all.
const staffCheck = await as('mod-3', `select bsdc.is_staff() as staff`);
check(
  staffCheck.ok && staffCheck.rows?.[0]?.staff === true,
  'a member promoted in the panel is staff to row security as well',
  JSON.stringify(staffCheck.rows ?? staffCheck.message),
);
const memberCheck = await as('me-1', `select bsdc.is_staff() as staff`);
check(memberCheck.ok && memberCheck.rows?.[0]?.staff === false, 'and an ordinary member is not');

// A moderator removing a reported picture is not the member whose folder it is in.
const moderated = await as(
  'mod-3',
  `delete from storage.objects where name = 'you-2/avatar/202610/c.png' returning name`,
);
check(
  moderated.ok && (moderated.rows ?? []).length === 1,
  'staff can remove what was reported, wherever it lives',
  moderated.message ?? '',
);

// ------------------------------------------------------------- who may read ---
await db.exec(
  `set role anon; select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', false);`,
);
try {
  await db.query(`insert into storage.objects (bucket_id, name) values ('media', 'x/y.jpg')`);
  check(false, 'a visitor cannot write into the bucket');
} catch (error) {
  check(error.code === '42501', 'a visitor cannot write into the bucket', error.code);
}
try {
  const readable = await db.query(`select count(*)::int as n from storage.objects`);
  check(readable.rows[0].n >= 0, 'but can read what the bucket holds');
} catch (error) {
  check(false, 'but can read what the bucket holds', error.code);
}
await db.exec('reset role;');

// ------------------------------------------------- the record that follows it ---
const asset = await as(
  'me-1',
  `insert into public.media_assets (owner_uid, provider, kind, url, bytes, mime_type)
   values ('me-1', 'imgbb', 'image', 'https://i.ibb.co/example/post-image.jpg', 20480, 'image/jpeg')
   returning provider::text as provider, url`,
);
check(
  asset.ok && asset.rows?.[0]?.provider === 'imgbb',
  'and the external upload is recorded as an ImgBB media-asset row, not a Storage object',
  asset.message ?? '',
);

// ------------------------------------------------------------- twice over ---
for (let round = 1; round <= 2; round += 1) {
  try {
    await db.exec(readFileSync(MIGRATION, 'utf8'));
    check(true, `0056 re-applied (round ${round})`);
  } catch (error) {
    check(false, `0056 re-applied (round ${round})`, String(error.message).split('\n')[0]);
  }
}
const buckets = await db.query(`select count(*)::int as n from storage.buckets where id = 'media'`);
check((buckets.rows[0]?.n ?? 0) === 1, 'there is still exactly one bucket');
const policiesAfter = await db.query(
  `select count(*)::int as n from pg_policies where schemaname = 'storage' and tablename = 'objects'`,
);
check((policiesAfter.rows[0]?.n ?? 0) === 5, 'and still exactly five policies');
const stillRefused = await as(
  'me-1',
  `insert into storage.objects (bucket_id, name) values ('media', 'you-2/x.jpg') returning name`,
);
check(!stillRefused.ok, "and writing into another member's folder is still refused");

await db.close();
console.log('');
console.log(`SUMMARY: ${pass} passed, ${bad.length} failed`);
if (bad.length) console.log(`  failed: ${bad.join(', ')}`);
process.exit(bad.length === 0 ? 0 : 1);
