/**
 * Proof for `scripts/fresh-messenger.mjs`: clears all platform-wide messenger
 * data (conversations, memberships, unsent drafts, messages of every kind,
 * reply chains including blocked direct threads, reactions, receipts, pins,
 * stars, idempotency send records, messenger moderation reports) and all
 * messenger notifications (plus cascading per-device push & FCM delivery rows),
 * while leaving profiles, posts, comments, follows, and non-messenger
 * notifications untouched, respecting dry-run and one-time stamp semantics.
 */
import assert from 'node:assert/strict';
import { buildFreshMessengerSql } from '../../../scripts/fresh-messenger.mjs';
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

async function caller(uid, sql, params = []) {
  const payload = JSON.stringify({
    sub: uid,
    role: 'authenticated',
    bsdc_role: 'member',
    staff: false,
  });
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claims', $jwt$${payload}$jwt$, false);`,
  );
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

function parseFreshReport(results) {
  const last = [...results].reverse().find((item) => Array.isArray(item.rows) && item.rows[0]?.payload);
  assert.ok(last, 'expected fresh-messenger SQL to return payload row');
  return JSON.parse(last.rows[0].payload);
}

try {
  // 1. Seed users, non-messenger social/content/notifications, and push devices
  await db.exec(`
    insert into public.profiles (uid, username, display_name, role, status) values
      ('alice-u', 'alice_dev', 'Alice Rahman', 'member', 'active'),
      ('bob-u',   'bob_dev',   'Bob Hossain',  'member', 'active'),
      ('carol-u', 'carol_dev', 'Carol Akter',  'member', 'active');

    insert into public.follows (follower_uid, followee_uid) values ('alice-u', 'bob-u');

    insert into public.posts (id, slug, author_uid, title, body, status, visibility, published_at) values
      ('33333333-3333-4333-8333-333333333331', 'keep-this-post', 'alice-u', 'Keep Post', 'Content', 'published', 'public', now());

    insert into public.comments (id, post_id, author_uid, body) values
      ('44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333331', 'bob-u', 'Nice guide!');

    insert into public.push_subscriptions (uid, endpoint, p256dh, auth, language) values
      ('bob-u', 'https://push.example/sub/bob-1', 'key1', 'auth1', 'en');

    insert into public.fcm_tokens (uid, token, token_hash, platform, language) values
      ('bob-u', 'fcm-token-1-0000000000000000', 'hash-bob-1', 'android', 'en');
  `);

  // 2. Seed rich messenger data: direct thread (with chained replies & later block!),
  //    group thread (with @mention & pin), drafts, reactions, receipts, stars,
  //    send_message_once idempotency, legacy pre-0048 message notification, and reports.
  const directRows = await caller('alice-u', `select public.open_direct_conversation('bob-u') as id`);
  const directId = directRows[0].id;

  const groupRows = await caller(
    'alice-u',
    `select public.create_group_conversation('Core Chat', array['bob-u', 'carol-u']) as id`,
  );
  const groupId = groupRows[0].id;

  const m1Rows = await caller(
    'alice-u',
    `select * from public.send_message_once($1::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001'::uuid, 'Hello Bob', 'text', '', '', '', null)`,
    [directId],
  );
  const m1Id = m1Rows[0].id;

  const m2Rows = await caller(
    'bob-u',
    `select * from public.send_message_once($1::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002'::uuid, 'Reply to hello', 'text', '', '', '', $2::uuid)`,
    [directId, m1Id],
  );
  const m2Id = m2Rows[0].id;

  // 3-deep reply chain + image message, then Bob blocks Alice (tests leaf-first deletion!)
  const m3Rows = await caller(
    'alice-u',
    `select * from public.send_message_once($1::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003'::uuid, 'Deep reply', 'text', '', '', '', $2::uuid)`,
    [directId, m2Id],
  );
  const m3Id = m3Rows[0].id;

  await caller(
    'bob-u',
    `select * from public.send_message($1::uuid, '', 'image', 'https://i.ibb.co/example/pic.png', 'pic.png')`,
    [groupId],
  );
  await caller(
    'alice-u',
    `select * from public.send_message($1::uuid, 'Hey @bob_dev check this pin', 'text')`,
    [groupId],
  );

  // Reactions, receipts, pins, stars, and unsent drafts across members
  await caller('bob-u', `select * from public.toggle_message_reaction($1::uuid, 'thumbs_up')`, [m1Id]);
  await caller('bob-u', `select public.mark_message_read($1::uuid)`, [m1Id]);
  await caller('alice-u', `select public.toggle_message_pin($1::uuid)`, [m3Id]);

  await db.exec(`
    insert into public.message_stars (uid, message_id) values ('bob-u', '${m1Id}');
    update public.conversation_members
       set draft_body = 'Unsent draft text', is_pinned = true, is_archived = false
     where conversation_id = '${groupId}' and uid = 'carol-u';

    -- Block after messages existed (guard_message_context trap if ON DELETE SET NULL ran!)
    insert into public.blocks (blocker_uid, blocked_uid, reason)
      values ('bob-u', 'alice-u', 'test block after reply chain');

    -- Legacy pre-0048 message notification (kind='comment', post_id is null, comment_id = message.id)
    insert into public.notifications (uid, actor_uid, kind, post_id, comment_id, body)
      values ('carol-u', 'alice-u', 'comment', null, '${m1Id}', 'Legacy pre-0048 chat alert');

    -- Messenger vs non-messenger reports
    insert into public.reports (reporter_uid, subject_type, subject_id, reason) values
      ('carol-u', 'message', '${m1Id}', 'spam'),
      ('carol-u', 'post', '33333333-3333-4333-8333-333333333331', 'other');

    -- Per-device push deliveries attached to both a messenger notification and a follow notification
    insert into bsdc.push_device_deliveries (notification_id, endpoint)
    select id, 'https://push.example/sub/bob-1'
    from public.notifications
    where uid = 'bob-u';

    insert into bsdc.fcm_device_deliveries (notification_id, token_hash)
    select id, 'hash-bob-1'
    from public.notifications
    where uid = 'bob-u';
  `);

  // Sanity check pre-reset state
  const preCounts = await db.query(`
    select
      (select count(*)::int from public.conversations) as convs,
      (select count(*)::int from public.messages) as msgs,
      (select count(*)::int from public.notifications where kind = 'follow') as follow_notifs,
      (select count(*)::int from public.notifications where kind = 'message' or conversation_id is not null or kind = 'comment') as other_notifs
  `);
  eq(preCounts.rows[0].convs, 2, 'seeded 2 conversations');
  eq(preCounts.rows[0].msgs, 5, 'seeded 5 messages');
  eq(preCounts.rows[0].follow_notifs, 1, 'seeded 1 follow notification');
  ok(preCounts.rows[0].other_notifs >= 3, 'seeded messenger notifications');

  // 3. Dry-run leaves every single row intact and returns exact counts
  const dryResults = await db.exec(
    buildFreshMessengerSql({ dryRun: true, stamp: '2026-11-13-initial-fresh-reset' }),
  );
  const dryReport = parseFreshReport(dryResults);
  eq(dryReport.status, 'dry_run', 'dry-run reports dry_run status');
  eq(dryReport.before.conversations, 2, 'dry-run sees 2 conversations');
  eq(dryReport.before.messages, 5, 'dry-run sees 5 messages');
  eq(dryReport.before.non_empty_drafts, 1, 'dry-run sees 1 unsent draft');
  eq(dryReport.before.messenger_reports, 1, 'dry-run sees 1 messenger report');
  ok(dryReport.before.messenger_notifications >= 4, 'dry-run counts messenger & legacy notifications');
  ok(dryReport.before.non_messenger_notifications >= 2, 'dry-run counts non-messenger notifications separately');

  const stillThere = await db.query(`select count(*)::int as n from public.messages`);
  eq(stillThere.rows[0].n, 5, 'dry-run deleted zero messages');

  // 4. Real reset with one-time stamp clears ALL messenger data + messenger notifications,
  //    survives blocked reply chain, and preserves all non-messenger data!
  const applyResults = await db.exec(
    buildFreshMessengerSql({
      dryRun: false,
      stamp: '2026-11-13-initial-fresh-reset',
      actor: 'ci-runner',
    }),
  );
  const applyReport = parseFreshReport(applyResults);
  eq(applyReport.status, 'applied', 'apply reports applied status');
  eq(applyReport.deleted.conversations, 2, 'deleted all conversations');
  eq(applyReport.deleted.conversation_members, 5, 'deleted all conversation memberships & drafts');
  eq(applyReport.deleted.messages, 5, 'deleted all messages including 3-deep blocked reply chain');
  eq(applyReport.deleted.message_reactions, 1, 'deleted all message reactions');
  eq(applyReport.deleted.message_receipts, 1, 'deleted all message receipts');
  eq(applyReport.deleted.message_pins, 1, 'deleted all message pins');
  eq(applyReport.deleted.message_stars, 1, 'deleted all saved message stars');
  eq(applyReport.deleted.message_send_requests, 3, 'deleted all message_send_requests');
  eq(applyReport.deleted.messenger_reports, 1, 'deleted messenger reports only');

  const postCheck = await db.query(`
    select
      (select count(*)::int from public.conversations) as convs,
      (select count(*)::int from public.conversation_members) as members,
      (select count(*)::int from public.messages) as msgs,
      (select count(*)::int from public.message_reactions) as reactions,
      (select count(*)::int from public.message_receipts) as receipts,
      (select count(*)::int from public.message_pins) as pins,
      (select count(*)::int from public.message_stars) as stars,
      (select count(*)::int from bsdc.message_send_requests) as reqs,
      (select count(*)::int from public.notifications where kind = 'message' or conversation_id is not null or coalesce(target_url, '') like '/messages%') as msg_notifs,
      (select count(*)::int from public.notifications where kind = 'comment' and post_id is null) as legacy_msg_notifs,
      (select count(*)::int from public.notifications where kind = 'follow') as follow_notifs,
      (select count(*)::int from public.notifications where kind = 'comment' and post_id is not null) as post_comment_notifs,
      (select count(*)::int from bsdc.push_device_deliveries) as push_deliv,
      (select count(*)::int from bsdc.fcm_device_deliveries) as fcm_deliv,
      (select count(*)::int from public.reports where subject_type = 'post') as post_reports,
      (select count(*)::int from public.profiles) as profiles,
      (select count(*)::int from public.posts) as posts,
      (select count(*)::int from public.follows) as follows,
      (select count(*)::int from public.audit_log where action = 'platform.messenger_fresh' and subject = '2026-11-13-initial-fresh-reset') as audit_rows
  `);
  const p = postCheck.rows[0];
  eq(p.convs, 0, '0 conversations remain');
  eq(p.members, 0, '0 conversation_members remain');
  eq(p.msgs, 0, '0 messages remain');
  eq(p.reactions, 0, '0 message_reactions remain');
  eq(p.receipts, 0, '0 message_receipts remain');
  eq(p.pins, 0, '0 message_pins remain');
  eq(p.stars, 0, '0 message_stars remain');
  eq(p.reqs, 0, '0 message_send_requests remain');
  eq(p.msg_notifs, 0, '0 messenger notifications remain');
  eq(p.legacy_msg_notifs, 0, '0 legacy message-comment notifications remain');
  eq(p.follow_notifs, 1, 'follow notification preserved untouched');
  eq(p.post_comment_notifs, 1, 'post comment notification preserved untouched');
  eq(p.push_deliv, 1, 'only follow notification push delivery row remains');
  eq(p.fcm_deliv, 1, 'only follow notification fcm delivery row remains');
  eq(p.post_reports, 1, 'post report preserved untouched');
  eq(p.profiles, 3, 'all 3 user profiles preserved');
  eq(p.posts, 1, 'published post preserved');
  eq(p.follows, 1, 'follow relationship preserved');
  eq(p.audit_rows, 1, 'audit_log recorded fresh reset stamp');

  // 5. Platform works cleanly immediately after reset; repeated --once stamp is a no-op;
  //    explicit manual reset (no stamp) clears new messages again!
  const freshConv = await caller('carol-u', `select public.open_direct_conversation('bob-u') as id`);
  await caller(
    'carol-u',
    `select * from public.send_message_once($1::uuid, 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'::uuid, 'Brand new chat after fresh reset', 'text', '', '', '', null)`,
    [freshConv[0].id],
  );

  const replayResults = await db.exec(
    buildFreshMessengerSql({ dryRun: false, stamp: '2026-11-13-initial-fresh-reset' }),
  );
  const replayReport = parseFreshReport(replayResults);
  eq(replayReport.status, 'already_applied', 're-running same --once stamp is an idempotent no-op');
  eq((await db.query(`select count(*)::int as n from public.messages`)).rows[0].n, 1, 'new post-reset message untouched by duplicate --once');

  const manualResults = await db.exec(
    buildFreshMessengerSql({ dryRun: false, stamp: '', actor: 'admin-dispatch' }),
  );
  const manualReport = parseFreshReport(manualResults);
  eq(manualReport.status, 'applied', 'explicit manual reset without --once clears new messages');
  eq(manualReport.deleted.messages, 1, 'manual reset deleted new message');
  eq((await db.query(`select count(*)::int as n from public.conversations`)).rows[0].n, 0, 'conversations zero after manual reset');

  console.log(`\nPASS: t64 (${checks} checks)`);
} finally {
  await db.close();
}
