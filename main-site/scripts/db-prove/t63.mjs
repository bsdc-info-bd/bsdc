/**
 * Proof for 0092: follower/following privacy (`showFollowers`), paginated
 * profile social lists, rich search suggestions (respecting `@handle`,
 * discoverable, blocks, and trashed posts), messenger member picker RPC, and
 * hardened group conversation creation.
 */
import assert from 'node:assert/strict';
import { makeDb } from './lib.mjs';

const db = await makeDb();
let checks = 0;
const ok = (condition, label) => {
  assert.ok(condition, label);
  checks += 1;
  console.log(`ok    ${label}`);
};
const eq = (actual, expected, label) => {
  assert.equal(actual, expected, label);
  checks += 1;
  console.log(`ok    ${label}`);
};

async function caller(uid, role, sql, params = [], claimsRole = 'authenticated') {
  const payload = JSON.stringify({
    sub: uid,
    role: claimsRole,
    bsdc_role: role,
    staff: role !== 'member',
  });
  await db.exec(
    `set role ${claimsRole}; select set_config('request.jwt.claims', $jwt$${payload}$jwt$, false);`,
  );
  try {
    return { rows: (await db.query(sql, params)).rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec('reset role');
  }
}

async function anonCaller(sql, params = []) {
  await db.exec(`set role anon; select set_config('request.jwt.claims', '{}', false);`);
  try {
    return { rows: (await db.query(sql, params)).rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec('reset role');
  }
}

try {
  await db.exec(`
    insert into public.profiles (uid, username, display_name, role, status, location, privacy) values
      ('alice-u',   'alice_dev',   'Alice Rahman',   'member',    'active', 'Dhaka',   '{"discoverable":true,"showActivity":true,"showEmail":false,"showFollowers":true}'::jsonb),
      ('bob-u',     'bob_dhaka',   'Bob Hossain',    'member',    'active', 'Sylhet',  '{"discoverable":true,"showActivity":true,"showEmail":false,"showFollowers":false}'::jsonb),
      ('carol-u',   'carol_mod',   'Carol Moderator','moderator', 'active', 'Rajshahi','{"discoverable":true,"showActivity":true,"showEmail":false,"showFollowers":true}'::jsonb),
      ('hidden-u',  'ghost_user',  'Ghost Member',   'member',    'active', 'Khulna',  '{"discoverable":false,"showActivity":false,"showEmail":false,"showFollowers":true}'::jsonb),
      ('blocked-u', 'evil_user',   'Blocked User',   'member',    'active', 'Dhaka',   '{"discoverable":true,"showActivity":true,"showEmail":false,"showFollowers":true}'::jsonb);

    insert into public.profiles (uid, username, display_name) values
      ('default-u', 'default_u', 'Default Privacy User');

    insert into public.staff_records (uid, staff_no, department, designation, is_active) values
      ('carol-u', 'BSDC-MD-0001', 'Trust', 'Moderator', true);

    insert into public.follows (follower_uid, followee_uid) values
      ('alice-u', 'bob-u'),
      ('carol-u', 'bob-u'),
      ('alice-u', 'carol-u'),
      ('blocked-u', 'alice-u');

    insert into public.blocks (blocker_uid, blocked_uid, reason) values
      ('alice-u', 'blocked-u', 'spam');

    insert into public.groups (id, slug, name, description, privacy, owner_uid) values
      ('11111111-1111-4111-8111-111111111111', 'alice-guild', 'Alice TypeScript Guild', 'TS', 'public', 'alice-u');

    insert into public.posts (id, slug, author_uid, title, body, status, visibility, published_at, deleted_at) values
      ('22222222-2222-4222-8222-222222222221', 'alice-live-post',  'alice-u', 'Alice Live Guide',    'Body', 'published', 'public', now(), null),
      ('22222222-2222-4222-8222-222222222222', 'alice-trash-post', 'alice-u', 'Alice Trashed Guide', 'Body', 'published', 'public', now(), now());
  `);

  // 1. Default privacy object includes showFollowers: true
  const defRes = await db.query(`select privacy from public.profiles where uid = 'default-u'`);
  eq(defRes.rows[0].privacy.showFollowers, true, 'profiles.privacy default sets showFollowers=true');

  // 2. Public profile_followers / profile_following work + exclude blocked accounts
  const aliceFollowers = await caller(
    'default-u',
    'member',
    `select uid, username, viewer_follows from public.profile_followers('alice-u', 20, 0)`,
  );
  eq(aliceFollowers.error, null, 'profile_followers succeeds for public profile');
  eq(aliceFollowers.rows.length, 0, 'blocked follower is excluded for non-staff viewer');

  const aliceAsOwner = await caller(
    'alice-u',
    'member',
    `select uid, username, verified from public.profile_following('alice-u', 10, 0)`,
  );
  eq(aliceAsOwner.error, null, 'owner can read own profile_following');
  eq(aliceAsOwner.rows.length, 2, 'alice following list includes bob and carol');
  ok(
    aliceAsOwner.rows.some((r) => r.uid === 'carol-u' && r.verified === true),
    'staff/moderator row carries verified=true',
  );

  // Pagination check
  const alicePage1 = await caller(
    'alice-u',
    'member',
    `select uid from public.profile_following('alice-u', 1, 0)`,
  );
  const alicePage2 = await caller(
    'alice-u',
    'member',
    `select uid from public.profile_following('alice-u', 1, 1)`,
  );
  eq(alicePage1.rows.length, 1, 'pagination limit=1 returns 1 row');
  eq(alicePage2.rows.length, 1, 'pagination offset=1 returns 2nd row');
  ok(alicePage1.rows[0].uid !== alicePage2.rows[0].uid, 'paginated slices are distinct');

  // 3. Private showFollowers=false blocks outsiders & raw follows select, allows owner and staff
  const outsiderFollowers = await caller(
    'default-u',
    'member',
    `select * from public.profile_followers('bob-u', 20, 0)`,
  );
  eq(outsiderFollowers.error?.code, '42501', 'outsider denied profile_followers when showFollowers=false');

  const outsiderFollowing = await caller(
    'default-u',
    'member',
    `select * from public.profile_following('bob-u', 20, 0)`,
  );
  eq(outsiderFollowing.error?.code, '42501', 'outsider denied profile_following when showFollowers=false');

  const rawFollowsOutsider = await caller(
    'default-u',
    'member',
    `select * from public.follows where followee_uid = 'bob-u'`,
  );
  eq(rawFollowsOutsider.rows.length, 0, 'raw follows table query hides private followee rows');

  // Viewer can STILL read their own follow edge on FollowButton even if followee hid list
  const ownEdgeCheck = await caller(
    'alice-u',
    'member',
    `select followee_uid from public.follows where follower_uid = 'alice-u' and followee_uid = 'bob-u'`,
  );
  eq(ownEdgeCheck.rows.length, 1, 'follower still sees own follow edge for FollowButton state');

  const bobSelf = await caller(
    'bob-u',
    'member',
    `select uid from public.profile_followers('bob-u', 20, 0)`,
  );
  eq(bobSelf.error, null, 'owner can still view own private followers list');
  eq(bobSelf.rows.length, 2, 'owner sees all active non-blocked followers');

  const staffView = await caller(
    'carol-u',
    'moderator',
    `select uid from public.profile_followers('bob-u', 20, 0)`,
  );
  eq(staffView.error, null, 'active staff can inspect followers list for moderation');

  // 4. Rich live search suggestions + 3-col suggestions
  const handleSugg = await caller(
    'alice-u',
    'member',
    `select kind, id, slug, title, subtitle from public.search_suggestions_rich('@bob', 10)`,
  );
  eq(handleSugg.error, null, 'search_suggestions_rich handles @prefix cleanly');
  ok(
    handleSugg.rows.some((r) => r.kind === 'person' && r.slug === 'bob_dhaka'),
    '@bob matches bob_dhaka person',
  );
  ok(
    !handleSugg.rows.some((r) => r.kind !== 'person'),
    '@prefix narrows suggestions to people',
  );

  const generalSugg = await caller(
    'alice-u',
    'member',
    `select kind, slug, title from public.search_suggestions_rich('Alice', 10)`,
  );
  ok(generalSugg.rows.some((r) => r.kind === 'group' && r.slug === 'alice-guild'), 'includes matching group');
  ok(generalSugg.rows.some((r) => r.kind === 'post' && r.slug === 'alice-live-post'), 'includes live post');
  ok(
    !generalSugg.rows.some((r) => r.slug === 'alice-trash-post'),
    'excludes trashed posts from search_suggestions_rich',
  );

  const ghostSugg = await caller(
    'alice-u',
    'member',
    `select * from public.search_suggestions('ghost', 10)`,
  );
  eq(ghostSugg.rows.length, 0, 'excludes non-discoverable profile from search_suggestions');

  const blockedSugg = await caller(
    'alice-u',
    'member',
    `select * from public.search_suggestions_rich('evil', 10)`,
  );
  eq(blockedSugg.rows.length, 0, 'excludes blocked profile from search_suggestions_rich');

  // 5. search_members_for_chat enforces auth, excludes self/blocked/hidden, boosts followed
  const anonChat = await anonCaller(`select * from public.search_members_for_chat('a', 10)`);
  eq(anonChat.error?.code, '42501', 'search_members_for_chat rejects anon');

  const aliceChatPick = await caller(
    'alice-u',
    'member',
    `select uid, username, is_following from public.search_members_for_chat('', 12)`,
  );
  eq(aliceChatPick.error, null, 'search_members_for_chat runs for authenticated user');
  ok(!aliceChatPick.rows.some((r) => r.uid === 'alice-u'), 'excludes self');
  ok(!aliceChatPick.rows.some((r) => r.uid === 'blocked-u'), 'excludes blocked member');
  ok(!aliceChatPick.rows.some((r) => r.uid === 'hidden-u'), 'excludes non-discoverable member');
  ok(aliceChatPick.rows[0]?.is_following === true, 'prioritizes followed members first');

  // 6. Hardened create_group_conversation
  const longTitle = await caller(
    'alice-u',
    'member',
    `select public.create_group_conversation($1, array['bob-u'])`,
    ['G'.repeat(81)],
  );
  eq(longTitle.error?.code, '22023', 'create_group_conversation rejects >80 char title with 22023');

  const groupOk = await caller(
    'alice-u',
    'member',
    `select public.create_group_conversation('  Study Crew  ', array['bob-u', 'blocked-u', 'carol-u']) as gid`,
  );
  eq(groupOk.error, null, 'create_group_conversation succeeds while ignoring blocked target');
  const membersRes = await db.query(
    `select uid from public.conversation_members where conversation_id = $1 order by uid`,
    [groupOk.rows[0].gid],
  );
  ok(membersRes.rows.some((r) => r.uid === 'bob-u'), 'bob added to group');
  ok(membersRes.rows.some((r) => r.uid === 'carol-u'), 'carol added to group');
  ok(!membersRes.rows.some((r) => r.uid === 'blocked-u'), 'blocked user excluded from group');

  console.log(`\nPASS: t63 (${checks} checks)`);
} finally {
  await db.close();
}
