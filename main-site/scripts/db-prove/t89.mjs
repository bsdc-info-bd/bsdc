/**
 * Proof for 0129: a post finds its channel.
 *
 * Groups have owned channels since 0011 and the database has known since
 * 0068 exactly who may read a channel and who may post in one, but nothing
 * could name a channel: `save_post` never inserted `channel_id`,
 * `feed_candidates` returned no channel to attribute, and no surface offered
 * a channel picker. The rules existed, the rooms existed, and there was no
 * door. This harness asks the database the questions the door opens:
 *
 *   * a member's post placed in a channel is stored there, and an ordinary
 *     save without a channel stays a plain feed post;
 *   * `channel_feed` returns the channel post with its channel and group
 *     attached, for everyone who may read the room, and for nobody else;
 *   * `feed_candidates` carries the five new columns so the feed attributes
 *     a channel post, and the channel guard leaks nothing;
 *   * every refusal carries a reason, in the order `can_post_in_channel`
 *     applies it — including `channel/archived` for an archived group's
 *     owner and staff;
 *   * `private` inside a channel is refused, a draft is not;
 *   * the group counter follows the post out of the channel and back in;
 *   * the trash still applies: a deleted post is offered by neither feed;
 *   * `channel_post_block_many` names only the channels the caller may see;
 *   * the sitemap lists the public rooms and nothing else;
 *   * both feeds are executable by anon and authenticated, and
 *     `channel_post_block` is not executable by anon.
 */
import { as, asAnon, check, expectFail, failureCount, makeDb } from './lib.mjs';

const ada = 'aaaaaaaa-0129-4129-8129-000000000001'; // owner of every group
const rahim = 'bbbbbbbb-0129-4129-8129-000000000002'; // member of the open and private groups
const nadia = 'cccccccc-0129-4129-8129-000000000003'; // stranger to everything
const staff = 'dddddddd-0129-4129-8129-000000000004'; // an administrator

const OPEN = 'sylhet-php-community';
const PRIVATE = 'dhaka-rust-closed';
const ARCHIVED = 'old-meetup-archive';

const db = await makeDb();

await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${ada}',   'ada_0129',   'Ada Lovelace',  'member', 'active'),
    ('${rahim}', 'rahim_0129', 'Rahim Uddin',   'member', 'active'),
    ('${nadia}', 'nadia_0129', 'Nadia Akter',   'member', 'active'),
    ('${staff}', 'staff_0129', 'Staff Member',  'admin',  'active');

  insert into public.groups (slug, name, description, privacy, owner_uid) values
    ('${OPEN}',     'Sylhet PHP Community', 'Talks and jobs for PHP developers in Sylhet.', 'public',  '${ada}'),
    ('${PRIVATE}',  'Dhaka Rust Closed',    'A closed room for the Dhaka Rust crowd.',       'private', '${ada}'),
    ('${ARCHIVED}', 'Old Meetup Archive',   'Where the old meetups live.',                   'public',  '${ada}');

  update public.groups set is_archived = true where slug = '${ARCHIVED}';

  insert into public.channels (group_id, slug, name, "position", is_read_only)
  select g.id, 'general', 'general', 0, false from public.groups g where g.slug = '${OPEN}'
  union all
  select g.id, 'announcements', 'announcements', 1, true from public.groups g where g.slug = '${OPEN}'
  union all
  select g.id, 'reading', 'reading', 0, false from public.groups g where g.slug = '${PRIVATE}'
  union all
  select g.id, 'general', 'general', 0, false from public.groups g where g.slug = '${ARCHIVED}';

  insert into public.group_members (group_id, uid, role)
  select g.id, '${ada}', 'owner'::bsdc_group_role from public.groups g
  union all
  select g.id, '${rahim}', 'member'::bsdc_group_role from public.groups g
    where g.slug in ('${OPEN}', '${PRIVATE}');
`);

const groupId = async (slug) =>
  (await db.query(`select id from public.groups where slug = '${slug}'`)).rows[0].id;
const channelId = async (groupSlug, channelSlug) =>
  (
    await db.query(
      `select c.id from public.channels c join public.groups g on g.id = c.group_id
       where g.slug = '${groupSlug}' and c.slug = '${channelSlug}'`,
    )
  ).rows[0].id;

const openGeneral = await channelId(OPEN, 'general');
const openAnnounce = await channelId(OPEN, 'announcements');
const privateReading = await channelId(PRIVATE, 'reading');
const archivedGeneral = await channelId(ARCHIVED, 'general');

// A published public post, in the shape the composer sends it. The slug is
// `save_post`'s third argument.
const POST = `'{"title":"a channel post","body":"written into a channel","status":"published","visibility":"public"}'::jsonb`;
const save = (uid, slug, extra = '') =>
  as(
    db,
    uid,
    `select public.save_post(null, ${POST} || jsonb_build_object(${extra}), '${slug}')::jsonb as saved`,
  );
const saveDraft = (uid, slug, extra = '') =>
  as(
    db,
    uid,
    `select public.save_post(null, '{"title":"a draft","body":"a private draft in a channel","status":"draft","visibility":"private"}'::jsonb || jsonb_build_object(${extra}), '${slug}')::jsonb as saved`,
  );

// ===========================================================================
// 1. Write — the door is open to a member
// ===========================================================================
const savedInChannel = await save(
  rahim,
  'into-the-channel',
  `'channel_id', '${openGeneral}'`,
);
check(savedInChannel !== null, 'a member posts into a public group channel', JSON.stringify(savedInChannel?.rows?.[0]));
const memberPost = savedInChannel?.rows?.[0]?.saved?.id;

const storedChannel = await db.query(
  `select channel_id from public.posts where id = '${memberPost}'`,
);
check(
  String(storedChannel.rows[0]?.channel_id) === openGeneral,
  'the post is stored with its channel',
  String(storedChannel.rows[0]?.channel_id),
);

const savedWithoutChannel = await save(rahim, 'without-a-channel');
check(savedWithoutChannel !== null, 'an ordinary save with no channel key succeeds');
const plainPost = savedWithoutChannel?.rows?.[0]?.saved?.id;
const plainChannel = await db.query(
  `select channel_id from public.posts where id = '${plainPost}'`,
);
check(
  plainChannel.rows[0]?.channel_id === null,
  'a post saved without a channel key lands in the feed',
  String(plainChannel.rows[0]?.channel_id),
);

const savedWithNull = await save(
  rahim,
  'explicit-null-channel',
  "'channel_id', null",
);
check(savedWithNull !== null, 'a save that explicitly names no channel succeeds');
const nullPost = savedWithNull?.rows?.[0]?.saved?.id;
const nullChannel = await db.query(
  `select channel_id from public.posts where id = '${nullPost}'`,
);
check(
  nullChannel.rows[0]?.channel_id === null,
  'an explicit null channel is the same as no channel',
  String(nullChannel.rows[0]?.channel_id),
);

// ===========================================================================
// 2. Read — the channel feed, for everyone who may read the room
// ===========================================================================
const feedForMember = await as(
  db,
  rahim,
  `select post_id, channel_name, channel_slug, group_slug, group_name
     from public.channel_feed('${openGeneral}', 30)`,
  'a member reads the channel feed',
);
check(
  String(feedForMember?.rows[0]?.post_id) === memberPost,
  'the channel feed returns the channel post',
  String(feedForMember?.rows[0]?.post_id),
);
check(
  feedForMember?.rows[0]?.channel_name === 'general' &&
    feedForMember?.rows[0]?.channel_slug === 'general' &&
    feedForMember?.rows[0]?.group_slug === OPEN &&
    feedForMember?.rows[0]?.group_name === 'Sylhet PHP Community',
  'the channel feed names the channel and the group',
  JSON.stringify(feedForMember?.rows[0]),
);

const feedForSignedOut = await asAnon(
  db,
  `select count(*)::int as n from public.channel_feed('${openGeneral}', 30)`,
  'a signed-out visitor reads a public group channel',
);
check(
  Number(feedForSignedOut?.rows[0]?.n) === 1,
  'the signed-out visitor sees the public room',
  String(feedForSignedOut?.rows[0]?.n),
);

const feedForStranger = await as(
  db,
  nadia,
  `select count(*)::int as n from public.channel_feed('${privateReading}', 30)`,
  'a stranger is asked for a private group channel',
);
check(
  Number(feedForStranger?.rows[0]?.n) === 0,
  'a stranger gets zero rows from the private room',
  String(feedForStranger?.rows[0]?.n),
);

const feedForPrivateMember = await as(
  db,
  rahim,
  `select count(*)::int as n from public.channel_feed('${privateReading}', 30)`,
  'a member reads the private room',
);
check(
  Number(feedForPrivateMember?.rows[0]?.n) === 0,
  'the member sees the private room (empty before the private post below)',
  String(feedForPrivateMember?.rows[0]?.n),
);

// The channel post lives in a *public* group, so its row is readable by a
// stranger — what must be invisible is a post inside the private room.
const privatePost = await save(
  rahim,
  'into-the-private-room',
  `'channel_id', '${privateReading}'`,
);
check(privatePost !== null, 'the member posts into the private room');
const privatePostId = privatePost?.rows?.[0]?.saved?.id;
const rowForStranger = await as(
  db,
  nadia,
  `select count(*)::int as n from public.posts where id = '${privatePostId}'`,
  'a stranger looks at the private room post itself',
);
check(
  Number(rowForStranger?.rows[0]?.n) === 0,
  'the private room post row is invisible to the stranger',
  String(rowForStranger?.rows[0]?.n),
);

// and the stranger's feed must not offer it either
const privateFeedStranger = await as(
  db,
  nadia,
  `select count(*)::int as n from public.feed_candidates(60, null) where post_id = '${privatePostId}'`,
  'a stranger is asked for the private room post in the feed',
);
check(
  Number(privateFeedStranger?.rows[0]?.n) === 0,
  'the private room post never appears in a stranger feed',
  String(privateFeedStranger?.rows[0]?.n),
);


// The cursor convention is the home feed's: p_before is the last published_at.
const cursor = await as(
  db,
  rahim,
  `select count(*)::int as n from public.channel_feed('${openGeneral}', 30, (select published_at from public.posts where id = '${memberPost}'))`,
  'the channel feed honours the cursor',
);
check(
  Number(cursor?.rows[0]?.n) === 0,
  'a post is not offered at its own cursor',
  String(cursor?.rows[0]?.n),
);

// ===========================================================================
// 3. Attribution — the feed says where a post was said to be
// ===========================================================================
const feedRow = await as(
  db,
  rahim,
  `select post_id, channel_id, channel_name, channel_slug, group_slug, group_name
     from public.feed_candidates(60, null)
    where post_id = '${memberPost}'`,
  'the home feed returns the channel post',
);
check(
  String(feedRow?.rows[0]?.post_id) === memberPost &&
    String(feedRow?.rows[0]?.channel_id) === openGeneral &&
    feedRow?.rows[0]?.channel_name === 'general' &&
    feedRow?.rows[0]?.channel_slug === 'general' &&
    feedRow?.rows[0]?.group_slug === OPEN &&
    feedRow?.rows[0]?.group_name === 'Sylhet PHP Community',
  'the feed carries all five new columns for the channel post',
  JSON.stringify(feedRow?.rows[0]),
);

const plainRow = await as(
  db,
  rahim,
  `select channel_id, channel_name, channel_slug, group_slug, group_name
     from public.feed_candidates(60, null)
    where post_id = '${plainPost}'`,
  'the home feed returns the plain post',
);
check(
  plainRow?.rows[0]?.channel_id === null &&
    plainRow?.rows[0]?.channel_name === null &&
    plainRow?.rows[0]?.channel_slug === null &&
    plainRow?.rows[0]?.group_slug === null &&
    plainRow?.rows[0]?.group_name === null,
  'a plain post carries nulls in all five columns',
  JSON.stringify(plainRow?.rows[0]),
);

const strangerFeed = await as(
  db,
  nadia,
  `select count(*)::int as n from public.feed_candidates(60, null) where post_id = '${memberPost}'`,
  'a stranger is asked for the public channel post',
);
check(
  Number(strangerFeed?.rows[0]?.n) === 1,
  'a public-group channel post appears in a stranger feed',
  String(strangerFeed?.rows[0]?.n),
);

const strangerPrivate = await as(
  db,
  nadia,
  `select count(*)::int as n from public.feed_candidates(60, null) where post_id = '${memberPost}' and channel_id = '${privateReading}'`,
  'a stranger is asked for the private channel post',
);
check(
  Number(strangerPrivate?.rows[0]?.n) === 0,
  'the private room never appears in a stranger feed',
  String(strangerPrivate?.rows[0]?.n),
);

// A post moved into the channel after it was written is attributed on the
// next save — the feed does not guess from the slug.
const movedIntoChannel = await as(
  db,
  rahim,
  `select public.save_post('${plainPost}', ${POST} || jsonb_build_object('channel_id', '${openGeneral}'))::jsonb as saved`,
  'an existing post is moved into the channel',
);
check(movedIntoChannel !== null, 'the move succeeds');
const movedAttribution = await as(
  db,
  rahim,
  `select channel_id from public.feed_candidates(60, null) where post_id = '${plainPost}'`,
  'the moved post is attributed in the feed',
);
check(
  String(movedAttribution?.rows[0]?.channel_id) === openGeneral,
  'the feed now names the channel of the moved post',
  String(movedAttribution?.rows[0]?.channel_id),
);
// and move it back out, so the counts below are clean
await as(
  db,
  rahim,
  `select public.save_post('${plainPost}', ${POST} || jsonb_build_object('channel_id', null))::jsonb`,
  'the post is moved back to the feed',
);

// ===========================================================================
// 4. Refusals — every refusal carries its reason
// ===========================================================================
await expectFail(
  db,
  nadia,
  `select public.save_post(null, ${POST} || jsonb_build_object('channel_id', '${privateReading}'), 'into-the-private-room')::jsonb`,
  '42501',
  'a stranger is refused a post into a private group channel',
);
const strangerAttempt = await db.query(
  `select count(*)::int as n from public.posts where body = 'written into a channel' and author_uid = '${nadia}'`,
);
check(
  Number(strangerAttempt.rows[0]?.n) === 0,
  'the refused post is provably absent',
  String(strangerAttempt.rows[0]?.n),
);

const strangerReason = await as(
  db,
  nadia,
  `select public.channel_post_block('${privateReading}') as reason`,
  'the stranger is told why',
);
check(
  strangerReason?.rows[0]?.reason === 'channel/not-member',
  'the reason is channel/not-member',
  String(strangerReason?.rows[0]?.reason),
);

await expectFail(
  db,
  rahim,
  `select public.save_post(null, ${POST} || jsonb_build_object('channel_id', '${openAnnounce}'), 'into-the-read-only-room')::jsonb`,
  '42501',
  'a member is refused in the read-only channel',
);
const memberReason = await as(
  db,
  rahim,
  `select public.channel_post_block('${openAnnounce}') as reason`,
  'the member is told why',
);
check(
  memberReason?.rows[0]?.reason === 'channel/read-only',
  'the member reason is channel/read-only',
  String(memberReason?.rows[0]?.reason),
);

const ownerInReadOnly = await save(
  ada,
  'owner-in-read-only',
  `'channel_id', '${openAnnounce}'`,
);
check(ownerInReadOnly !== null, 'the owner may post in a read-only channel');
const ownerReason = await as(
  db,
  ada,
  `select public.channel_post_block('${openAnnounce}') as reason`,
  'the owner is asked about the read-only room',
);
check(
  ownerReason?.rows[0]?.reason === null,
  'the owner reason is null',
  String(ownerReason?.rows[0]?.reason),
);

const staffReason = await as(
  db,
  staff,
  `select public.channel_post_block('${openGeneral}') as reason`,
  'staff are asked about a live group channel',
  { staff: true },
);
check(
  staffReason?.rows[0]?.reason === null,
  'staff may post in a live group channel',
  String(staffReason?.rows[0]?.reason),
);

await expectFail(
  db,
  ada,
  `select public.save_post(null, ${POST} || jsonb_build_object('channel_id', '${archivedGeneral}'), 'into-the-archived-room')::jsonb`,
  '42501',
  'the owner is refused in the archived group',
);
const ownerArchived = await as(
  db,
  ada,
  `select public.channel_post_block('${archivedGeneral}') as reason`,
  'the owner is told why about the archived group',
);
check(
  ownerArchived?.rows[0]?.reason === 'channel/archived',
  'the owner reason is channel/archived',
  String(ownerArchived?.rows[0]?.reason),
);

const staffArchived = await as(
  db,
  staff,
  `select public.channel_post_block('${archivedGeneral}') as reason`,
  'staff are asked about the archived group channel',
  { staff: true },
);
check(
  staffArchived?.rows[0]?.reason === 'channel/archived',
  'staff reason is channel/archived too',
  String(staffArchived?.rows[0]?.reason),
);

await expectFail(
  db,
  rahim,
  `select public.save_post(null, ${POST} || jsonb_build_object('channel_id', '${openGeneral}', 'visibility', 'private', 'status', 'published'), 'private-in-channel')::jsonb`,
  '22023',
  'a published private post in a channel is refused',
);
const privateAttempt = await db.query(
  `select count(*)::int as n from public.posts where body = 'written into a channel' and visibility = 'private'`,
);
check(
  Number(privateAttempt.rows[0]?.n) === 0,
  'the refused private post is not written',
  String(privateAttempt.rows[0]?.n),
);

const privateDraft = await saveDraft(
  rahim,
  'private-draft-in-channel',
  `'channel_id', '${openGeneral}'`,
);
check(privateDraft !== null, 'a private draft in a channel is allowed');
const draftChannel = await db.query(
  `select channel_id, visibility from public.posts where id = '${privateDraft?.rows?.[0]?.saved?.id}'`,
);
check(
  String(draftChannel.rows[0]?.channel_id) === openGeneral &&
    draftChannel.rows[0]?.visibility === 'private',
  'the private draft carries its channel',
  JSON.stringify(draftChannel.rows[0]),
);

// ===========================================================================
// 5. Counts — the group counter follows the post
// ===========================================================================
// The refusals above wrote two more channel posts (the owner's read-only
// post and the private draft). They are moved to the feed first, so this
// section starts from exactly one post in the group's channels.
await as(
  db,
  ada,
  `select public.save_post('${ownerInReadOnly?.rows?.[0]?.saved?.id}', ${POST} || jsonb_build_object('channel_id', null))::jsonb`,
  'the read-only channel post is moved to the feed',
);
await as(
  db,
  rahim,
  `select public.save_post('${privateDraft?.rows?.[0]?.saved?.id}', '{"title":"a draft","body":"a private draft in a channel","status":"draft","visibility":"private"}'::jsonb || jsonb_build_object('channel_id', null))::jsonb`,
  'the private draft is moved to the feed',
);

const openGroupId = await groupId(OPEN);
const countAfterWrites = await db.query(
  `select posts_count from public.groups where id = '${openGroupId}'`,
);
check(
  Number(countAfterWrites.rows[0]?.posts_count) === 1,
  'the group counts its channel post',
  String(countAfterWrites.rows[0]?.posts_count),
);

await as(
  db,
  rahim,
  `select public.save_post('${memberPost}', ${POST} || jsonb_build_object('channel_id', null))::jsonb`,
  'the post is moved out of the channel',
);
const afterDetach = await db.query(
  `select posts_count, (select channel_id from public.posts where id = '${memberPost}') as ch from public.groups where id = '${openGroupId}'`,
);
check(
  Number(afterDetach.rows[0]?.posts_count) === 0 && afterDetach.rows[0]?.ch === null,
  'moving the post out decrements the count and detaches it',
  JSON.stringify(afterDetach.rows[0]),
);

await as(
  db,
  rahim,
  `select public.save_post('${memberPost}', ${POST} || jsonb_build_object('channel_id', '${openGeneral}'))::jsonb`,
  'the post is moved back into the channel',
);
const afterReturn = await db.query(
  `select posts_count from public.groups where id = '${openGroupId}'`,
);
check(
  Number(afterReturn.rows[0]?.posts_count) === 1,
  'moving the post back restores the count',
  String(afterReturn.rows[0]?.posts_count),
);

await as(
  db,
  rahim,
  `select public.save_post('${memberPost}', ${POST} || jsonb_build_object('channel_id', '${openGeneral}'))::jsonb`,
  'the post is edited again with the same channel',
);
const afterSameChannel = await db.query(
  `select posts_count from public.groups where id = '${openGroupId}'`,
);
check(
  Number(afterSameChannel.rows[0]?.posts_count) === 1,
  'an edit that keeps the channel does not count twice',
  String(afterSameChannel.rows[0]?.posts_count),
);

const counts = await as(
  db,
  ada,
  `select channel_id, post_count from public.channel_post_counts('${openGroupId}') order by channel_id`,
  'the channel post counts are read in one round trip',
);
// The open group has two channels: `general` holds the member's channel
// post, and `announcements` — read-only since 0011 — holds none.
check(
  counts?.rows?.length === 2 &&
    counts.rows.some((row) => String(row.channel_id) === openGeneral && Number(row.post_count) === 1) &&
    counts.rows.some((row) => String(row.channel_id) === openAnnounce && Number(row.post_count) === 0),
  'channel_post_counts reports the post in general and none in announcements',
  JSON.stringify(counts?.rows),
);
const total = (counts?.rows ?? []).reduce((sum, row) => sum + Number(row.post_count), 0);
const groupTotal = await db.query(
  `select posts_count from public.groups where id = '${openGroupId}'`,
);
check(
  total === Number(groupTotal.rows[0]?.posts_count),
  'the two channel counts sum to the group total',
  `${total} vs ${groupTotal.rows[0]?.posts_count}`,
);

// ===========================================================================
// 6. Trash — the regression the rewrite had to keep
// ===========================================================================
await as(
  db,
  rahim,
  `update public.posts set deleted_at = now() where id = '${memberPost}'`,
  'the channel post is trashed',
);
const trashedInFeed = await as(
  db,
  rahim,
  `select count(*)::int as n from public.feed_candidates(60, null) where post_id = '${memberPost}'`,
  'the trashed post is asked of the home feed',
);
check(
  Number(trashedInFeed?.rows[0]?.n) === 0,
  'the trashed post leaves the home feed',
  String(trashedInFeed?.rows[0]?.n),
);

const trashedInChannel = await as(
  db,
  rahim,
  `select count(*)::int as n from public.channel_feed('${openGeneral}', 30) where post_id = '${memberPost}'`,
  'the trashed post is asked of the channel feed',
);
check(
  Number(trashedInChannel?.rows[0]?.n) === 0,
  'the trashed post leaves the channel feed',
  String(trashedInChannel?.rows[0]?.n),
);

await as(
  db,
  rahim,
  `update public.posts set deleted_at = null where id = '${memberPost}'`,
  'the channel post is restored',
);
const restoredInFeed = await as(
  db,
  rahim,
  `select count(*)::int as n from public.feed_candidates(60, null) where post_id = '${memberPost}'`,
  'the restored post is asked of the home feed',
);
check(
  Number(restoredInFeed?.rows[0]?.n) === 1,
  'the restored post returns to the feed',
  String(restoredInFeed?.rows[0]?.n),
);

// ===========================================================================
// 7. Bad input — a malformed address is a not-found, not a cast error
// ===========================================================================
const unknownReason = await as(
  db,
  rahim,
  `select public.channel_post_block('00000000-0000-0000-0000-000000000000') as reason`,
  'an unknown channel is asked for a reason',
);
check(
  unknownReason?.rows[0]?.reason === 'channel/not-found',
  'the reason is channel/not-found',
  String(unknownReason?.rows[0]?.reason),
);

await expectFail(
  db,
  rahim,
  `select public.save_post(null, ${POST} || jsonb_build_object('channel_id', '00000000-0000-0000-0000-000000000000'), 'into-the-void')::jsonb`,
  '42501',
  'saving into an unknown channel is refused',
);

await expectFail(
  db,
  rahim,
  `select public.save_post(null, ${POST} || jsonb_build_object('channel_id', 'not-a-uuid'), 'into-the-void')::jsonb`,
  'P0001',
  'a malformed uuid is refused with a reason, not a cast error',
);

// ===========================================================================
// 8. Ownership — the refusal is about the row, not the room
// ===========================================================================
await expectFail(
  db,
  ada,
  `select public.save_post('${memberPost}', ${POST} || jsonb_build_object('channel_id', '${openGeneral}'))::jsonb`,
  'P0001',
  'the group owner cannot move somebody elses post into a channel',
);
const stillThere = await db.query(
  `select channel_id from public.posts where id = '${memberPost}'`,
);
check(
  String(stillThere.rows[0]?.channel_id) === openGeneral,
  'the other members post is untouched by the refusal',
  String(stillThere.rows[0]?.channel_id),
);

const authorMoves = await as(
  db,
  rahim,
  `select public.save_post('${memberPost}', ${POST} || jsonb_build_object('channel_id', '${openGeneral}', 'title', 'announced'))::jsonb as saved`,
  'the author may move their own post into the channel',
);
check(
  authorMoves?.rows[0]?.saved?.id === memberPost,
  'the author may move their own post',
  String(authorMoves?.rows[0]?.saved),
);

// ===========================================================================
// 9. Bulk — one round trip, and only the rooms the caller may see
// ===========================================================================
// The member is asked: the open room is writable, the read-only room and the
// archived room are refused, and the private room is a member's room, so it
// is writable by him.
const bulk = await as(
  db,
  rahim,
  `select channel_id, block from public.channel_post_block_many(
       array['${openGeneral}', '${openAnnounce}', '${privateReading}', '${archivedGeneral}']::uuid[]
     )`,
  'a member asks for the verdict of every channel',
);
check(bulk?.rows?.length === 4, 'one row per channel is returned', String(bulk?.rows?.length));
const byId = Object.fromEntries(
  (bulk?.rows ?? []).map((row) => [String(row.channel_id), row.block]),
);
check(byId[openGeneral] === null, 'the open channel has no block', String(byId[openGeneral]));
check(
  byId[openAnnounce] === 'channel/read-only',
  'the read-only channel says channel/read-only',
  String(byId[openAnnounce]),
);
check(
  byId[privateReading] === null,
  'the private room has no block for its member',
  String(byId[privateReading]),
);
check(
  byId[archivedGeneral] === 'channel/archived',
  'the archived room says channel/archived',
  String(byId[archivedGeneral]),
);

const bulkStranger = await as(
  db,
  nadia,
  `select channel_id, block from public.channel_post_block_many(
       array['${openGeneral}', '${openAnnounce}', '${privateReading}', '${archivedGeneral}']::uuid[]
     )`,
  'a stranger asks for the verdict of every channel',
);
check(
  !(bulkStranger?.rows ?? []).some((row) => String(row.channel_id) === privateReading),
  'the strangers answer omits the private room',
  JSON.stringify(bulkStranger?.rows),
);

const bulkEmpty = await as(
  db,
  ada,
  `select count(*)::int as n from public.channel_post_block_many('{}'::uuid[])`,
  'an empty array is asked for verdicts',
);
check(Number(bulkEmpty?.rows[0]?.n) === 0, 'an empty array returns zero rows', String(bulkEmpty?.rows[0]?.n));

// ===========================================================================
// 10. Sitemap — the crawler learns the public rooms
// ===========================================================================
const sitemap = await asAnon(
  db,
  `select loc from public.sitemap_urls('channels', 1, 1000)`,
  'an anonymous crawler reads the channels sitemap',
);
const locs = (sitemap?.rows ?? []).map((row) => row.loc);
check(
  locs.includes(`/g/${OPEN}/c/general`),
  'the general channel of the open group is listed',
  JSON.stringify(locs),
);
check(
  locs.includes(`/g/${OPEN}/c/announcements`),
  'the announcements channel of the open group is listed',
  JSON.stringify(locs),
);
check(
  !locs.some((loc) => loc.startsWith(`/g/${PRIVATE}`) || loc.startsWith(`/g/${ARCHIVED}`)),
  'nothing from the private or archived group is listed',
  JSON.stringify(locs),
);

const sections = await asAnon(
  db,
  `select section, urls from public.sitemap_sections(1000)`,
  'an anonymous crawler reads the sections',
);
const channelsSection = (sections?.rows ?? []).find((row) => row.section === 'channels');
check(
  Number(channelsSection?.urls) === 2,
  'the channels section is reported with the right count',
  JSON.stringify(channelsSection),
);

// ===========================================================================
// 11. Contract — the shape both feeds promise
// ===========================================================================
// The OUT columns of a function returning TABLE live in proargnames; the
// input arguments are the first proargtypes entries.
const channelCols = await db.query(`
  select p.proargnames[array_length(p.proargtypes, 1) + 1 : array_upper(p.proargnames, 1)] as cols
    from pg_proc p where p.proname = 'channel_feed'
`);
const feedCols = await db.query(`
  select p.proargnames[array_length(p.proargtypes, 1) + 1 : array_upper(p.proargnames, 1)] as cols
    from pg_proc p where p.proname = 'feed_candidates'
`);
check(
  (channelCols.rows[0]?.cols ?? []).length === 18,
  'channel_feed returns 18 columns',
  JSON.stringify(channelCols.rows[0]?.cols),
);
check(
  JSON.stringify(channelCols.rows[0]?.cols) === JSON.stringify(feedCols.rows[0]?.cols),
  'channel_feed column list equals feed_candidates column for column',
  `${JSON.stringify(channelCols.rows[0]?.cols)} vs ${JSON.stringify(feedCols.rows[0]?.cols)}`,
);

await asAnon(
  db,
  `select count(*)::int as n from public.channel_feed('${openGeneral}', 10)`,
  'anon may execute channel_feed',
);
await asAnon(
  db,
  `select count(*)::int as n from public.feed_candidates(10, null)`,
  'anon may execute feed_candidates',
);
await as(
  db,
  nadia,
  `select count(*)::int as n from public.channel_feed('${openGeneral}', 10)`,
  'authenticated may execute channel_feed',
);
await as(
  db,
  nadia,
  `select count(*)::int as n from public.feed_candidates(10, null)`,
  'authenticated may execute feed_candidates',
);

async function anonRefused(sql, label) {
  await db.exec(
    `set role anon; select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', false);`,
  );
  try {
    await db.query(sql);
    check(false, label, 'the anonymous caller was allowed through');
  } catch (error) {
    check(error.code === '42501', label, `${error.code} ${error.message.split('\n')[0]}`);
  } finally {
    await db.exec('reset role;');
  }
}

await anonRefused(
  `select public.channel_post_block('${openGeneral}')`,
  'anon cannot execute channel_post_block',
);
await anonRefused(
  `select public.channel_post_block_many(array['${openGeneral}']::uuid[])`,
  'anon cannot execute channel_post_block_many',
);

await db.close();
process.exit(failureCount() > 0 ? 1 : 0);
