/**
 * Proof for 0130: a channel can be built, named, ordered and closed.
 *
 * 0011 gave every group a `general` channel and left the table grant so a
 * group's moderator could shape its rooms directly; 0059 kept that grant on
 * purpose because no `create_channel` routine existed. 0130 gives the shape
 * its routine — build, name, order, close and open — and revokes the direct
 * table write behind it. This harness asks the database the questions the
 * routine answers:
 *
 *   * a moderator builds a room: the slug and name are validated before the
 *     table constraint can answer, the slug is unique within the group, and
 *     the new room lands after the group's current order;
 *   * `update_channel` renames, re-topics and re-orders a room, and leaves
 *     whatever it is not given exactly as it was;
 *   * `close_channel` and `open_channel` are the two halves of
 *     `is_read_only`, each idempotent, and each is the state `save_post`'s
 *     refusal in 0129 already reads;
 *   * every refusal is the right one: authentication, membership, archived
 *     groups for new rooms, malformed slugs and names;
 *   * the direct door is shut: an authenticated member who is not a
 *     moderator can neither write the table nor call the routine;
 *   * the room the routine built is the room the 0129 machinery reads: it
 *     appears in the group's channel list, in the sitemap, and a post saved
 *     into it is attributed to it.
 */
import { as, asAnon, check, expectFail, failureCount, makeDb } from './lib.mjs';

const ada = 'aaaaaaaa-0130-4130-8130-000000000001'; // owner and moderator
const rahim = 'bbbbbbbb-0130-4130-8130-000000000002'; // member, no moderator role
const nadia = 'cccccccc-0130-4130-8130-000000000003'; // stranger
const staff = 'dddddddd-0130-4130-8130-000000000004'; // an administrator

const LIVE = 'sylhet-go-community';
const ARCHIVED = 'old-rust-archive';

const db = await makeDb();

await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${ada}',   'ada_0130',   'Ada Lovelace',  'member', 'active'),
    ('${rahim}', 'rahim_0130', 'Rahim Uddin',   'member', 'active'),
    ('${nadia}', 'nadia_0130', 'Nadia Akter',   'member', 'active'),
    ('${staff}', 'staff_0130', 'Staff Member',  'admin',  'active');

  insert into public.groups (slug, name, description, privacy, owner_uid) values
    ('${LIVE}',    'Sylhet Go Community', 'Talks and jobs for Go developers.', 'public', '${ada}'),
    ('${ARCHIVED}', 'Old Rust Archive',   'Where the old rooms live.',          'public', '${ada}');

  update public.groups set is_archived = true where slug = '${ARCHIVED}';

  insert into public.channels (group_id, slug, name, "position")
  select g.id, 'general', 'general', 0 from public.groups g where g.slug = '${LIVE}'
  union all
  select g.id, 'announcements', 'announcements', 1 from public.groups g where g.slug = '${LIVE}';

  insert into public.group_members (group_id, uid, role)
  select g.id, '${ada}', 'owner'::bsdc_group_role from public.groups g
  union all
  select g.id, '${rahim}', 'member'::bsdc_group_role from public.groups g;
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
const liveId = await groupId(LIVE);
const archivedId = await groupId(ARCHIVED);
const generalId = await channelId(LIVE, 'general');
const announceId = await channelId(LIVE, 'announcements');

// ===========================================================================
// 1. Build — a moderator adds a room
// ===========================================================================
const built = await as(
  db,
  ada,
  `select public.create_channel('${liveId}', 'jobs', 'Jobs', 'The hiring room.') as id`,
  'a moderator builds a channel',
);
const jobsId = built?.rows[0]?.id;
check(
  jobsId !== null && jobsId !== undefined,
  'the built channel returns its id',
  String(built?.rows[0]?.id),
);

const builtRow = await db.query(
  `select slug, name, topic, "position", is_read_only from public.channels where id = '${jobsId}'`,
);
check(
  builtRow.rows[0]?.slug === 'jobs' &&
    builtRow.rows[0]?.name === 'Jobs' &&
    builtRow.rows[0]?.topic === 'The hiring room.' &&
    builtRow.rows[0]?.is_read_only === false,
  'the room is stored with its slug, name and topic',
  JSON.stringify(builtRow.rows[0]),
);
check(
  Number(builtRow.rows[0]?.position) === 2,
  'the room is appended after the group current order',
  String(builtRow.rows[0]?.position),
);

const second = await as(
  db,
  ada,
  `select public.create_channel('${liveId}', 'help', 'Help') as id`,
  'a moderator builds a second channel without a topic',
);
check(second?.rows[0]?.id !== null, 'a second room is built');
const secondRow = await db.query(
  `select topic, "position" from public.channels where id = '${second?.rows[0]?.id}'`,
);
check(
  secondRow.rows[0]?.topic === '' && Number(secondRow.rows[0]?.position) === 3,
  'the missing topic defaults to empty and the room keeps appending',
  JSON.stringify(secondRow.rows[0]),
);

await expectFail(
  db,
  ada,
  `select public.create_channel('${liveId}', 'jobs', 'Duplicate')`,
  '23505',
  'a duplicate slug in the group is refused',
);

// A duplicate slug in a *different* group is a different room.
const otherGroup = await as(
  db,
  ada,
  `select public.create_group('sylhet-rust', 'Sylhet Rust', 'Rust people.', 'public', 'bn') as id`,
  'a second group is built for the cross-group slug check',
);
const otherGroupId = otherGroup?.rows[0]?.id;
const crossGroup = await as(
  db,
  ada,
  `select public.create_channel('${otherGroupId}', 'jobs', 'Jobs') as id`,
  'the same slug is built in the other group',
);
check(crossGroup?.rows[0]?.id !== null, 'the same slug is free in another group');

// ===========================================================================
// 2. Validation — the routine answers before the table constraint can
// ===========================================================================
await expectFail(
  db,
  ada,
  `select public.create_channel('${liveId}', 'Bad Slug!', 'Name')`,
  '22023',
  'a malformed slug is refused',
);
await expectFail(
  db,
  ada,
  `select public.create_channel('${liveId}', 'ok-slug', '')`,
  '22023',
  'an empty name is refused',
);
await expectFail(
  db,
  ada,
  `select public.create_channel('${liveId}', 'ok-slug', 'x' || repeat('y', 60))`,
  '22023',
  'a 61 character name is refused',
);
await expectFail(
  db,
  ada,
  `select public.create_channel('${liveId}', 'ok-slug', 'Name', 't' || repeat('o', 300))`,
  '22023',
  'a 301 character topic is refused',
);
await expectFail(
  db,
  ada,
  `select public.create_channel('00000000-0000-0000-0000-000000000000', 'ok-slug', 'Name')`,
  'P0002',
  'building in an unknown group is refused',
);
await expectFail(
  db,
  ada,
  `select public.create_channel('${archivedId}', 'room', 'Room')`,
  'P0002',
  'building in an archived group is refused',
);
const archivedUntouched = await db.query(
  `select count(*)::int as n from public.channels c join public.groups g on g.id = c.group_id
     where g.slug = '${ARCHIVED}' and c.slug = 'room'`,
);
check(
  Number(archivedUntouched.rows[0]?.n) === 0,
  'the refused archived build left no room behind',
  String(archivedUntouched.rows[0]?.n),
);

await expectFail(
  db,
  rahim,
  `select public.create_channel('${liveId}', 'member-room', 'Nope')`,
  '42501',
  'a member without a moderator role cannot build a room',
);
await expectFail(
  db,
  nadia,
  `select public.create_channel('${liveId}', 'stranger-room', 'Nope')`,
  '42501',
  'a stranger cannot build a room',
);
await expectFail(
  db,
  null,
  `select public.create_channel('${liveId}', 'anon-room', 'Nope')`,
  '42501',
  'a signed-out visitor cannot build a room',
);

// ===========================================================================
// 3. Name and order — the shape of an existing room
// ===========================================================================
await as(
  db,
  ada,
  `select public.update_channel('${jobsId}', 'Open Jobs', 'The hiring and asking room.', 0)`,
  'a moderator renames, re-topics and re-orders the room',
);
const renamed = await db.query(
  `select name, topic, "position" from public.channels where id = '${jobsId}'`,
);
check(
  renamed.rows[0]?.name === 'Open Jobs' &&
    renamed.rows[0]?.topic === 'The hiring and asking room.' &&
    Number(renamed.rows[0]?.position) === 0,
  'the rename, the new topic and the new position are stored',
  JSON.stringify(renamed.rows[0]),
);

await as(
  db,
  ada,
  `select public.update_channel('${jobsId}', null, null, 2)`,
  'a partial update moves only the position',
);
const partial = await db.query(
  `select name, topic, "position" from public.channels where id = '${jobsId}'`,
);
check(
  partial.rows[0]?.name === 'Open Jobs' &&
    partial.rows[0]?.topic === 'The hiring and asking room.' &&
    Number(partial.rows[0]?.position) === 2,
  'what the partial update was not given is left as it was',
  JSON.stringify(partial.rows[0]),
);

await as(
  db,
  ada,
  `select public.update_channel('${jobsId}', 'Jobs', null, null)`,
  'a partial update renames only',
);
const renameOnly = await db.query(
  `select name, topic, "position" from public.channels where id = '${jobsId}'`,
);
check(
  renameOnly.rows[0]?.name === 'Jobs' &&
    renameOnly.rows[0]?.topic === 'The hiring and asking room.' &&
    Number(renameOnly.rows[0]?.position) === 2,
  'the topic and position survive a name-only update',
  JSON.stringify(renameOnly.rows[0]),
);

await expectFail(
  db,
  ada,
  `select public.update_channel('${jobsId}', '', null, null)`,
  '22023',
  'an empty name is refused on update',
);
await expectFail(
  db,
  ada,
  `select public.update_channel('${jobsId}', null, 't' || repeat('o', 300), null)`,
  '22023',
  'a 301 character topic is refused on update',
);
await expectFail(
  db,
  ada,
  `select public.update_channel('${jobsId}', null, null, -1)`,
  '22023',
  'a negative position is refused on update',
);
await expectFail(
  db,
  ada,
  `select public.update_channel('00000000-0000-0000-0000-000000000000', 'Name', null, null)`,
  'P0002',
  'updating an unknown room is refused',
);
await expectFail(
  db,
  rahim,
  `select public.update_channel('${jobsId}', 'Members Room', null, null)`,
  '42501',
  'a member cannot rename the room',
);
await expectFail(
  db,
  nadia,
  `select public.update_channel('${jobsId}', 'Strangers Room', null, null)`,
  '42501',
  'a stranger cannot rename the room',
);

// ===========================================================================
// 4. Close and open — the two halves of is_read_only
// ===========================================================================
const generalBefore = await db.query(
  `select is_read_only from public.channels where id = '${generalId}'`,
);
check(
  generalBefore.rows[0]?.is_read_only === false,
  'the open room starts open',
  String(generalBefore.rows[0]?.is_read_only),
);

await as(
  db,
  ada,
  `select public.close_channel('${generalId}')`,
  'a moderator closes the room',
);
const closed = await db.query(
  `select is_read_only from public.channels where id = '${generalId}'`,
);
check(
  closed.rows[0]?.is_read_only === true,
  'the room is read-only after the close',
  String(closed.rows[0]?.is_read_only),
);

await as(
  db,
  ada,
  `select public.close_channel('${generalId}')`,
  'closing the room again is the same as closing it once',
);
const closedTwice = await db.query(
  `select is_read_only from public.channels where id = '${generalId}'`,
);
check(
  closedTwice.rows[0]?.is_read_only === true,
  'closing twice leaves it closed',
  String(closedTwice.rows[0]?.is_read_only),
);

// The closed state is the one 0129's refusal reads.
const blockOnClosed = await as(
  db,
  rahim,
  `select public.channel_post_block('${generalId}') as reason`,
  'a member is asked about the closed room',
);
check(
  blockOnClosed?.rows[0]?.reason === 'channel/read-only',
  'the closed room refuses a member with channel/read-only',
  String(blockOnClosed?.rows[0]?.reason),
);

await as(
  db,
  ada,
  `select public.open_channel('${generalId}')`,
  'a moderator opens the room again',
);
const reopened = await db.query(
  `select is_read_only from public.channels where id = '${generalId}'`,
);
check(
  reopened.rows[0]?.is_read_only === false,
  'the room is writable again after the open',
  String(reopened.rows[0]?.is_read_only),
);

await as(
  db,
  ada,
  `select public.open_channel('${generalId}')`,
  'opening an open room is the same as opening it once',
);

await expectFail(
  db,
  ada,
  `select public.close_channel('00000000-0000-0000-0000-000000000000')`,
  'P0002',
  'closing an unknown room is refused',
);
await expectFail(
  db,
  ada,
  `select public.open_channel('00000000-0000-0000-0000-000000000000')`,
  'P0002',
  'opening an unknown room is refused',
);
await expectFail(
  db,
  rahim,
  `select public.close_channel('${jobsId}')`,
  '42501',
  'a member cannot close the room',
);
await expectFail(
  db,
  nadia,
  `select public.open_channel('${jobsId}')`,
  '42501',
  'a stranger cannot open the room',
);

// The announcements channel is the read-only room 0011 seeds; closing and
// opening it round-trips through the routine, not the table.
const announceClosed = await as(
  db,
  ada,
  `select public.close_channel('${announceId}')`,
  'the seeded read-only room is closed through the routine',
);
check(announceClosed !== null, 'the seeded room accepts a close');
const announceState = await db.query(
  `select is_read_only from public.channels where id = '${announceId}'`,
);
check(
  announceState.rows[0]?.is_read_only === true,
  'the seeded room is read-only',
  String(announceState.rows[0]?.is_read_only),
);

// ===========================================================================
// 5. The door — the routine is the only way to shape a room
// ===========================================================================
await expectFail(
  db,
  rahim,
  `insert into public.channels (group_id, slug, name) values ('${liveId}', 'member-made', 'Made')`,
  '42501',
  'a member cannot insert a room through the table',
);
await expectFail(
  db,
  rahim,
  `update public.channels set name = 'Renamed By Member' where id = '${jobsId}'`,
  '42501',
  'a member cannot update a room through the table',
);
await expectFail(
  db,
  rahim,
  `delete from public.channels where id = '${jobsId}'`,
  '42501',
  'a member cannot delete a room through the table',
);
await expectFail(
  db,
  nadia,
  `insert into public.channels (group_id, slug, name) values ('${liveId}', 'stranger-made', 'Made')`,
  '42501',
  'a stranger cannot insert a room through the table',
);

// The moderator keeps the read, and the owner keeps the shape through the
// routine after the grant is gone.
const ownerReads = await as(
  db,
  ada,
  `select count(*)::int as n from public.channels c join public.groups g on g.id = c.group_id where g.slug = '${LIVE}'`,
  'the moderator still reads the rooms through the table',
);
check(Number(ownerReads?.rows[0]?.n) === 4, 'the moderator reads the rooms', String(ownerReads?.rows[0]?.n));

const staffBuilds = await as(
  db,
  staff,
  `select public.create_channel('${liveId}', 'staff-made', 'Staff Room') as id`,
  'staff may build a room in any group',
  { staff: true },
);
check(staffBuilds?.rows[0]?.id !== null, 'staff build a room');

const staffRenames = await as(
  db,
  staff,
  `select public.update_channel('${staffBuilds?.rows[0]?.id}', 'Staff Built Room', null, null)`,
  'staff may rename a room in any group',
  { staff: true },
);
check(staffRenames !== null, 'staff rename a room');

const anonReads = await asAnon(
  db,
  `select count(*)::int as n from public.channels c join public.groups g on g.id = c.group_id where g.slug = '${LIVE}'`,
  'a signed-out visitor reads the public group rooms',
);
check(
  Number(anonReads?.rows[0]?.n) === 5,
  'the rooms stay readable by everyone who may see the group',
  String(anonReads?.rows[0]?.n),
);

// ===========================================================================
// 6. The room the routine built is the room everything else reads
// ===========================================================================
// The built room joins the group's channel list — the list the group page
// shows and the channel page finds its room in.
const roomList = await as(
  db,
  ada,
  `select c.slug, c.name, c."position" from public.channels c
     join public.groups g on g.id = c.group_id
    where g.slug = '${LIVE}' order by c."position"`,
  'the group channel list is read',
);
check(
  (roomList?.rows ?? []).map((row) => row.slug).join(',') ===
    'general,announcements,jobs,help,staff-made',
  'the built rooms appear in the group channel list in order',
  JSON.stringify(roomList?.rows),
);

// The sitemap: a public group's rooms are listed, and a newly built one is
// listed from its next refresh.
const sitemap = await asAnon(
  db,
  `select loc from public.sitemap_urls('channels', 1, 1000)`,
  'the sitemap lists the channels',
);
const locs = (sitemap?.rows ?? []).map((row) => row.loc);
check(
  locs.includes(`/g/${LIVE}/c/jobs`) && locs.includes(`/g/${LIVE}/c/help`),
  'the built room is in the sitemap',
  JSON.stringify(locs),
);

// A post saved into the built room is attributed to it — the 0129 contract
// holds for a room the 0130 routine created.
const saved = await as(
  db,
  rahim,
  `select public.save_post(null, '{"title":"in the built room","body":"built and posted","status":"published","visibility":"public"}'::jsonb
        || jsonb_build_object('channel_id', '${jobsId}'), '${LIVE}')::jsonb as saved`,
  'a member posts into the routine-built room',
);
check(saved !== null, 'the post is accepted into the room');
const postChannel = await db.query(
  `select channel_id from public.posts where id = '${saved?.rows?.[0]?.saved?.id}'`,
);
check(
  String(postChannel.rows[0]?.channel_id) === jobsId,
  'the post carries the routine-built room',
  String(postChannel.rows[0]?.channel_id),
);

const feedAttribution = await as(
  db,
  rahim,
  `select channel_id, channel_name, group_slug from public.feed_candidates(60, null)
    where post_id = '${saved?.rows?.[0]?.saved?.id}'`,
  'the feed attributes the post in the routine-built room',
);
check(
  String(feedAttribution?.rows[0]?.channel_id) === jobsId &&
    feedAttribution?.rows[0]?.channel_name === 'Jobs' &&
    feedAttribution?.rows[0]?.group_slug === LIVE,
  'the feed names the routine-built room and its group',
  JSON.stringify(feedAttribution?.rows[0]),
);

const channelFeed = await as(
  db,
  rahim,
  `select count(*)::int as n from public.channel_feed('${jobsId}', 30)`,
  'the channel feed serves the routine-built room',
);
check(Number(channelFeed?.rows[0]?.n) === 1, 'the channel feed serves the room', String(channelFeed?.rows[0]?.n));

// The counts: the group counts the post in its channel, and the room's own
// counter counts it too.
const counts = await as(
  db,
  ada,
  `select channel_id, post_count from public.channel_post_counts('${liveId}')`,
  'the channel post counts are read',
);
const jobsCount = (counts?.rows ?? []).find((row) => String(row.channel_id) === jobsId);
check(
  Number(jobsCount?.post_count) === 1,
  'the routine-built room counts the post placed in it',
  JSON.stringify(jobsCount),
);

// ===========================================================================
// 7. Contract — the routine is executable by the right callers
// ===========================================================================
await expectFail(
  db,
  nadia,
  `select public.create_channel('${liveId}', 'contract-check', 'Nope')`,
  '42501',
  'an authenticated stranger is refused at the routine',
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
  `select public.create_channel('${liveId}', 'anon-made', 'Made')`,
  'anon cannot execute create_channel',
);
await anonRefused(`select public.update_channel('${jobsId}', 'Anon', null, null)`, 'anon cannot execute update_channel');
await anonRefused(`select public.close_channel('${jobsId}')`, 'anon cannot execute close_channel');
await anonRefused(`select public.open_channel('${jobsId}')`, 'anon cannot execute open_channel');

// The grants: the anon role holds no execute on the routines.
const grants = await db.query(`
  select
    has_function_privilege('anon', 'public.create_channel(uuid, text, text, text)', 'execute') as built,
    has_function_privilege('anon', 'public.update_channel(uuid, text, text, integer)', 'execute') as updated,
    has_function_privilege('anon', 'public.close_channel(uuid)', 'execute') as closed,
    has_function_privilege('anon', 'public.open_channel(uuid)', 'execute') as opened
`);
check(
  grants.rows[0]?.built === false &&
    grants.rows[0]?.updated === false &&
    grants.rows[0]?.closed === false &&
    grants.rows[0]?.opened === false,
  'the anon role holds no execute on any channel routine',
  JSON.stringify(grants.rows[0]),
);

await db.close();
process.exit(failureCount() > 0 ? 1 : 0);
