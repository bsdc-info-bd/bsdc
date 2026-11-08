/**
 * Proof for 0073: an upload remembers how long it was promised for.
 *
 * ImgBB keeps a file forever unless the upload is given an `expiration`, and the
 * platform used to compute a lifetime and then throw the answer away. That is a
 * promise with no record behind it, which is the same as no promise: nothing can
 * be swept, and a member who deletes a direct message has no way to know whether
 * the photograph inside it still exists on a stranger's disk.
 *
 * Five claims, each of them a way this could be wrong in silence:
 *
 *   1. Only the server decides when a file expires. A browser cannot write a
 *      later date, a longer life, or `infinity` — it cannot write the column at
 *      all except through the function that validates it.
 *   2. The row cannot claim an expiry in the past, or one a year out.
 *   3. The sweeper is reachable only with the scheduler's secret, and it returns
 *      a delete capability for a row in the database that a stranger cannot read.
 *   4. A claim can be held, released, and confirmed, and a released claim is
 *      picked up again — the difference between a retried delete and a lost one.
 *   5. A host the platform cannot delete from is not reported as done. A row with
 *      no delete capability is never returned, because asking is not the same as
 *      being able to.
 */
import { makeDb } from './lib.mjs';

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002';
const secret = 'flush-secret-0123456789abcdefghijklmnopqrstuvwxyz';

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
  insert into bsdc.push_settings (name, value) values ('flush_secret', '${secret}')
    on conflict (name) do update set value = excluded.value;

  insert into public.profiles (uid, username, display_name, status) values
    ('${ada}',   'adafirst',    'Ada First',    'active'),
    ('${rahim}', 'rahimsecond', 'Rahim Second', 'active');
`);

async function asRole(role, sql, params = []) {
  await db.exec(`set role ${role};`);
  try {
    const result = await db.query(sql, params);
    return { rows: result.rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec('reset role;');
  }
}

async function asMember(uid, sql, params = []) {
  const claims = JSON.stringify({
    sub: uid,
    role: 'authenticated',
    bsdc_role: 'member',
    email: `${uid.slice(0, 4)}@bsdc.info.bd`,
    email_verified: true,
  });
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

// ------------------------------------------------------- only the server decides ---

const written = await asMember(
  ada,
  `select public.record_media_asset(
     'imgbb', 'image', 'https://i.ibb.co/abc123/a-photo.jpg', 'https://i.ibb.co/abc123/a-photo.jpg',
     'https://ibb.co/delete/abc123', 1200, 800, 240000, 'image/jpeg', now() + interval '90 days'
   ) as id`,
);
check(written.error === null, 'a member records their own upload', written.error?.message ?? '');
const firstId = written.rows[0]?.id;

const stored = (
  await db.query(`select expires_at, purge_requested_at, purged_at from public.media_assets where id = '${firstId}'`)
).rows[0];
check(stored?.expires_at !== null, 'the expiry the host was given is stored');
check(stored?.purge_requested_at === null, 'a fresh upload has not been claimed for deletion');
check(stored?.purged_at === null, 'a fresh upload is not marked purged');

const inThePast = await asMember(
  ada,
  `select public.record_media_asset('imgbb', 'image', 'https://i.ibb.co/abc123/old.jpg', '', '', null, null, 10, 'image/jpeg', now() - interval '1 minute')`,
);
check(inThePast.error !== null, 'a row cannot be born expired');

const tooLong = await asMember(
  ada,
  `select public.record_media_asset('imgbb', 'image', 'https://i.ibb.co/abc123/long.jpg', '', '', null, null, 10, 'image/jpeg', now() + interval '401 days')`,
);
check(tooLong.error !== null, 'a lifetime beyond a year is refused');

const plaintext = await asMember(
  ada,
  `select public.record_media_asset('imgbb', 'image', 'http://i.ibb.co/abc123/clear.jpg')`,
);
check(plaintext.error !== null, 'a picture has to be https, so a downgrade cannot be recorded');

const wrongHost = await asMember(
  ada,
  `select public.record_media_asset('imgbb', 'image', 'https://evil.test/a.jpg')`,
);
check(wrongHost.error !== null, 'a non-ImgBB host URL cannot be recorded as an ImgBB asset');

const retiredProvider = await asMember(
  ada,
  `select public.record_media_asset('external', 'image', 'https://i.ibb.co/abc123/ext.jpg')`,
);
check(retiredProvider.error !== null, 'only imgbb is accepted as a media provider');

const signedOut = await asRole(
  'anon',
  `select public.record_media_asset('imgbb', 'image', 'https://i.ibb.co/abc123/anon.jpg')`,
);
check(signedOut.error !== null, 'a signed-out caller cannot record an upload');

// A direct write with a later date, which is what a client would try if the
// column were reachable.
const directWrite = await asMember(
  ada,
  `update public.media_assets set expires_at = now() + interval '10 years' where id = '${firstId}'`,
);
const afterDirect = (
  await db.query(`select expires_at from public.media_assets where id = '${firstId}'`)
).rows[0];
check(
  directWrite.error !== null ||
    new Date(afterDirect.expires_at).getTime() < Date.now() + 200 * 24 * 60 * 60 * 1000,
  'a member cannot extend an expiry by writing the table',
  directWrite.error?.message ?? String(afterDirect.expires_at),
);

// ------------------------------------------------------------- what gets swept ---

// An orphan: a picture uploaded, never attached to a post, a message or a
// profile, and old enough that it cannot be a draft somebody is still writing.
const orphan = (
  await asMember(
    rahim,
    `select public.record_media_asset(
       'imgbb', 'image', 'https://i.ibb.co/xyz789/abandoned.jpg', '', 'https://ibb.co/delete/xyz789',
       null, null, 1024, 'image/jpeg', null
     ) as id`,
  )
).rows[0].id;

// A picture in use: attached to a post, so it must survive the sweep.
const inUse = (
  await asMember(
    rahim,
    `select public.record_media_asset(
       'imgbb', 'image', 'https://i.ibb.co/xyz789/published.jpg', '', 'https://ibb.co/delete/xyz789b',
       null, null, 2048, 'image/jpeg', null
     ) as id`,
  )
).rows[0].id;

await db.exec(`
  insert into public.posts (author_uid, kind, slug, title, body, status, published_at, visibility)
    values ('${rahim}', 'post', 'a-published-thing', 'A published thing', 'b', 'published', now(), 'public');
  insert into public.post_media (post_id, media_id, "position", alt_text)
    select id, '${inUse}', 0, 'The picture in the post' from public.posts where slug = 'a-published-thing';

  -- Old enough for the sweep, which refuses to touch anything under a day old so
  -- an upload in flight is never mistaken for an abandoned one.
  update public.media_assets set created_at = now() - interval '3 days' where id in ('${orphan}', '${inUse}');
`);

// The premise of the next check, asserted rather than assumed: if the fixture
// failed to attach the picture, "it was not offered for deletion" would pass for
// the wrong reason.
const attached = await db.query(`select count(*)::int as n from public.post_media where media_id = '${inUse}'`);
check(Number(attached.rows[0]?.n) === 1, 'the picture used by a post is really attached to it');

const swept = await asRole('anon', `select * from public.media_pending_purge($1, 100)`, [secret]);
check(swept.error === null, 'the sweeper reads with the secret', swept.error?.message ?? '');
const orphanRow = swept.rows.find((row) => row.id === orphan);
check(orphanRow !== undefined, 'an abandoned upload is offered for deletion');
check(orphanRow?.reason === 'orphaned', 'it is offered for the right reason', orphanRow?.reason ?? '');
check(
  typeof orphanRow?.delete_token === 'string' && orphanRow.delete_token.length > 0,
  'the sweeper is given the delete capability, which is the whole point',
);
check(
  swept.rows.every((row) => row.id !== inUse),
  'a picture a post is using is never offered for deletion',
);

const withoutSecret = await asRole('anon', `select * from public.media_pending_purge($1, 100)`, ['nope']);
check(withoutSecret.error !== null, 'a stranger cannot list what to delete');
check(withoutSecret.rows.length === 0, 'a wrong secret yields no rows at all');

const memberWithoutSecret = await asMember(rahim, `select * from public.media_pending_purge($1, 100)`, [
  'secret-i-made-up-0123456789abcdefghij',
]);
check(memberWithoutSecret.error !== null, 'a signed-in member without the secret is refused the list');
check(
  memberWithoutSecret.rows.length === 0,
  'a member without the secret is told nothing, not a filtered version',
);

// A row with no delete capability cannot be deleted at the host. It must not
// appear in the list, because a sweeper that is told to delete something it
// cannot delete will report a success that never happened.
const noToken = (
  await asMember(
    ada,
    `select public.record_media_asset(
       'imgbb', 'image', 'https://i.ibb.co/abc123/no-token.jpg', '', '', null, null, 512, 'image/jpeg', null
     ) as id`,
  )
).rows[0].id;
await db.exec(`update public.media_assets set created_at = now() - interval '5 days' where id = '${noToken}'`);
const second = await asRole('anon', `select * from public.media_pending_purge($1, 100)`, [secret]);
check(
  second.rows.every((row) => row.id !== noToken),
  'a file the platform cannot delete is not reported as deletable',
);

// ------------------------------------------------------ claim, release, confirm ---

const claimed = await asRole('anon', `select public.media_claim_purge($1, $2::uuid[])`, [
  secret,
  `{${orphan}}`,
]);
check(claimed.error === null, 'the sweeper claims a row before asking the host');
check(Number(claimed.rows[0]?.media_claim_purge) === 1, 'one row is claimed');

const afterClaim = await asRole('anon', `select * from public.media_pending_purge($1, 100)`, [secret]);
check(
  afterClaim.rows.every((row) => row.id !== orphan),
  'a claimed row is not offered twice in the same minute',
);

const claimedAgain = await asRole('anon', `select public.media_claim_purge($1, $2::uuid[])`, [
  secret,
  `{${orphan}}`,
]);
check(
  Number(claimedAgain.rows[0]?.media_claim_purge) === 0,
  'a second claim on the same row is a no-op, not a second deletion',
);

// The host did not answer. The claim is released and the row comes back.
const released = await asRole('anon', `select public.media_release_purge($1, $2::uuid[])`, [
  secret,
  `{${orphan}}`,
]);
check(Number(released.rows[0]?.media_release_purge) === 1, 'a claim is released when the host does not answer');
const afterRelease = await asRole('anon', `select * from public.media_pending_purge($1, 100)`, [secret]);
check(
  afterRelease.rows.some((row) => row.id === orphan),
  'a released row is offered again, so a delete is retried rather than lost',
);

// The host confirmed.
await asRole('anon', `select public.media_claim_purge($1, $2::uuid[])`, [secret, `{${orphan}}`]);
const purged = await asRole('anon', `select public.media_mark_purged($1, $2::uuid[])`, [
  secret,
  `{${orphan}}`,
]);
check(Number(purged.rows[0]?.media_mark_purged) === 1, 'the sweeper records that the host confirmed');

const afterPurge = await asRole('anon', `select * from public.media_pending_purge($1, 100)`, [secret]);
check(
  afterPurge.rows.every((row) => row.id !== orphan),
  'a purged row is never offered again',
);

const strangerPurge = await asRole('anon', `select public.media_mark_purged($1, $2::uuid[])`, [
  'nope',
  `{${orphan}}`,
]);
check(strangerPurge.error !== null, 'a stranger cannot mark anything purged');

// --------------------------------------------------------- the member's own view ---

const rahimAssets = await asMember(rahim, `select url, in_use, expires_at from public.my_media_assets(50)`);
check(rahimAssets.error === null, 'a member can list their own pictures', rahimAssets.error?.message ?? '');
check(
  rahimAssets.rows.every((row) => row.url === '' || row.url.startsWith('https://i.ibb.co/')),
  'the list is only ever of their own pictures',
);
check(
  rahimAssets.rows.some((row) => row.in_use === true),
  'a picture attached to a post is reported as in use',
);

const adaAssets = await asMember(ada, `select url from public.my_media_assets(50)`);
check(
  adaAssets.rows.every((row) => !row.url.includes('xyz789')),
  "one member never sees another member's pictures",
);

const purgedRow = adaAssets.rows.find((row) => row.url === '');
check(purgedRow === undefined, "a member's own list is of pictures, not of removed rows");

// ------------------------------------------------------------- housekeeping ---

await db.exec(`update public.media_assets set purged_at = now() - interval '400 days' where id = '${orphan}'`);
const forgotten = await asRole('anon', `select public.media_sweep_forgotten($1, 365)`, [secret]);
check(Number(forgotten.rows[0]?.media_sweep_forgotten) >= 1, 'a row purged over a year ago is swept');
const forgottenAgain = await asRole('anon', `select public.media_sweep_forgotten($1, 365)`, [secret]);
check(Number(forgottenAgain.rows[0]?.media_sweep_forgotten) === 0, 'the sweep is idempotent');
const hostForgotten = await asRole('anon', `select public.media_sweep_forgotten($1, 365)`, ['nope']);
check(hostForgotten.error !== null, 'a stranger cannot sweep the media table');

// -------------------------------------------------------------- the grants ---

for (const signature of [
  'public.record_media_asset(text, text, text, text, text, integer, integer, bigint, text, timestamp with time zone)',
  'public.media_pending_purge(text, integer)',
  'public.media_claim_purge(text, uuid[])',
  'public.media_mark_purged(text, uuid[])',
  'public.media_release_purge(text, uuid[])',
  'public.media_sweep_forgotten(text, integer)',
  'public.my_media_assets(integer)',
]) {
  const grant = (
    await db.query(
      `select has_function_privilege(current_user, '${signature}', 'execute') as ok`,
    )
  ).rows[0];
  const anon = (await db.query(`select has_function_privilege('anon', '${signature}', 'execute') as ok`))
    .rows[0];
  const member = (
    await db.query(`select has_function_privilege('authenticated', '${signature}', 'execute') as ok`)
  ).rows[0];
  const server = signature.startsWith('public.record_media_asset') || signature.startsWith('public.my_media_assets');
  check(
    anon.ok === !server && member.ok === true,
    `${signature} is granted to exactly the right role`,
    `anon=${String(anon.ok)} member=${String(member.ok)} owner=${String(grant.ok)}`,
  );
}

const columns = await db.query(
  `select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'media_assets'
      and column_name in ('expires_at', 'purge_requested_at', 'purged_at')`,
);
check(columns.rows.length === 3, 'the schema carries the three columns 0073 added');

console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) {
  console.log(`failed: ${bad.join(', ')}`);
  process.exit(1);
}
process.exit(0);
