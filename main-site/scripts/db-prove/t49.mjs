/**
 * Proof for 0076: the inbox has a shape, and the database decides it.
 *
 * The notification screen said "Something went wrong on this screen" and the
 * boundary recorded it. The screen was assembling an inbox out of raw rows
 * with an embedded join the client had no relationship for, so the failure was
 * a rendering failure, not a query one — which is why it looked like a broken
 * page rather than a broken endpoint.
 *
 * Seven claims:
 *
 *   1. The inbox is one call, and it is the caller's inbox. A second member
 *      calling it sees their own and nothing of the first.
 *   2. Every line knows where it leads: a message to its thread, a reaction to
 *      its post, a moderation notice to the moderation screen, a follow to the
 *      person.
 *   3. A day away is a readable page, not two hundred rows: repeated things
 *      collapse, and the count says how many were collapsed.
 *   4. A notification about something the member can no longer see is not in
 *      the inbox, and does not count towards the badge either.
 *   5. Reading is idempotent, cannot reach another member's rows, and the
 *      badge falls to zero.
 *   6. Clearing removes read rows and keeps unread ones.
 *   7. A signed-out caller is refused, not shown an empty list.
 */
import { makeDb } from './lib.mjs';

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002';
const karim = 'cccccccc-3333-4333-8333-000000000003';

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

const db = await makeDb({ maxExclusive: '0077' });

async function q(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows;
}

async function asMember(uid, sql, params = []) {
  const claims = JSON.stringify({ sub: uid, role: 'authenticated', bsdc_role: 'member' });
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

// ---------------------------------------------------------------------------
// Fixtures: two members, one post by each, one conversation between them.
// ---------------------------------------------------------------------------
await db.exec(`
  insert into public.profiles (uid, username, display_name, avatar_url, role, status)
  values
    ('${ada}',   'ada',   'Ada Lovelace',  'https://cdn.example/ada.webp',   'member', 'active'),
    ('${rahim}', 'rahim', 'Rahim Second',  '',                               'member', 'active'),
    ('${karim}', 'karim', 'Karim Third',   'https://cdn.example/karim.webp', 'member', 'active');

  insert into public.posts (id, author_uid, slug, title, body, status, visibility, published_at)
  values
    ('11111111-1111-4111-8111-000000000001', '${ada}',   'a-river-level', 'A river level', 'Body', 'published', 'public', now() - interval '2 hours'),
    ('22222222-2222-4222-8222-000000000002', '${rahim}', 'a-second-post', 'A second post', 'Body', 'published', 'public', now() - interval '1 hour');

  insert into public.conversations (id, kind, created_by, direct_key)
  values ('33333333-3333-4333-8333-000000000003', 'direct', '${rahim}',
          bsdc.direct_key('${ada}', '${rahim}'));

  insert into public.conversation_members (conversation_id, uid)
  values
    ('33333333-3333-4333-8333-000000000003', '${ada}'),
    ('33333333-3333-4333-8333-000000000003', '${rahim}');
`);

// Notification text is written by `bsdc.notify`, which is the only writer, so
// the fixtures go through it rather than around it.
await db.exec(`
  select bsdc.notify('${ada}', '${rahim}', 'reaction', '11111111-1111-4111-8111-000000000001', null, ''::text);
  select bsdc.notify('${ada}', '${karim}', 'comment',  '11111111-1111-4111-8111-000000000001', null, 'A fine post');
  select bsdc.notify('${ada}', '${rahim}', 'follow',   null, null, '');
  select bsdc.notify('${ada}', '${rahim}', 'message',  null, null, 'Are you free?', '33333333-3333-4333-8333-000000000003');
  select bsdc.notify('${ada}', '${karim}', 'message',  null, null, 'Same thread',  '33333333-3333-4333-8333-000000000003');
  select bsdc.notify('${ada}', null, 'moderation', null, null, 'Your comment was reviewed');
  select bsdc.notify('${rahim}', '${ada}', 'reaction', '22222222-2222-4222-8222-000000000002', null, '');
`);

// ---------------------------------------------------------------------------
// 1. One call, and it is the caller's
// ---------------------------------------------------------------------------
const adaInbox = await asMember(ada, `select * from public.my_inbox(50)`);
check(adaInbox.error === null, 'the inbox answers in one call', adaInbox.error?.message ?? '');
const lines = adaInbox.rows;
// Two messages in one thread are one line, and a reaction and a comment on the
// same post are two: "three people reacted" and "somebody commented" are
// different facts about that post, and merging them hid one of the two.
check(lines.length === 5, 'seven notifications collapse into five lines', `${lines.length} lines`);
check(
  lines.filter((row) => row.post_id === '11111111-1111-4111-8111-000000000001').length === 2,
  'a reaction and a comment on one post are two lines, not one',
  String(lines.filter((row) => row.post_id === '11111111-1111-4111-8111-000000000001').length),
);

// The same inbox, asked twice, has to answer the same way. Two notifications
// written in one transaction share one `created_at`, and ordering the tie by a
// random uuid made this false: the lines swapped places between page loads.
const adaAgain = await asMember(ada, `select * from public.my_inbox(50)`);
check(
  JSON.stringify(adaAgain.rows.map((row) => [row.notification_id, row.kind, row.actor_uid])) ===
    JSON.stringify(lines.map((row) => [row.notification_id, row.kind, row.actor_uid])),
  'the same inbox renders the same way twice',
);

const rahimInbox = await asMember(rahim, `select * from public.my_inbox(50)`);
check(rahimInbox.rows.length === 1, 'the second member sees only their own inbox', `${rahimInbox.rows.length}`);
check(
  rahimInbox.rows.every((row) => row.actor_uid === ada),
  'and only their own actor',
  rahimInbox.rows.map((row) => row.actor_uid).join(','),
);

const byKind = (kind) => lines.find((row) => row.kind === kind);

// ---------------------------------------------------------------------------
// 2. Every line knows where it leads
// ---------------------------------------------------------------------------
check(
  byKind('message')?.target_url === '/messages/33333333-3333-4333-8333-000000000003',
  'a message opens its thread',
  byKind('message')?.target_url ?? 'missing',
);
check(
  lines
    .filter((row) => row.kind === 'reaction')
    .every((row) => row.target_url.startsWith('/p/')),
  'every reaction opens its post by its readable slug',
  lines
    .filter((row) => row.kind === 'reaction')
    .map((row) => row.target_url)
    .join(' '),
);
check(
  byKind('moderation')?.target_url === '/moderation',
  'a moderation notice opens the moderation screen',
  byKind('moderation')?.target_url ?? 'missing',
);
check(
  byKind('follow')?.target_url === '/people',
  'a follow opens the people directory',
  byKind('follow')?.target_url ?? 'missing',
);
check(
  lines.every((row) => typeof row.target_url === 'string' && row.target_url.startsWith('/')),
  'every line leads somewhere on this site',
);

// ---------------------------------------------------------------------------
// 3. Coalescing, and the actor resolved in the same row
// ---------------------------------------------------------------------------
const messageLine = byKind('message');
check(messageLine?.occurrences === 2, 'two messages in one thread are one line', String(messageLine?.occurrences));
check(
  messageLine?.actor_username === 'karim',
  'the line shows the newest actor of the group, not the oldest',
  messageLine?.actor_username ?? '',
);
const reactionLine = lines.find(
  (row) => row.kind === 'reaction' && row.post_id === '11111111-1111-4111-8111-000000000001',
);
check(
  reactionLine?.actor_name === 'Rahim Second',
  'the actor is resolved in the same row, so the screen never polls a second table',
  reactionLine?.actor_name ?? '',
);
check(
  reactionLine?.target_url === '/p/a-river-level',
  'and the line points at the post by its readable slug',
  reactionLine?.target_url ?? 'missing',
);
check(
  byKind('follow')?.actor_avatar === '',
  'a member with no picture answers with an empty string, not a null the screen has to guard',
);
const ordered = lines.map((row) => new Date(row.last_at).getTime());
check(
  ordered.every((value, index) => index === 0 || ordered[index - 1] >= value),
  'the inbox is newest first',
);

// ---------------------------------------------------------------------------
// 4. What the member can no longer see does not appear, and does not count
// ---------------------------------------------------------------------------
const before = (await asMember(ada, `select public.inbox_unread_count() as n`)).rows[0].n;
await db.exec(`update public.posts set status = 'removed' where id = '11111111-1111-4111-8111-000000000001'`);
const afterRemoval = await asMember(ada, `select * from public.my_inbox(50)`);
check(
  afterRemoval.rows.every((row) => row.post_id !== '11111111-1111-4111-8111-000000000001'),
  'removing the post takes its lines out of the inbox',
  `${afterRemoval.rows.length} lines`,
);
const afterCount = (await asMember(ada, `select public.inbox_unread_count() as n`)).rows[0].n;
check(afterCount < before, 'and out of the badge with them', `${before} -> ${afterCount}`);
await db.exec(`update public.posts set status = 'published' where id = '11111111-1111-4111-8111-000000000001'`);

// A reaction on somebody else's post, which is the only kind whose visibility
// can change under the reader: a member can always read their own post.
await db.exec(`
  select bsdc.notify('${ada}', '${karim}', 'reaction', '22222222-2222-4222-8222-000000000002', null, ''::text)`);
const withRahimsPost = await asMember(ada, `select * from public.my_inbox(50)`);
check(
  withRahimsPost.rows.some((row) => row.post_id === '22222222-2222-4222-8222-000000000002'),
  'a reaction on somebody else\'s post is an inbox line while it is readable',
);
await db.exec(
  `update public.posts set visibility = 'private' where id = '22222222-2222-4222-8222-000000000002'`,
);
const afterPrivate = await asMember(ada, `select * from public.my_inbox(50)`);
check(
  afterPrivate.rows.every((row) => row.post_id !== '22222222-2222-4222-8222-000000000002'),
  'a post the viewer may no longer read is not an inbox line',
  `${afterPrivate.rows.length} lines`,
);
await db.exec(`update public.posts set visibility = 'public' where id = '22222222-2222-4222-8222-000000000002'`);

// A conversation the member is no longer in is the same rule.
await db.exec(`
  delete from public.conversation_members
   where conversation_id = '33333333-3333-4333-8333-000000000003' and uid = '${ada}'`);
const afterLeaving = await asMember(ada, `select * from public.my_inbox(50)`);
check(
  afterLeaving.rows.every((row) => row.kind !== 'message'),
  'a thread the member left is not in the inbox',
);
await db.exec(`
  insert into public.conversation_members (conversation_id, uid)
  values ('33333333-3333-4333-8333-000000000003', '${ada}')`);

// ---------------------------------------------------------------------------
// 5. Reading
// ---------------------------------------------------------------------------
const unread = (await asMember(ada, `select public.inbox_unread_count() as n`)).rows[0].n;
check(unread === 7, 'seven notifications are unread', String(unread));

const single = await asMember(
  ada,
  `select public.mark_inbox_read(array[(select notification_id from public.my_inbox(50) where kind = 'follow')]) as n`,
);
check(single.error === null, 'a line can be marked read on its own', single.error?.message ?? '');
check(single.rows[0]?.n === 1, 'and exactly one row was written', String(single.rows[0]?.n));
const again = await asMember(
  ada,
  `select public.mark_inbox_read(array[(select notification_id from public.my_inbox(50) where kind = 'follow')]) as n`,
);
check(again.rows[0]?.n === 0, 'marking it read again writes nothing, so a retry is free');

const all = await asMember(ada, `select public.mark_inbox_read() as n`);
check(all.rows[0]?.n === unread - 1, 'marking everything read writes the rest', String(all.rows[0]?.n));
const zero = (await asMember(ada, `select public.inbox_unread_count() as n`)).rows[0].n;
check(zero === 0, 'the badge is zero afterwards', String(zero));
const stillThere = await asMember(ada, `select * from public.my_inbox(50)`);
const lineCount = stillThere.rows.length;
check(
  lineCount >= 4 && stillThere.rows.every((row) => row.read_at !== null),
  'and nothing was deleted by reading it',
  `${lineCount} lines`,
);

// Another member cannot mark somebody else's notification read by naming it.
const borrowed = (
  await q(`select id from public.notifications where uid = '${ada}' limit 1`)
)[0].id;
const attacked = await asMember(rahim, `select public.mark_inbox_read(array[$1]::uuid[]) as n`, [
  borrowed,
]);
check(attacked.rows[0]?.n === 0, "naming another member's notification marks nothing");
const untouched = (await q(`select read_at from public.notifications where id = '${borrowed}'`))[0];
check(untouched.read_at !== null, 'and the row is exactly as its owner left it');

// ---------------------------------------------------------------------------
// 6. Clearing
// ---------------------------------------------------------------------------
await db.exec(`
  select bsdc.notify('${ada}', '${karim}', 'reaction', '11111111-1111-4111-8111-000000000001', null, ''::text)`);
const cleared = await asMember(ada, `select public.clear_inbox(0) as n`);
check(cleared.error === null, 'an inbox can be cleared', cleared.error?.message ?? '');
check((cleared.rows[0]?.n ?? 0) >= 4, 'every read row went', String(cleared.rows[0]?.n));
const survivor = await asMember(ada, `select * from public.my_inbox(50)`);
check(
  survivor.rows.length === 1 && survivor.rows[0].kind === 'reaction',
  'and the unread one is still there',
  `${survivor.rows.length} lines`,
);

// ---------------------------------------------------------------------------
// 7. A signed-out caller
// ---------------------------------------------------------------------------
await db.exec(`set role anon;`);
let anonymous = null;
try {
  await db.query(`select * from public.my_inbox(50)`);
} catch (error) {
  anonymous = error;
} finally {
  await db.exec('reset role;');
}
check(anonymous?.code === '42501', 'a signed-out caller is refused, not shown an empty inbox',
  anonymous?.code ?? 'it was allowed');

// ---------------------------------------------------------------------------
// 8. The push worker and the screen agree about where a notification leads
// ---------------------------------------------------------------------------
const target = await q(
  `select bsdc.notification_target_for(id) as url from public.notifications
    where uid = '${ada}' limit 1`,
);
check(
  target[0]?.url === survivor.rows[0].target_url,
  'the url the worker would send is the url the inbox shows',
  `${target[0]?.url} vs ${survivor.rows[0].target_url}`,
);

console.log(`\nSUMMARY: ${pass} passed, ${bad.length} failed`);
for (const label of bad) console.log('  failed: ' + label);
process.exit(bad.length === 0 ? 0 : 1);
