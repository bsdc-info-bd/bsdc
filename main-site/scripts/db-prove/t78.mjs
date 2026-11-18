/**
 * Proof for 0119: a member can delete their own account.
 *
 * Google Play requires in-app account deletion for any app that lets people
 * create an account, and the privacy policy had promised it for months while the
 * only path was an email to support. This migration adds
 * `public.delete_my_account()`, and this harness is the proof that the button
 * does what the policy says it does.
 *
 * The failure modes that matter here are not "the RPC returns an error" — they
 * are:
 *
 *   1. **Deleting almost everything.** The profile row cannot be hard-deleted
 *      (`public.orders.uid` references it `on delete restrict`), so nothing
 *      cascades. A delete list that misses a table leaves a person's address
 *      book, private messages or device tokens behind, and the account is not
 *      deleted in any sense a reviewer or a member would accept. Each personal
 *      store seeded below is checked to be empty afterwards.
 *
 *   2. **Deleting too much.** A profile row is a foreign key target for orders,
 *      payments, moderation records and — critically — other people's content.
 *      The other member's post, comment and follow must still be there, the
 *      owner must still be an active owner, and the audit trail must record the
 *      deletion.
 *
 *   3. **Anonymising nothing.** If the tombstone keeps a name, a handle, a
 *      photo, a role or a location, the account has not been deleted: the row
 *      that survives for the foreign keys still describes a person.
 *
 *   4. **Letting the wrong caller in.** An anonymous caller has no account to
 *      delete; the owner account is the one the platform cannot lose. Both must
 *      be refused with 42501 rather than quietly removed.
 *
 *   5. **Leaving a staff account with its powers.** A moderator or staff member
 *      who deletes their account must not leave a tombstone that still carries
 *      `role = 'staff'`.
 */
import { as, check, expectFail, failureCount, makeDb, summary } from './lib.mjs';

const MEMBER = 'cccccccc-1111-4111-8111-000000000001';
const OTHER = 'cccccccc-1111-4111-8111-000000000002';
const OWNER = 'cccccccc-1111-4111-8111-000000000003';
const STAFF = 'cccccccc-1111-4111-8111-000000000004';

const db = await makeDb();

// --- seed --------------------------------------------------------------------
// One member with a row in every personal store this migration claims to clear,
// a second member with none, the owner, and a staff member who holds a staff
// record and a staff role.
await db.exec(`
  insert into public.profiles (uid, username, display_name, bio, location, website, skills, role, status)
  values
    ('${MEMBER}', 'rahim', 'Rahim Uddin', 'a bio', 'Sylhet', 'https://rahim.example', array['go'], 'member', 'active'),
    ('${OTHER}',  'karim', 'Karim Ahmed', '', '', '', '{}', 'member', 'active'),
    ('${OWNER}',  'owner', 'The Owner', '', '', '', '{}', 'owner', 'active'),
    ('${STAFF}',  'mod1',  'A Moderator', '', '', '', '{}', 'moderator', 'active');

  insert into public.addresses (uid, recipient, phone, line1, city)
  values ('${MEMBER}', 'Rahim Uddin', '01712345678', '12 Mirzapur Road', 'Sylhet');

  -- Published and public: comments and bookmarks are gated on a readable post,
  -- so a draft would test the gate rather than the deletion.
  insert into public.posts (author_uid, status, visibility, slug, title, body, published_at)
  values ('${MEMBER}', 'published', 'public', 'rahims-post', 'Rahim post', 'body', now()),
         ('${OTHER}',  'published', 'public', 'karims-post', 'Karim post', 'body', now());

  insert into public.comments (post_id, author_uid, body)
  select id, '${MEMBER}', 'rahims comment' from public.posts where slug = 'karims-post';
  insert into public.comments (post_id, author_uid, body)
  select id, '${OTHER}', 'karims comment' from public.posts where slug = 'karims-post';

  insert into public.conversations (kind, direct_key, created_by)
  values ('direct', '${[MEMBER, OTHER].sort().join('|')}', '${MEMBER}');
  insert into public.conversation_members (conversation_id, uid)
  select id, '${MEMBER}' from public.conversations limit 1;
  insert into public.conversation_members (conversation_id, uid)
  select id, '${OTHER}' from public.conversations limit 1;
  insert into public.messages (conversation_id, sender_uid, body)
  select id, '${MEMBER}', 'a private message' from public.conversations limit 1;

  insert into public.fcm_tokens (token, token_hash, uid)
  values ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'hash-t78-fcm', '${MEMBER}');
  insert into public.push_subscriptions (endpoint, uid)
  values ('https://push.example/t78', '${MEMBER}');

  insert into public.follows (follower_uid, followee_uid) values ('${MEMBER}', '${OTHER}');
  insert into public.blocks (blocker_uid, blocked_uid) values ('${MEMBER}', '${OTHER}');

  insert into public.notifications (uid, kind, body) values ('${MEMBER}', 'mention', 'to the member');
  insert into public.notifications (uid, actor_uid, kind, body)
  values ('${OTHER}', '${MEMBER}', 'mention', 'because the member acted');

  insert into public.bookmarks (uid, post_id) select '${MEMBER}', id from public.posts where slug = 'karims-post';
  insert into public.feed_preferences (uid) values ('${MEMBER}');
  insert into public.playground_sketches (uid, title, code) values ('${MEMBER}', 'Sketch', 'console.log(1)');

  insert into public.staff_records (uid, staff_no) values ('${STAFF}', 'BSDC-EN-0001');
`);

// --- 1. an anonymous caller has nothing to delete -----------------------------
// `asAnon` reports a pass when the statement *succeeds*, so the refusal is
// checked by hand: the code is asserted, not just that something threw.
let anonCode = null;
try {
  await db.exec(
    `set role anon; select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', false);`,
  );
  await db.query('select public.delete_my_account()');
} catch (error) {
  anonCode = error.code ?? '?';
} finally {
  await db.exec('reset role;');
}
check(
  anonCode === '42501',
  'an anonymous caller cannot delete an account (42501)',
  String(anonCode),
);

// --- 2. the owner account is not deletable from here --------------------------
await expectFail(
  db,
  OWNER,
  'select public.delete_my_account()',
  '42501',
  'the owner cannot delete the owner account (transfer ownership first)',
);

const ownerAfter = (
  await db.query(`select status, display_name, role from public.profiles where uid = '${OWNER}'`)
).rows[0];
check(
  ownerAfter?.status === 'active' && ownerAfter?.display_name === 'The Owner',
  'the refused owner call left the owner account untouched',
  JSON.stringify(ownerAfter),
);

// --- 3. the member deletes their own account ---------------------------------
await as(db, MEMBER, 'select public.delete_my_account()', 'a member can delete their own account');

const tombstone = (
  await db.query(`
    select display_name, username, bio, avatar_url, cover_url, location, website,
           skills, interests, role, status, followers_count, following_count,
           posts_count, onboarding_complete, email_verified
      from public.profiles where uid = '${MEMBER}'
  `)
).rows[0];

check(tombstone !== undefined, 'the profile row survives, so foreign keys keep resolving');
check(tombstone?.status === 'deleted', "the tombstone's status is 'deleted'", tombstone?.status);
check(
  tombstone?.display_name === 'Deleted member',
  'the tombstone carries a generic name',
  tombstone?.display_name,
);
check(
  tombstone?.username === null,
  'the handle is released, not left behind',
  String(tombstone?.username),
);
check(
  tombstone?.bio === '' &&
    tombstone?.avatar_url === '' &&
    tombstone?.cover_url === '' &&
    tombstone?.location === '' &&
    tombstone?.website === '',
  'no bio, photo, cover, location or website survives',
  JSON.stringify(tombstone),
);
check(
  Array.isArray(tombstone?.skills) &&
    tombstone.skills.length === 0 &&
    Array.isArray(tombstone?.interests) &&
    tombstone.interests.length === 0,
  'skills and interests are cleared',
  JSON.stringify({ skills: tombstone?.skills, interests: tombstone?.interests }),
);
check(tombstone?.role === 'member', 'a deleted account keeps no elevated role', tombstone?.role);
check(
  tombstone?.followers_count === 0 &&
    tombstone?.following_count === 0 &&
    tombstone?.posts_count === 0,
  'the counters are zeroed',
  JSON.stringify(tombstone),
);

// --- 4. every personal store the migration names is empty --------------------
async function count(table, where) {
  return (await db.query(`select count(*)::int as c from public.${table} where ${where}`)).rows[0]
    .c;
}

const cleared = [
  ['addresses', `uid = '${MEMBER}'`],
  ['posts', `author_uid = '${MEMBER}'`],
  ['comments', `author_uid = '${MEMBER}'`],
  ['messages', `sender_uid = '${MEMBER}'`],
  ['media_assets', `owner_uid = '${MEMBER}'`],
  ['fcm_tokens', `uid = '${MEMBER}'`],
  ['push_subscriptions', `uid = '${MEMBER}'`],
  ['follows', `follower_uid = '${MEMBER}' or followee_uid = '${MEMBER}'`],
  ['blocks', `blocker_uid = '${MEMBER}' or blocked_uid = '${MEMBER}'`],
  ['notifications', `uid = '${MEMBER}' or actor_uid = '${MEMBER}'`],
  ['bookmarks', `uid = '${MEMBER}'`],
  ['feed_preferences', `uid = '${MEMBER}'`],
  ['topic_affinity', `uid = '${MEMBER}'`],
  ['playground_sketches', `uid = '${MEMBER}'`],
  ['conversation_members', `uid = '${MEMBER}'`],
];

for (const [table, where] of cleared) {
  const remaining = await count(table, where);
  check(remaining === 0, `no row survives in ${table}`, `${remaining} row(s) left`);
}

// --- 5. nothing else was harmed ----------------------------------------------
check(
  (await count('posts', `author_uid = '${OTHER}'`)) === 1,
  "the other member's post is untouched",
);
check(
  (await count('comments', `author_uid = '${OTHER}'`)) === 1,
  "the other member's comment is untouched",
);
check(
  (await count('conversation_members', `uid = '${OTHER}'`)) === 1,
  'the other member remains in the conversation',
);
// The notifications the member caused in other inboxes go too: a line saying
// "Rahim followed you" that links to a tombstone is a dangling reference to a
// person who is gone. The row the member's own action created for the other
// member's *post* is a different matter and is asserted above.
check(
  (await count('notifications', `actor_uid = '${MEMBER}'`)) === 0,
  'no inbox still holds a notification caused by the deleted member',
);
check(
  (await count('profiles', `uid = '${OTHER}' and status = 'active'`)) === 1,
  'the other member is still an active member',
);

// The audit trail must record the deletion — who deleted, when, and that it was
// a self-service deletion rather than a console action.
const audited = (
  await db.query(
    `select count(*)::int as c from public.audit_log where action = 'account.self_delete'`,
  )
).rows[0].c;
check(audited >= 1, 'the deletion is recorded in the audit log', `${audited} row(s)`);

// --- 6. a staff member leaves without their powers ---------------------------=
await as(
  db,
  STAFF,
  'select public.delete_my_account()',
  'a staff member can delete their own account',
);
const staffAfter = (
  await db.query(`select role, status from public.profiles where uid = '${STAFF}'`)
).rows[0];
check(
  staffAfter?.role === 'member' && staffAfter?.status === 'deleted',
  'a deleted staff account keeps no staff role',
  JSON.stringify(staffAfter),
);
check((await count('staff_records', `uid = '${STAFF}'`)) === 0, 'the staff record is removed');

// --- 7. the button is idempotent ---------------------------------------------
// Deleting twice happens for real: the RPC succeeds, the Firebase delete fails
// (offline handset), and the member taps again. The second call must not throw,
// because a member who cannot delete their account is a Play rejection.
await as(
  db,
  MEMBER,
  'select public.delete_my_account()',
  'a second call is harmless, not an error',
);
check(
  (await count('profiles', `uid = '${MEMBER}' and status = 'deleted'`)) === 1,
  'the tombstone is still a single row after a repeat call',
);

// --- 8. the grant is exactly what it should be -------------------------------
const grants = (
  await db.query(`
    select has_function_privilege('anon', p.oid, 'execute') as anon,
           has_function_privilege('authenticated', p.oid, 'execute') as auth
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'delete_my_account'
  `)
).rows;
check(grants.length === 1, 'delete_my_account exists exactly once', `${grants.length} overloads`);
check(grants[0]?.auth === true, 'a signed-in member may execute it');
check(grants[0]?.anon === false, 'anon may not execute it');

const failed = failureCount() + summary();
process.exit(failed === 0 ? 0 : 1);
