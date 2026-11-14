/**
 * Proof for 0087 & 0088: complete A-to-Z notification triggers, unified routing,
 * @username mention extraction, reaction updates, non-text messenger previews,
 * and idempotent double-application.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeDb, MIGRATIONS_DIR } from './lib.mjs';

const M87 = join(MIGRATIONS_DIR, '0087_notification_vocabulary_expansion.sql');
const M88 = join(MIGRATIONS_DIR, '0088_realtime_push_overhaul_and_all_events.sql');

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002';
const karim = 'cccccccc-3333-4333-8333-000000000003';
const adminUid = 'dddddddd-4444-4444-8444-000000000004';
const secret = 'flush-secret-0123456789abcdefghijklmnopqrstuvwxyz';
const adaToken = 'fcm-token-ada-0123456789abcdefghijklmnopqrstuvwxyz';

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

  insert into public.profiles (uid, username, display_name, role, status) values
    ('${ada}',      'adafirst',    'Ada First',    'member', 'active'),
    ('${rahim}',    'rahimsecond', 'Rahim Second', 'vendor', 'active'),
    ('${karim}',    'karimthird',  'Karim Third',  'member', 'active'),
    ('${adminUid}', 'modboss',     'Mod Boss',     'owner',  'active');
`);

async function as(role, uid, bsdcRole, sql, params = []) {
  if (uid === null) {
    await db.exec(`set role anon; select set_config('request.jwt.claims', '{"role":"anon"}', false);`);
  } else {
    const claims = JSON.stringify({
      sub: uid,
      role: 'authenticated',
      bsdc_role: bsdcRole,
      email_verified: true,
    });
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claims', $jwt$${claims}$jwt$, false);`,
    );
  }
  try {
    const res = await db.query(sql, params);
    return { rows: res.rows, error: null };
  } catch (error) {
    console.error(`SQL error [${sql.slice(0, 60)}]: ${error.message}`);
    return { rows: [], error };
  } finally {
    await db.exec('reset role;');
  }
}

// ---------------------------------------------------------------------------
// 1. Vocabulary & privilege safety
// ---------------------------------------------------------------------------
const labels = (
  await db.query(
    `select e.enumlabel
       from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'bsdc_notification_kind'`,
  )
).rows.map((r) => r.enumlabel);

for (const kind of [
  'follow', 'reaction', 'comment', 'reply', 'mention', 'bookmark', 'share',
  'post_published', 'moderation', 'message', 'order', 'review', 'payout',
  'course', 'job', 'event', 'certificate', 'mention_group', 'group_invite', 'feedback',
]) {
  check(labels.includes(kind), `enum includes ${kind}`);
}

const privNotifyPath = (
  await db.query(
    `select has_function_privilege('authenticated', 'bsdc.notify_path(text,text,bsdc_notification_kind,uuid,uuid,text,uuid,text)'::regprocedure, 'execute') as ok`,
  )
).rows[0].ok;
check(privNotifyPath === false, 'authenticated cannot invoke bsdc.notify_path directly');

// ---------------------------------------------------------------------------
// 2. Reaction update, reply deduplication, @mentions, bookmarks & Q&A feedback
// ---------------------------------------------------------------------------
const postId = (
  await db.query(`
    insert into public.posts (author_uid, kind, slug, title, body, status, published_at, visibility)
    values ('${ada}', 'question', 'test-question-q1', 'How to test Postgres?', 'Body', 'published', now(), 'public')
    returning id`)
).rows[0].id;

await as('authenticated', rahim, 'member', `select * from public.toggle_reaction('${postId}', 'like')`);
await db.exec(`update public.notifications set pushed_at = now(), fcm_pushed_at = now() where uid = '${ada}' and kind = 'reaction'`);
await as('authenticated', rahim, 'member', `select * from public.toggle_reaction('${postId}', 'celebrate')`);
const reactRow = (
  await db.query(
    `select body, fcm_pushed_at is null as fcm_rearmed from public.notifications where uid = '${ada}' and kind = 'reaction'`,
  )
).rows[0];
check(
  reactRow?.body === 'celebrate' && reactRow?.fcm_rearmed === true,
  'changing reaction updates notification body and re-arms FCM push',
);

// Ada comments, Rahim replies -> Ada gets reply + karim gets @mention, NO duplicate comment for Ada
const adaCommentId = (
  await as(
    'authenticated',
    ada,
    'member',
    `insert into public.comments (post_id, author_uid, body) values ('${postId}', '${ada}', 'Initial note') returning id`,
  )
).rows[0].id;

await as(
  'authenticated',
  rahim,
  'member',
  `insert into public.comments (post_id, author_uid, parent_id, body) values ('${postId}', '${rahim}', '${adaCommentId}', 'Great point @karimthird!')`,
);

const rahimReplies = (
  await db.query(`select kind::text from public.notifications where uid = '${ada}' and actor_uid = '${rahim}' and comment_id is not null`)
).rows.map((r) => r.kind);
check(
  rahimReplies.includes('reply') && !rahimReplies.includes('comment'),
  'replying to post author own comment sends reply without duplicate comment notification',
  JSON.stringify(rahimReplies),
);

const karimMention = (
  await db.query(`select kind::text from public.notifications where uid = '${karim}' and kind = 'mention'`)
).rows;
check(karimMention.length === 1, '@username mention in a comment notifies the mentioned member');

const rahimReplyCommentId = (
  await db.query(`select id from public.comments where author_uid = '${rahim}' limit 1`)
).rows[0].id;
await as('authenticated', ada, 'member', `select public.mark_answer('${rahimReplyCommentId}')`);
const answerFeedback = (
  await db.query(`select kind::text from public.notifications where uid = '${rahim}' and kind = 'feedback'`)
).rows;
check(answerFeedback.length === 1, 'mark_answer emits feedback notification');

await as('authenticated', karim, 'member', `select public.toggle_bookmark('${postId}')`);
const bookmarkRow = (
  await db.query(`select kind::text from public.notifications where uid = '${ada}' and kind = 'bookmark'`)
).rows;
check(bookmarkRow.length === 1, 'bookmark emits bookmark notification');

// ---------------------------------------------------------------------------
// 3. Messenger: media preview fallback, group @mention_group, reaction & pin
// ---------------------------------------------------------------------------
const groupConvId = (
  await db.query(`insert into public.conversations (kind, title, created_by) values ('group', 'Dev Room', '${ada}') returning id`)
).rows[0].id;
await db.exec(`
  insert into public.conversation_members (conversation_id, uid, role) values
    ('${groupConvId}', '${ada}', 'owner'),
    ('${groupConvId}', '${rahim}', 'member'),
    ('${groupConvId}', '${karim}', 'member');
`);

await as(
  'authenticated',
  rahim,
  'member',
  `select * from public.send_message_once('${groupConvId}', gen_random_uuid(), '', 'image', 'https://i.ibb.co/x/pic.webp', 'pic.webp')`,
);
const imgNotif = (
  await db.query(`select body from public.notifications where uid = '${ada}' and conversation_id = '${groupConvId}' and kind = 'message'`)
).rows[0];
check(imgNotif?.body === 'Sent an image', 'image message with empty body produces readable preview', imgNotif?.body);

const msgRes = await as(
  'authenticated',
  rahim,
  'member',
  `select id from public.send_message_once('${groupConvId}', gen_random_uuid(), 'Hey @karimthird check this', 'text')`,
);
const msgId = msgRes.rows[0].id;
const groupMention = (
  await db.query(`select kind::text from public.notifications where uid = '${karim}' and conversation_id = '${groupConvId}' and kind = 'mention_group'`)
).rows;
check(groupMention.length === 1, 'group message @mention emits mention_group notification');

await as('authenticated', ada, 'member', `select * from public.toggle_message_reaction('${msgId}', 'like')`);
const msgReact = (
  await db.query(`select kind::text from public.notifications where uid = '${rahim}' and conversation_id = '${groupConvId}' and kind = 'reaction'`)
).rows;
check(msgReact.length === 1, 'toggle_message_reaction notifies sender');

await as('authenticated', ada, 'member', `select public.toggle_message_pin('${msgId}')`);
const pinNotif = (
  await db.query(`select body from public.notifications where uid = '${karim}' and conversation_id = '${groupConvId}' and kind = 'message'`)
).rows[0];
check(pinNotif?.body.startsWith('Pinned:'), 'toggle_message_pin notifies thread members', pinNotif?.body);

// ---------------------------------------------------------------------------
// 4. Legacy store and vendor payouts are retired (0100). Cash on delivery means
//    the vendor keeps the money, so no client role can request or decide a payout,
//    run the legacy cart or checkout, or read or write the payout tables.
// ---------------------------------------------------------------------------
const retiredFunctions = [
  'request_payout', 'decide_payout', 'shop_payouts', 'place_order', 'add_to_cart',
  'advance_order', 'open_shop', 'submit_review', 'mark_order_paid', 'product_catalog',
];
const clientExecute = await db.query(`
  select coalesce(string_agg(p.proname, ', '), '') as open
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any(array[${retiredFunctions.map((f) => `'${f}'`).join(', ')}]::text[])
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'))`);
check(clientExecute.rows[0].open === '', 'retired store and payout RPCs are not executable by anon or authenticated', clientExecute.rows[0].open);

const payoutTableAccess = await db.query(`
  select coalesce(string_agg(t, ', '), '') as open from (
    select 'payouts' as t where has_table_privilege('authenticated', 'public.payouts', 'select,insert,update,delete')
                              or has_table_privilege('anon', 'public.payouts', 'select,insert,update,delete')
    union all
    select 'payout_accounts' where has_table_privilege('authenticated', 'public.payout_accounts', 'select,insert,update,delete')
                                or has_table_privilege('anon', 'public.payout_accounts', 'select,insert,update,delete')
  ) x`);
check(payoutTableAccess.rows[0].open === '', 'payout tables are closed to anon and authenticated', payoutTableAccess.rows[0].open);


// Event RSVP, Job application, Project star, Page follow, Course enroll/quiz, Report & Certificate
const eventId = (
  await db.query(`insert into public.events (host_uid, slug, title, join_url, starts_at, ends_at) values ('${rahim}', 'sylhet-conf', 'Sylhet Dev Conf', 'https://meet.bsdc.info.bd/sylhet-conf', now() + interval '7 days', now() + interval '8 days') returning id`)
).rows[0].id;
await as('authenticated', ada, 'member', `select public.rsvp_event('${eventId}', 'going')`);
const eventNotif = (
  await db.query(`select kind::text, target_url from public.notifications where uid = '${rahim}' and kind = 'event'`)
).rows[0];
check(eventNotif?.target_url === '/events/sylhet-conf', 'rsvp_event notifies organizer with event kind & target_url');

const jobId = (
  await db.query(`insert into public.jobs (poster_uid, slug, title, company, city, description) values ('${rahim}', 'senior-pg', 'Senior Postgres Eng', 'BSDC', 'Sylhet', 'Build scalable systems') returning id`)
).rows[0].id;
await as('authenticated', ada, 'member', `select public.apply_to_job('${jobId}', 'I love Postgres')`);
const jobNotif = (
  await db.query(`select kind::text, target_url from public.notifications where uid = '${rahim}' and kind = 'job'`)
).rows[0];
check(jobNotif?.target_url === '/jobs/senior-pg', 'apply_to_job emits job kind targeting /jobs/<slug>');

const projectId = (
  await db.query(`insert into public.projects (owner_uid, slug, name, tagline) values ('${rahim}', 'bsdc-sdk', 'BSDC SDK', 'Open toolkit') returning id`)
).rows[0].id;
await as('authenticated', ada, 'member', `select public.toggle_project_star('${projectId}')`);
const starNotif = (
  await db.query(`select kind::text, target_url from public.notifications where uid = '${rahim}' and target_url = '/projects/bsdc-sdk'`)
).rows[0];
check(starNotif?.kind === 'reaction', 'toggle_project_star notifies owner with /projects/<slug>');

const pageId = (
  await db.query(`insert into public.pages (owner_uid, slug, name) values ('${rahim}', 'bsdc-lab', 'BSDC Lab') returning id`)
).rows[0].id;
await as('authenticated', ada, 'member', `select public.toggle_page_follow('${pageId}')`);
const pageNotif = (
  await db.query(`select kind::text, target_url from public.notifications where uid = '${rahim}' and target_url = '/pages/bsdc-lab'`)
).rows[0];
check(pageNotif?.kind === 'follow', 'toggle_page_follow notifies page owner with /pages/<slug>');

await as('authenticated', karim, 'member', `insert into public.reports (reporter_uid, subject_type, subject_id, reason) values ('${karim}', 'post', '${postId}', 'spam link')`);
const reportId = (await db.query(`select id from public.reports where reporter_uid = '${karim}' limit 1`)).rows[0].id;
const modFeedback = (
  await db.query(`select kind::text, target_url from public.notifications where uid = '${adminUid}' and kind = 'feedback'`)
).rows;
check(modFeedback.length === 1 && modFeedback[0].target_url === '/moderation', 'filing report notifies staff moderators with feedback kind');

await as('authenticated', adminUid, 'owner', `select public.resolve_report('${reportId}', 'warn', 'warning issued')`);
const reporterFeedback = (
  await db.query(`select kind::text from public.notifications where uid = '${karim}' and kind = 'feedback'`)
).rows;
const authorMod = (
  await db.query(`select kind::text from public.notifications where uid = '${ada}' and kind = 'moderation'`)
).rows;
check(reporterFeedback.length === 1 && authorMod.length === 1, 'resolve_report notifies both reporter (feedback) and content author (moderation)');

const certCode = (
  await as(
    'authenticated',
    adminUid,
    'owner',
    `select public.issue_certificate('course-completion', 'Ada First', 'PostgreSQL Excellence', '${ada}') as c`,
  )
).rows[0].c;
const certNotif = (
  await db.query(`select kind::text, target_url from public.notifications where uid = '${ada}' and kind = 'certificate'`)
).rows[0];
check(certNotif?.target_url === `/verify?code=${certCode}`, 'issue_certificate notifies recipient with certificate kind & verify code');

// Unified routing inside fcm_pending_devices
await as('authenticated', ada, 'member', `select public.register_fcm_token('${adaToken}', 'android', 'BSDC/Android', 'en')`);
const pendingFcm = (
  await as('anon', null, '', `select kind, url from public.fcm_pending_devices($1, 200, 72)`, [secret])
).rows;
check(
  pendingFcm.some((r) => r.kind === 'certificate' && r.url === `/verify?code=${certCode}`) &&
    pendingFcm.length > 0 && pendingFcm.every((r) => typeof r.url === 'string' && r.url.startsWith('/')),
  'fcm_pending_devices returns unified target_url paths across new kinds',
);

// Idempotency re-apply
for (const [label, path] of [['0087', M87], ['0088', M88]]) {
  await db.exec('begin;');
  try {
    await db.exec(await readFile(path, 'utf8'));
    await db.exec('commit;');
    check(true, `${label} applies twice cleanly`);
  } catch (error) {
    await db.exec('rollback;');
    check(false, `${label} applies twice cleanly`, error.message);
  }
}

await db.close();
console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) process.exit(1);
