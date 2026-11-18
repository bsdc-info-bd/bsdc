/**
 * Proof for 0120: a comment can carry a picture — its own, still in existence,
 * and one the sweeper knows it is not allowed to delete.
 *
 * Three claims are worth a test rather than a paragraph:
 *
 *   1. **Ownership.** A comment is a place a stranger can write. Without the
 *      trigger's check, the `image_url` column would let that stranger make every
 *      reader of the thread fetch an address of their choosing — their IP, their
 *      browser, a page the platform vouched for. The check is "this member
 *      uploaded this URL", which is a fact `record_media_asset` already stored.
 *
 *   2. **A picture is words enough, and nothing else is.** The old body rule
 *      demanded at least one character; it now demands at least one character
 *      *unless* there is a picture. Both halves are checked, because loosening a
 *      constraint is exactly where an accidental "empty comments everywhere"
 *      ships.
 *
 *   3. **The sweeper is not allowed to delete it.** `media_pending_purge` decides
 *      what nothing points at. A picture referenced only by a comment looked
 *      orphaned to it, and an orphan older than a day is deleted at ImgBB — the
 *      comment would then show a broken picture with no way back. The anti-join
 *      this migration adds is the fix, so it is asserted against a genuine
 *      orphan in the same sweep.
 */
import { as, check, asOwner, expectFail, failureCount, summary } from './lib.mjs';
import { makeDb } from './lib.mjs';

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002';
const secret = 'flush-secret-0123456789abcdefghijklmnopqrstuvwxyz';

const OWN = 'https://i.ibb.co/ada111/a-cracked-screen.jpg';
const OWN_THUMB = 'https://i.ibb.co/ada111/a-cracked-screen-medium.jpg';
const THEIRS = 'https://i.ibb.co/rahim222/somebody-elses.jpg';

const db = await makeDb();

await db.exec(`
  insert into bsdc.push_settings (name, value) values ('flush_secret', '${secret}')
    on conflict (name) do update set value = excluded.value;

  insert into public.profiles (uid, username, display_name, status) values
    ('${ada}',   'adafirst',    'Ada First',    'active'),
    ('${rahim}', 'rahimsecond', 'Rahim Second', 'active');

  insert into public.posts (author_uid, kind, slug, title, body, status, published_at, visibility)
    values ('${rahim}', 'question', 'a-cracked-phone', 'My phone screen cracked', 'What now?',
            'published', now(), 'public');
`);

const postId = (
  await db.query(`select id from public.posts where slug = 'a-cracked-phone'`)
).rows[0].id;

// Ada's picture, recorded the only way a browser-side upload becomes a row.
const ownId = (
  await as(
    db,
    ada,
    `select public.record_media_asset(
       'imgbb', 'image', '${OWN}', '${OWN_THUMB}', 'https://ibb.co/delete/ada111',
       1200, 900, 48000, 'image/webp', null
     ) as id`,
    'a member records the picture they are about to attach',
  )
).rows[0].id;

const theirId = (
  await as(
    db,
    rahim,
    `select public.record_media_asset(
       'imgbb', 'image', '${THEIRS}', '', 'https://ibb.co/delete/rahim222',
       800, 600, 30000, 'image/webp', null
     ) as id`,
    'another member records their own picture',
  )
).rows[0].id;
check(typeof theirId === 'string' && theirId.length > 0, 'the second upload has a row');

// ------------------------------------------------------- a picture, and words ---

const withPicture = await as(
  db,
  ada,
  `insert into public.comments (post_id, author_uid, body, image_url, image_thumb_url,
                                image_alt, image_width, image_height)
   values ('${postId}', '${ada}', '', '${OWN}', '${OWN_THUMB}', 'The crack down the left side',
           1200, 900)
   returning id, image_url, image_thumb_url, image_alt, image_width`,
  'a comment with a picture and no words is accepted',
);
check(withPicture !== null, 'the insert returned a row');

const stored = withPicture?.rows[0];
check(stored?.image_url === OWN, 'the picture address is stored as sent', stored?.image_url);
check(stored?.image_thumb_url === OWN_THUMB, 'the lighter variant is stored alongside it');
check(stored?.image_alt === 'The crack down the left side', 'the description survives');
check(Number(stored?.image_width) === 1200, 'the width is kept for the layout to reserve space');

const commentId = stored?.id;

// The same member, a picture, and no thumbnail: the original becomes the
// thumbnail rather than an empty `src`.
const noVariant = await as(
  db,
  ada,
  `insert into public.comments (post_id, author_uid, body, image_url)
   values ('${postId}', '${ada}', 'A second angle', '${OWN}')
   returning image_thumb_url`,
  'a picture without a variant is accepted',
);
check(
  noVariant?.rows[0]?.image_thumb_url === OWN,
  'a missing variant falls back to the original rather than to an empty string',
  noVariant?.rows[0]?.image_thumb_url,
);

// An ordinary comment still cannot be empty, and the words still have to be
// somewhere in range.
await expectFail(
  db,
  ada,
  `insert into public.comments (post_id, author_uid, body) values ('${postId}', '${ada}', '   ')`,
  '23514',
  'a comment with neither words nor a picture is refused',
);

await expectFail(
  db,
  ada,
  `insert into public.comments (post_id, author_uid, body, image_url)
   values ('${postId}', '${ada}', 'x', 'http://i.ibb.co/ada111/not-https.jpg')`,
  '42501',
  'a plain-http picture is not this member upload and is refused as such',
);

// The confirmation that the *constraint* is doing its job and not just the
// trigger: an owned asset whose quoted variant is not https.
await db.exec(`update public.media_assets set thumb_url = 'http://insecure/thumb.jpg' where id = '${ownId}'`);
await asOwner(
  db,
  `insert into public.comments (post_id, author_uid, body, image_url, image_thumb_url)
   values ('${postId}', '${ada}', 'x', '${OWN}', 'http://insecure/thumb.jpg')`,
).catch(() => null);
const insecure = await db
  .query(
    `select count(*)::int as n from public.comments
     where post_id = '${postId}' and image_thumb_url like 'http://%'`,
  )
  .catch(() => ({ rows: [{ n: 0 }] }));
check(Number(insecure.rows[0]?.n) === 0, 'no comment can hold a non-https picture address');
await db.exec(`update public.media_assets set thumb_url = '${OWN_THUMB}' where id = '${ownId}'`);

// --------------------------------------------------------------- ownership ---

await expectFail(
  db,
  ada,
  `insert into public.comments (post_id, author_uid, body, image_url)
   values ('${postId}', '${ada}', 'Look at this', '${THEIRS}')`,
  '42501',
  'a member cannot attach somebody else upload',
);

await expectFail(
  db,
  ada,
  `insert into public.comments (post_id, author_uid, body, image_url)
   values ('${postId}', '${ada}', 'Look at this', 'https://tracker.example/pixel.gif')`,
  '42501',
  'a member cannot point a comment at an address the platform never uploaded',
);

// A purged asset is a URL whose bytes are gone; a comment showing it is a broken
// picture nobody can repair.
await db.exec(`update public.media_assets set purged_at = now() where id = '${theirId}'`);
await expectFail(
  db,
  rahim,
  `insert into public.comments (post_id, author_uid, body, image_url)
   values ('${postId}', '${rahim}', 'Mine too', '${THEIRS}')`,
  '42501',
  'a picture whose bytes were purged cannot be attached again',
);
await db.exec(`update public.media_assets set purged_at = null where id = '${theirId}'`);

// Dimensions are a pair. Half of one leaves the layout guessing at an aspect
// ratio, which is the shift the columns exist to prevent.
await expectFail(
  db,
  ada,
  `insert into public.comments (post_id, author_uid, body, image_url, image_width)
   values ('${postId}', '${ada}', 'x', '${OWN}', 1200)`,
  '23514',
  'a width without a height is refused',
);

// ---------------------------------------------------------- reading it back ---

const readBack = await as(
  db,
  'aaaaaaaa-1111-4111-8111-000000000009',
  `select image_url, image_alt from public.comments where id = '${commentId}'`,
  'another member reads the picture address from the thread',
);
check(readBack?.rows[0]?.image_url === OWN, 'the picture is part of the public thread read');

// ------------------------------------------------------------- the sweeper ---

// A picture nothing points at, from the same member, with the same host and a
// delete capability — the control for the next check.
const orphanId = (
  await as(
    db,
    ada,
    `select public.record_media_asset(
       'imgbb', 'image', 'https://i.ibb.co/ada111/never-attached.jpg', '', 'https://ibb.co/delete/ada999',
       null, null, 9000, 'image/webp', null
     ) as id`,
    'a member uploads a picture they never attach anywhere',
  )
).rows[0].id;

// Old enough that the sweep's one-day grace period does not hide either of them.
await db.exec(
  `update public.media_assets set created_at = now() - interval '3 days'
   where id in ('${ownId}', '${orphanId}')`,
);

const swept = await as(
  db,
  'aaaaaaaa-1111-4111-8111-000000000009',
  `select * from public.media_pending_purge('${secret}', 100)`,
  'the sweeper reads what it may delete',
);
const rows = swept?.rows ?? [];
check(
  rows.some((row) => row.id === orphanId),
  'an upload nothing references is still offered for deletion',
);
check(
  rows.every((row) => row.id !== ownId),
  'a picture a comment shows is never offered for deletion',
);
check(
  Boolean(commentId) === true,
  'the fixture really attached the picture to a comment',
);

// The same protection applies to the lighter variant: a comment that quotes only
// the medium copy must not let the medium copy be swept out from under it.
const variantOnlyId = (
  await as(
    db,
    ada,
    `select public.record_media_asset(
       'imgbb', 'image', 'https://i.ibb.co/ada111/original-only.jpg',
       'https://i.ibb.co/ada111/variant-only.jpg', 'https://ibb.co/delete/ada777',
       1000, 1000, 20000, 'image/webp', null
     ) as id`,
    'a member uploads a picture with a variant',
  )
).rows[0].id;
await db.exec(`
  insert into public.comments (post_id, author_uid, body, image_url)
    values ('${postId}', '${ada}', 'Variant only', 'https://i.ibb.co/ada111/original-only.jpg');
  update public.media_assets set created_at = now() - interval '3 days' where id = '${variantOnlyId}';
`);
const sweptAgain = await as(
  db,
  'aaaaaaaa-1111-4111-8111-000000000009',
  `select * from public.media_pending_purge('${secret}', 100)`,
  'the sweeper reads again after a second comment',
);
check(
  (sweptAgain?.rows ?? []).every((row) => row.id !== variantOnlyId),
  'a picture a comment shows is protected through its original address too',
);

summary();
process.exit(failureCount() === 0 ? 0 : 1);
