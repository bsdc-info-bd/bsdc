/**
 * Proof for 0132: every picture a member uploads is one they can find again.
 *
 * Two things are proved here, and the second is the reason the migration exists.
 *
 *   1. **The library is the member's own.** `my_gallery` shows a member their
 *      uploads, filed by what they were for, page by page, searchable — and shows a
 *      stranger nothing. A purged row never appears: the host has removed that file,
 *      and a tile that leads to a broken image inside a picker is worse than a
 *      smaller library.
 *
 *   2. **"In use" means what it says, everywhere.** `bsdc.media_references` is the
 *      single definition of where a picture can be living, read both by the
 *      gallery's badge and by the upload sweeper's `orphaned` test. Before it, that
 *      test consulted posts' media, messages, comments and the profile's own two
 *      columns — so a picture whose only home was a community cover, an event cover,
 *      a project or course cover, a conversation avatar, an ad creative, a product
 *      image, or the copy kept on a delivered order line counted as abandoned, and
 *      one day after upload the platform asked ImgBB to delete a file people were
 *      still looking at. Every arm is asserted separately, because an arm nobody
 *      tested is an arm that silently stops counting.
 *
 * Also proved: a pick is resolved from the asset id and cannot be asserted as
 * somebody else's — including through the chat send path, which dedupes by hashing
 * its own arguments and so has to see the pick in that hash.
 */
import { makeDb } from './lib.mjs';

const ada = 'aaaaaaaa-1111-4111-8111-000000000092';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000092';
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

/** An ImgBB address, so the sweeper's host check accepts the row. */
const urlFor = (name) => `https://i.ibb.co/t92t92/${name}.png`;

/**
 * One asset per arm of the view, plus one that is attached to nothing. `arm` says
 * how it is attached, and that is the assertion: the gallery and the sweeper have
 * to agree with each other and with reality.
 */
const ARMS = [
  { name: 'post-photo', purpose: 'post-image', arm: 'post_media, by asset id' },
  { name: 'post-cover', purpose: 'cover', arm: 'posts.cover_url, by address' },
  { name: 'chat-photo', purpose: 'chat-image', arm: 'messages.media_url' },
  { name: 'comment-photo', purpose: 'comment-image', arm: 'comments.image_url and its thumb' },
  { name: 'profile-avatar', purpose: 'avatar', arm: 'profiles.avatar_url' },
  { name: 'profile-cover', purpose: 'cover', arm: 'profiles.cover_url' },
  { name: 'community-cover', purpose: 'cover', arm: 'groups.cover_url' },
  { name: 'event-cover', purpose: 'cover', arm: 'events.cover_url' },
  { name: 'project-cover', purpose: 'project-cover', arm: 'projects.cover_url' },
  { name: 'course-cover', purpose: 'cover', arm: 'courses.cover_url' },
  { name: 'room-avatar', purpose: 'avatar', arm: 'conversations.avatar_url' },
  { name: 'ad-photo', purpose: 'ad-creative', arm: 'ad_creatives.image_url and thumb_url' },
  { name: 'product-photo', purpose: 'product-image', arm: 'mk_products.images, an array' },
  { name: 'order-photo', purpose: 'product-image', arm: 'mk_order_items.image_url, the kept copy' },
  { name: 'unused-photo', purpose: 'other', arm: null },
];

const names = ARMS.map((entry) => entry.name);

await db.exec(`
  insert into bsdc.push_settings (name, value) values ('flush_secret', '${secret}')
    on conflict (name) do update set value = excluded.value;

  insert into public.profiles (uid, username, display_name, status) values
    ('${ada}',   'adafirst',    'Ada First',    'active'),
    ('${rahim}', 'rahimsecond', 'Rahim Second', 'active');

  insert into public.media_assets (owner_uid, provider, kind, url, thumb_url, delete_token,
                                   width, height, bytes, mime_type, purpose, created_at)
  values ${ARMS.map(
    (entry) =>
      `('${ada}', 'imgbb', 'image', '${urlFor(entry.name)}', '', 'tok-${entry.name}',
        1200, 800, 200000, 'image/webp', '${entry.purpose}', now() - interval '3 days')`,
  ).join(',\n    ')};
`);

const assetId = async (name) =>
  (await db.query(`select id from public.media_assets where url = '${urlFor(name)}'`)).rows[0]?.id;

// ------------------------------------------------- attach each arm, once, for real
const postId = (
  await db.query(`
    insert into public.posts (author_uid, slug, title, body, kind, status, published_at)
    values ('${ada}', 'a-t92-post', 'A post', 'body', 'article', 'published', now())
    returning id::text as id
  `)
).rows[0].id;

await db.exec(`
  -- A post's pictures, the one arm that links by id rather than by address.
  insert into public.post_media (post_id, media_id, "position", alt_text)
  select '${postId}', a.id, 0, 'A red rickshaw at dusk'
    from public.media_assets a where a.url = '${urlFor('post-photo')}';

  -- And a post's cover, which is the same kind of picture stored the other way.
  update public.posts set cover_url = '${urlFor('post-cover')}' where id = '${postId}';

  insert into public.comments (post_id, author_uid, body, image_url, image_thumb_url, image_alt)
  values ('${postId}', '${ada}', 'look', '${urlFor('comment-photo')}',
          '${urlFor('comment-photo')}', 'tea stall at the stand');

  update public.profiles set avatar_url = '${urlFor('profile-avatar')}',
                             cover_url  = '${urlFor('profile-cover')}'
    where uid = '${ada}';

  insert into public.groups (slug, name, owner_uid, cover_url)
  values ('t92-club', 'T92 Club', '${ada}', '${urlFor('community-cover')}');

  -- mode defaults to online, and an online event has to carry a join url; an
  -- in-person one has to carry a venue. Neither is the point of this harness, so
  -- the arm that needs no invention is chosen.
  insert into public.events (slug, title, starts_at, ends_at, host_uid, mode, venue, cover_url)
  values ('t92-event', 'T92 Event', now() + interval '2 days', now() + interval '3 days',
          '${ada}', 'in_person', 'Ambarkhana Auditorium', '${urlFor('event-cover')}');

  insert into public.projects (slug, name, owner_uid, cover_url)
  values ('t92-project', 'T92 Project', '${ada}', '${urlFor('project-cover')}');

  insert into public.courses (slug, title, instructor_uid, cover_url)
  values ('t92-course', 'T92 Course', '${ada}', '${urlFor('course-cover')}');

  insert into public.conversations (kind, title, avatar_url, created_by)
  values ('group', 'T92 room', '${urlFor('room-avatar')}', '${ada}');

  insert into public.messages (conversation_id, sender_uid, kind, body, media_url, media_name)
  select c.id, '${ada}', 'image', '', '${urlFor('chat-photo')}', 'photo.png'
    from public.conversations c where c.title = 'T92 room';
`);

// The marketplace: a vendor, a product whose image array holds one picture, and an
// order line that keeps its own copy of another for ever.
await db.exec(`
  insert into public.mk_vendor_applications (
    owner_uid, full_name, shop_name, nid_number, mobile, vendor_type, address_line, lat, lng,
    place_label, package_code, agreements, payment_sender, payment_holder, payment_txn_id, status
  ) values (
    '${ada}', 'Ada First', 'T92 Store', '1234567890', '01712345678', 'grocery',
    'House 1, Road 2, Sylhet', 24.8949, 91.8687, 'Sylhet', '10',
    '{"tos":true,"commission":true,"photos":true}'::jsonb, '01712345678', 'Ada First',
    'txn-t92-0001', 'approved'
  );

  insert into public.mk_vendors (owner_uid, application_id, slug, name, vendor_type, mobile,
                                 address_line, lat, lng, place_label, status)
  select a.owner_uid, a.id, 't92-store-92', a.shop_name, a.vendor_type, a.mobile,
         a.address_line, a.lat, a.lng, a.place_label, 'active'
    from public.mk_vendor_applications a where a.owner_uid = '${ada}';

  insert into public.mk_products (vendor_id, slug, name, description, price_poisha, stock, images)
  select v.id, 't92-rice', 'T92 Rice', 'a bag', 12000, 5,
         array['${urlFor('product-photo')}']
    from public.mk_vendors v where v.slug = 't92-store-92';

  insert into public.mk_orders (code, customer_uid, vendor_id, subtotal_poisha, delivery_fee_poisha,
                                total_poisha, customer_name, customer_phone, address_line, lat, lng,
                                status, placed_at)
  select 'BSD-100001-ABC92', '${ada}', v.id, 12000, 0, 12000, 'Ada First', '01712345678',
         'House 1, Road 2, Sylhet', 24.8949, 91.8687, 'delivered', now()
    from public.mk_vendors v where v.slug = 't92-store-92';

  insert into public.mk_order_items (order_id, name, image_url, unit_price, qty, line_total)
  select o.id, 'T92 Rice', '${urlFor('order-photo')}', 12000, 1, 12000
    from public.mk_orders o where o.code = 'BSD-100001-ABC92';
`);

// Advertising, whose creative is a row only the advertiser reads.
await db.exec(`
  insert into public.ad_campaigns (owner_uid, name, status, pricing, bid, total_budget, daily_budget)
  values ('${ada}', 'T92 campaign', 'active', 'cpm', 1200, 100000, 0);

  insert into public.ad_creatives (campaign_id, placement, headline, body, image_url, thumb_url, target_url)
  select c.id, 'feed', 'Try it now', 'body', '${urlFor('ad-photo')}',
         '${urlFor('ad-photo')}', 'https://bsdc.info.bd/t92'
    from public.ad_campaigns c where c.name = 'T92 campaign';
`);

// ------------------------------------------------------------ 1. the purpose kept ---

const recorded = await asMember(
  ada,
  `select public.record_media_asset(
     'imgbb', 'image', 'https://i.ibb.co/t92t92/a-new-picture.png', '', '',
     null, null, 1000, 'image/webp', null, 'chat-image'
   ) as id`,
);
check(
  recorded.error === null,
  'a member records an upload with a purpose',
  recorded.error?.message ?? '',
);
check(
  (
    await db.query(
      `select purpose from public.media_assets where url = 'https://i.ibb.co/t92t92/a-new-picture.png'`,
    )
  ).rows[0]?.purpose === 'chat-image',
  'the purpose the caller named is the purpose stored',
);

await asMember(
  ada,
  `select public.record_media_asset(
     'imgbb', 'image', 'https://i.ibb.co/t92t92/no-purpose.png', '', '',
     null, null, 1000, '', null
   ) as id`,
);
check(
  (
    await db.query(
      `select purpose from public.media_assets where url = 'https://i.ibb.co/t92t92/no-purpose.png'`,
    )
  ).rows[0]?.purpose === 'other',
  'an upload that names no purpose is filed as other rather than refused',
);

const invention = await asMember(
  ada,
  `select public.record_media_asset(
     'imgbb', 'image', 'https://i.ibb.co/t92t92/meme.png', '', '',
     null, null, 10, '', null, 'meme'
   )`,
);
check(invention.error?.code === '22023', 'an unknown purpose is refused with 22023');

const oldShape = await asMember(
  rahim,
  `select public.record_media_asset(
     'imgbb', 'image', 'https://i.ibb.co/t92t92/rahim.png', '', '',
     null, null, 10, '', null
   ) as id`,
);
check(
  oldShape.error === null,
  'a caller that has not been taught the new argument still records',
  oldShape.error?.message ?? '',
);

const anonymous = await asRole(
  'anon',
  `select public.record_media_asset(
     'imgbb', 'image', 'https://i.ibb.co/t92t92/anon.png', '', '',
     null, null, 10, '', null, 'avatar'
   )`,
);
check(anonymous.error !== null, 'an anonymous caller cannot record a picture as theirs');

// --------------------------------------------------------- 2. reading the library ---

const gallery = await asMember(
  ada,
  `select url, purpose, in_use, uses, surfaces, alt_text
     from public.my_gallery(200)`,
);
check(
  gallery.error === null,
  'the member can read their own library',
  gallery.error?.message ?? '',
);
const seen = new Map(gallery.rows.map((row) => [row.url, row]));
check(
  seen.size === names.length + 2,
  'every live row of theirs is in it',
  `${seen.size} of ${names.length + 1}`,
);

const strangerView = await asMember(rahim, `select url from public.my_gallery(200)`);
check(
  strangerView.rows.every((row) => row.url === 'https://i.ibb.co/t92t92/rahim.png'),
  'another member sees only their own one picture',
  JSON.stringify(strangerView.rows.map((row) => row.url)),
);

const signedOut = await asMember(
  'never-signed-up',
  `select count(*)::int as n from public.my_gallery(200)`,
);
check(
  signedOut.error?.code === '42501' || signedOut.rows[0]?.n === 0,
  'a caller with no uid gets nothing, not everybody',
  JSON.stringify(signedOut.rows ?? signedOut.error?.message),
);
const anon = await asRole('anon', `select count(*)::int as n from public.my_gallery(200)`);
check(anon.error !== null, 'and an anonymous role is refused the function outright');

check(
  seen.get(urlFor('post-photo'))?.alt_text === 'A red rickshaw at dusk',
  'the description written when it was posted comes back with the picture',
  JSON.stringify(seen.get(urlFor('post-photo'))),
);

const covers = await asMember(
  ada,
  `select count(*)::int as n from public.my_gallery(200, null, null, 'cover')`,
);
check(
  Number(covers.rows[0]?.n) === 5,
  'the cover filter finds the five covers',
  JSON.stringify(covers.rows),
);

const byWords = await asMember(
  ada,
  `select url from public.my_gallery(200, null, null, 'all', 'tea stall')`,
);
check(
  byWords.rows.length === 1 && byWords.rows[0].url === urlFor('comment-photo'),
  'a description written on a comment finds that picture',
  JSON.stringify(byWords.rows),
);

const month = new Date().toLocaleString('en-US', {
  timeZone: 'Asia/Dhaka',
  month: 'long',
  year: 'numeric',
});
const byMonth = await asMember(
  ada,
  `select count(*)::int as n from public.my_gallery(200, null, null, 'all', $q$${month}$q$)`,
);
check(
  Number(byMonth.rows[0]?.n) === names.length + 2,
  'a month named in words finds that month',
  JSON.stringify(byMonth.rows),
);
const noMonth = await asMember(
  ada,
  `select count(*)::int as n from public.my_gallery(200, null, null, 'all', 'January 2019')`,
);
check(Number(noMonth.rows[0]?.n) === 0, 'and a month with nothing in it finds nothing');

const wrongFilter = await asMember(
  ada,
  `select count(*) from public.my_gallery(200, null, null, 'meme')`,
);
check(
  wrongFilter.error?.code === '22023',
  'a filter that is not a purpose is refused, not answered with an empty grid',
);

const halfCursor = await asMember(
  ada,
  `select count(*) from public.my_gallery(200, now(), null, 'all', '')`,
);
check(halfCursor.error?.code === '22023', 'half a cursor is an error, not a silent first page');

const firstPage = await asMember(
  ada,
  `select id from public.my_gallery(3) order by created_at desc, id desc limit 3`,
);
const oldest = firstPage.rows.length;
const secondPage = await asMember(
  ada,
  `with last_row as (
     select created_at, id from public.media_assets
      where owner_uid = '${ada}' and url = (
        select url from public.my_gallery(3) order by created_at asc, id asc limit 1
      )
   )
   select id from public.my_gallery(3, (select created_at from last_row), (select id from last_row), 'all', '')`,
);
check(oldest === 3, 'a page asks for three and gets three', `${oldest}`);
check(
  secondPage.rows.length === 3 &&
    secondPage.rows.every((row) => !firstPage.rows.some((a) => a.id === row.id)),
  'the next page starts after the cursor and repeats nothing',
  JSON.stringify({ first: oldest, second: secondPage.rows.length }),
);

// ---------------------------------------------------------- 3. what counts as use ---

for (const entry of ARMS) {
  const row = seen.get(urlFor(entry.name));
  const expected = entry.arm !== null;
  check(
    row !== undefined && row.in_use === expected,
    `${entry.name} is in use: ${entry.arm ?? 'nothing displays it'}`,
    JSON.stringify(row),
  );
}

check(
  (seen.get(urlFor('ad-photo'))?.uses ?? 0) === 2,
  'a creative and its thumbnail are two references, not one',
  JSON.stringify(seen.get(urlFor('ad-photo'))),
);
check(
  JSON.stringify(seen.get(urlFor('comment-photo'))?.surfaces ?? []) === '["comment"]',
  'the surface named for a comment picture is the comment',
  JSON.stringify(seen.get(urlFor('comment-photo'))),
);
check(
  JSON.stringify(seen.get(urlFor('post-photo'))?.surfaces ?? []) === '["post"]',
  'a picture inside a post is reported as a post',
  JSON.stringify(seen.get(urlFor('post-photo'))),
);
check(
  JSON.stringify(seen.get(urlFor('product-photo'))?.surfaces ?? []) === '["product"]',
  'a product image is reported as a product',
  JSON.stringify(seen.get(urlFor('product-photo'))),
);
check(
  JSON.stringify(seen.get(urlFor('order-photo'))?.surfaces ?? []) === '["order"]',
  'the copy an order line keeps is reported as an order',
  JSON.stringify(seen.get(urlFor('order-photo'))),
);

const limitClaim = await asMember(
  ada,
  `insert into public.media_assets (owner_uid, provider, kind, url, thumb_url, delete_token, purpose)
   select '${ada}', 'imgbb', 'image', 'https://i.ibb.co/t92t92/paged-' || g || '.png', '', '', 'other'
     from generate_series(1, 5) g`,
);
check(limitClaim.error === null, 'more rows can be added for the paging test');
const tooBig = await asMember(ada, `select count(*)::int as n from public.my_gallery(5000)`);
check(
  Number(tooBig.rows[0]?.n) <= 200,
  'the limit is clamped, not obeyed',
  JSON.stringify(tooBig.rows),
);

const purged = await db.query(
  `update public.media_assets set purged_at = now() where url = '${urlFor('course-cover')}' returning id`,
);
check(purged.rows.length === 1, 'a row can be marked purged');
const afterPurge = await asMember(
  ada,
  `select count(*)::int as n from public.my_gallery(200) where url = '${urlFor('course-cover')}'`,
);
check(Number(afterPurge.rows[0]?.n) === 0, 'a purged picture is not offered in a picker');
const purgedStillExists = await db.query(
  `select count(*)::int as n from public.media_assets where url = '${urlFor('course-cover')}'`,
);
check(
  Number(purgedStillExists.rows[0]?.n) === 1,
  'while the record of it survives, for the member to see',
);
await db.exec(
  `update public.media_assets set purged_at = null where url = '${urlFor('course-cover')}'`,
);

// ------------------------------------------------------- 4. the sweeper agrees ---

const swept = await asRole(
  'anon',
  `select url, reason from public.media_pending_purge('${secret}', 500)`,
);
check(swept.error === null, 'the sweeper answers with the secret', swept.error?.message ?? '');
const doomed = new Set(swept.rows.map((row) => row.url));
for (const entry of ARMS) {
  const wanted = entry.arm === null;
  check(
    doomed.has(urlFor(entry.name)) === wanted,
    `the sweeper ${wanted ? 'would' : 'would not'} delete ${entry.name}`,
    JSON.stringify({ wanted, present: doomed.has(urlFor(entry.name)) }),
  );
}

// The regression, said plainly once: a community cover used to look abandoned.
await db.exec(`delete from public.groups where slug = 't92-club'`);
const afterRemoval = await asRole(
  'anon',
  `select url from public.media_pending_purge('${secret}', 500)`,
);
check(
  new Set(afterRemoval.rows.map((row) => row.url)).has(urlFor('community-cover')),
  'and it is offered for deletion only once nothing displays it any more',
);
await db.exec(`
  insert into public.groups (slug, name, owner_uid, cover_url)
  values ('t92-club', 'T92 Club', '${ada}', '${urlFor('community-cover')}')
`);

// The settings screen's own list now agrees with the gallery, from the same view.
const storageList = await asMember(
  ada,
  `select url, in_use from public.my_media_assets(200) where url = '${urlFor('event-cover')}'`,
);
check(
  storageList.rows[0]?.in_use === true,
  'the storage screen no longer calls a live event cover unused',
  JSON.stringify(storageList.rows),
);

// A picture the gallery shows as used cannot be swept, and a member who deletes the
// last thing that used it can: that is the whole contract, in one pair.
const orphanNow = await asMember(
  ada,
  `select in_use from public.my_gallery(200) where url = '${urlFor('unused-photo')}'`,
);
check(orphanNow.rows[0]?.in_use === false, 'the control picture reports itself as unused');

// ------------------------------------------------------------ 5. picking by id ---

const communityId = await assetId('community-cover');
const picked = await asMember(
  ada,
  `select url, thumb_url, name, purpose from bsdc.media_asset_for_pick('${communityId}')`,
);
check(
  picked.rows[0]?.url === urlFor('community-cover'),
  'the owner resolves their own picture by id',
  JSON.stringify(picked.rows),
);
check(
  picked.rows[0]?.thumb_url === urlFor('community-cover'),
  'a picture with no thumbnail resolves to the full file, not to nothing',
  JSON.stringify(picked.rows[0]),
);
check(
  String(picked.rows[0]?.name ?? '').endsWith('.png'),
  'the name a reused picture carries is the one the platform stored',
  JSON.stringify(picked.rows[0]),
);

const stolen = await asMember(
  rahim,
  `select count(*)::int as n from bsdc.media_asset_for_pick('${communityId}')`,
);
check(Number(stolen.rows[0]?.n) === 0, "a stranger's id resolves to nothing at all");

const forgedId = await asMember(
  ada,
  `select count(*)::int as n from bsdc.media_asset_for_pick('11111111-1111-4111-8111-111111111111')`,
);
check(Number(forgedId.rows[0]?.n) === 0, 'an id nobody ever uploaded resolves to nothing either');

await db.exec(
  `update public.media_assets set purged_at = now() where url = '${urlFor('project-cover')}'`,
);
const purgedPick = await asMember(
  ada,
  `select count(*)::int as n from bsdc.media_asset_for_pick('${await assetId('project-cover')}')`,
);
check(Number(purgedPick.rows[0]?.n) === 0, 'a purged picture cannot be picked, even by its owner');
await db.exec(
  `update public.media_assets set purged_at = null where url = '${urlFor('project-cover')}'`,
);

const roomId = (await db.query(`select id from public.conversations where title = 'T92 room'`))
  .rows[0].id;
await db.exec(`
  insert into public.conversation_members (conversation_id, uid) values
    ('${roomId}', '${ada}'),
    ('${roomId}', '${rahim}')
    on conflict do nothing
`);

const chatPick = await assetId('comment-photo');
const sentByPick = await asMember(
  ada,
  `select (public.send_message_once('${roomId}', gen_random_uuid(), 'look at this', 'image',
      '', '', '', null, '${chatPick}')).id as id`,
);
check(
  sentByPick.error === null,
  'a pick can be sent to a conversation by its id',
  sentByPick.error?.message ?? '',
);
const sentRow = await db.query(
  `select media_url, media_name from public.messages where id = '${sentByPick.rows[0]?.id}'`,
);
check(
  sentRow.rows[0]?.media_url === urlFor('comment-photo'),
  'the address written is the one the sender owns, not one they typed',
  JSON.stringify(sentRow.rows),
);
check(
  String(sentRow.rows[0]?.media_name ?? '').length > 0,
  'and the attachment is given a name from that row',
  JSON.stringify(sentRow.rows),
);

const notMine = await asMember(
  rahim,
  `select public.send_message_once('${roomId}', gen_random_uuid(), 'mine now', 'image',
      '', '', '', null, '${communityId}')`,
);
check(
  notMine.error?.code === '22023',
  "a picture that is not the sender's cannot be sent as if it were",
);

const anonymousPick = await asRole(
  'anon',
  `select public.send_message_once('${roomId}', gen_random_uuid(), 'x', 'image', '', '', '', null, '${chatPick}')`,
);
check(anonymousPick.error !== null, 'and an anonymous caller cannot send one at all');

const freeText = await asMember(
  ada,
  `select public.send_message_once('${roomId}', gen_random_uuid(), 'x', 'image',
      'https://evil.example/not-yours.png', '', '', null, null) as id`,
);
check(
  freeText.error === null,
  'the path an upload uses is unchanged',
  JSON.stringify(freeText.error?.message ?? ''),
);

// The retry guard has to see the pick. If it does not, a second send under the same
// key returns the first message and the member never learns their picture changed.
const clientKey = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
const firstTry = await asMember(
  ada,
  `select public.send_message_once('${roomId}', '${clientKey}', 'same words', 'image',
      '', '', '', null, '${await assetId('product-photo')}') as id`,
);
check(
  firstTry.error === null,
  'the first send through the id path goes through',
  firstTry.error?.message ?? '',
);
const secondTry = await asMember(
  ada,
  `select public.send_message_once('${roomId}', '${clientKey}', 'same words', 'image',
      '', '', '', null, '${await assetId('order-photo')}') as id`,
);
check(
  secondTry.error?.code === '22023',
  'a different pick under the same retry key is refused, not swallowed',
  JSON.stringify(secondTry.error?.message ?? ''),
);
const sameAgain = await asMember(
  ada,
  `select (public.send_message_once('${roomId}', '${clientKey}', 'same words', 'image',
      '', '', '', null, '${await assetId('product-photo')}')).id as id`,
);
check(
  sameAgain.error === null && sameAgain.rows.length === 1,
  'while the same pick under the same key is the same message',
  JSON.stringify(sameAgain.error?.message ?? ''),
);

// ------------------------------------------------------------ 6. what is readable ---

const readable = await asMember(
  ada,
  `select purpose from public.media_assets where url = '${urlFor('post-cover')}'`,
);
check(
  readable.error === null,
  'a member can read the purpose column of an asset row',
  readable.error?.message ?? '',
);
const secretColumn = await asMember(
  ada,
  `select delete_token from public.media_assets where url = '${urlFor('post-cover')}'`,
);
check(secretColumn.error !== null, 'and still cannot read the deletion capability');
const purgeFlag = await asMember(ada, 'select purged_at from public.media_assets limit 1');
check(purgeFlag.error !== null, "the purge flags stay off the browser's list");
const directView = await asMember(ada, 'select 1 from bsdc.media_references limit 1');
check(
  directView.error !== null,
  'the reference view is not a relation a member can query',
  JSON.stringify(directView.error?.message ?? ''),
);
// There is no "staff can read the view too" claim to make, and that is the design:
// the only readers of bsdc.media_references are functions that run as its owner, the
// one above is why `the sweeper answers with the secret` passed, and a member — any
// member, staff included — queries the table, not the view.

// The fallback the browser uses when the RPC is missing must be able to write the
// purpose, or the one deployment that needs it is the one that fails.
const fallbackInsert = await asMember(
  ada,
  `insert into public.media_assets (owner_uid, provider, kind, url, thumb_url, delete_token,
                                    width, height, bytes, mime_type, checksum, purpose)
   values ('${ada}', 'imgbb', 'image', 'https://i.ibb.co/t92t92/fallback.png', '', '',
           null, null, 10, '', '', 'other')
   returning id`,
);
check(
  fallbackInsert.error === null,
  'the fallback insert can carry a purpose',
  fallbackInsert.error?.message ?? '',
);
const fallbackRead = await asMember(
  ada,
  `select purpose from public.media_assets where url = 'https://i.ibb.co/t92t92/fallback.png'`,
);
check(fallbackRead.rows[0]?.purpose === 'other', 'and reads it back');
const wrongFallback = await asMember(
  ada,
  `insert into public.media_assets (owner_uid, provider, kind, url, thumb_url, delete_token,
                                    width, height, bytes, mime_type, checksum, purpose)
   values ('${ada}', 'imgbb', 'image', 'https://i.ibb.co/t92t92/mislabeled.png', '', '',
           null, null, 10, '', '', 'meme')`,
);
check(wrongFallback.error !== null, 'the column check still refuses a purpose nobody defined');

console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) {
  console.log(bad.map((label) => `  - ${label}`).join('\n'));
  process.exit(1);
}
