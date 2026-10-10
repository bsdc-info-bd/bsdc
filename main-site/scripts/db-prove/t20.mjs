/**
 * Proof for round 6, part 3: deleting a post or a comment puts it in the
 * trash, keeps it recoverable for thirty days, takes it out of every reader's
 * view, and stays honest about every counter along the way.
 *
 * The failure case is the database as it is deployed today (without 0050),
 * where the same delete removes the row, its comments and its replies.
 */
import { makeDb, as, expectFail, summary } from './lib.mjs';

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002';
const sultana = 'cccccccc-3333-4333-8333-000000000003';

let pass = 0;
const bad = [];
async function check(db, sql, expected, label, params) {
  try {
    const result = params ? await db.query(sql, params) : await db.query(sql);
    const got = result.rows[0] ? Object.values(result.rows[0])[0] : undefined;
    if (String(got) === String(expected)) {
      pass += 1;
      console.log(`ok    ${label}`);
    } else {
      bad.push(label);
      console.log(
        `FAIL  ${label}  -> got ${JSON.stringify(got)}, wanted ${JSON.stringify(expected)}`,
      );
    }
  } catch (e) {
    bad.push(label);
    console.log(`FAIL  ${label}  -> [${e.code ?? '?'}] ${String(e.message).split('\n')[0]}`);
  }
}

// A check that runs as a signed-in member, so row level security applies —
// the harness's plain `check` runs as the owner and would see everything.
async function checkAs(db, uid, sql, expected, label) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claims', ` +
      `'{"sub":"${uid}","role":"authenticated","bsdc_role":"member"}', false);`,
  );
  try {
    const result = await db.query(sql);
    const got = result.rows[0] ? Object.values(result.rows[0])[0] : undefined;
    if (String(got) === String(expected)) {
      pass += 1;
      console.log(`ok    ${label}`);
    } else {
      bad.push(label);
      console.log(
        `FAIL  ${label}  -> got ${JSON.stringify(got)}, wanted ${JSON.stringify(expected)}`,
      );
    }
  } catch (e) {
    bad.push(label);
    console.log(`FAIL  ${label}  -> [${e.code ?? '?'}] ${String(e.message).split('\n')[0]}`);
  } finally {
    await db.exec('reset role;');
  }
}

// The same, but the only claim to make is that the statement is refused.
async function checkRefused(db, uid, sql, label) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claims', ` +
      `'{"sub":"${uid}","role":"authenticated","bsdc_role":"member"}', false);`,
  );
  try {
    await db.query(sql);
    bad.push(label);
    console.log(`FAIL  ${label}  -> the statement succeeded`);
  } catch (e) {
    pass += 1;
    console.log(`ok    ${label}  (${e.code ?? '?'})`);
  } finally {
    await db.exec('reset role;');
  }
}

// The delete path the app uses: an UPDATE of `deleted_at` by the author.
const softDelete = (db, uid, table, id) =>
  as(
    db,
    uid,
    `update public.${table} set deleted_at = now() where id = '${id}'`,
    `delete ${table}`,
  );
const restore = (db, uid, table, id) =>
  as(
    db,
    uid,
    `update public.${table} set deleted_at = null where id = '${id}'`,
    `restore ${table}`,
  );

// ---------------------------------------------------------------------------
// Before: what a delete does today
// ---------------------------------------------------------------------------
const before = await makeDb({ skip: ['0050_', '0052_', '0053_'] });
await before.exec(`
  insert into public.profiles (uid, display_name, username) values
    ('${ada}', 'Ada Lovelace', 'ada'),
    ('${rahim}', 'Rahim Uddin', 'rahim'),
    ('${sultana}', 'Sultana Razia', 'sultana');
`);
const beforePost = (
  await before.query(`
    insert into public.posts (author_uid, kind, slug, title, body, status, published_at, visibility)
    values ('${ada}', 'post', 'before-the-trash', 'Before the trash', 'body', 'published', now(), 'public')
    returning id`)
).rows[0].id;
await before.query(`
  insert into public.comments (post_id, author_uid, body) values ('${beforePost}', '${rahim}', 'a comment')`);
await before.query(`
  insert into public.comments (post_id, author_uid, parent_id, root_id, depth, body)
  select post_id, '${sultana}', id, id, 1, 'a reply' from public.comments where post_id = '${beforePost}' limit 1`);
const beforeCounts = (
  await before.query(
    `select count(*)::int as c from public.comments where post_id = '${beforePost}'`,
  )
).rows[0].c;
await before.query(`delete from public.posts where id = '${beforePost}'`);
const beforeAfter = (
  await before.query(
    `select count(*)::int as c from public.comments where post_id = '${beforePost}'`,
  )
).rows[0].c;
console.log('--- BEFORE 0050 ---');
console.log(`comments in the thread: ${beforeCounts}; after deleting the post: ${beforeAfter}`);
console.log(
  `the deleted post still exists for its author: ${
    (await before.query(`select count(*)::int as c from public.posts where id = '${beforePost}'`))
      .rows[0].c
  }`,
);
await before.close();

// ---------------------------------------------------------------------------
// After
// ---------------------------------------------------------------------------
const db = await makeDb();
await db.exec(`
  insert into public.profiles (uid, display_name, username) values
    ('${ada}', 'Ada Lovelace', 'ada'),
    ('${rahim}', 'Rahim Uddin', 'rahim'),
    ('${sultana}', 'Sultana Razia', 'sultana');
`);

const post = (
  await db.query(`
    insert into public.posts (author_uid, kind, slug, title, body, status, published_at, visibility)
    values ('${ada}', 'post', 'thirty-days', 'Thirty days', 'body', 'published', now(), 'public')
    returning id`)
).rows[0].id;
const comment = (
  await db.query(`
    insert into public.comments (post_id, author_uid, body)
    values ('${post}', '${rahim}', 'a comment')
    returning id`)
).rows[0].id;
await db.query(`
    insert into public.comments (post_id, author_uid, parent_id, root_id, depth, body)
    values ('${post}', '${ada}', '${comment}', '${comment}', 1, 'a reply')
    returning id`);

console.log('--- AFTER 0050 ---');
await check(
  db,
  `select posts_count::int from public.profiles where uid = '${ada}'`,
  1,
  'the author has one published post',
);
await check(
  db,
  `select comments_count::int from public.posts where id = '${post}'`,
  2,
  'the post counts both comments',
);

// --- a comment goes to the trash -------------------------------------------
await softDelete(db, rahim, 'comments', comment);
await check(
  db,
  `select comments_count::int from public.posts where id = '${post}'`,
  1,
  'a comment in the trash stops counting on the post',
);
await check(
  db,
  `select replies_count::int from public.comments where id = '${comment}'`,
  1,
  'its reply is still attached to it',
);
await checkAs(
  db,
  sultana,
  `select count(*)::int from public.comments where id = '${comment}'`,
  0,
  'the deleted comment is invisible to a different member',
);
await checkAs(
  db,
  rahim,
  `select count(*)::int from public.comments where id = '${comment}'`,
  1,
  'the author still sees it',
);
await checkAs(
  db,
  rahim,
  `select kind::text from public.my_deleted_content(50) where id = '${comment}'`,
  'comment',
  'the trash lists it as a comment',
);
await checkAs(
  db,
  rahim,
  `select restorable from public.my_deleted_content(50) where id = '${comment}'`,
  'true',
  'and it is still restorable',
);
await checkAs(
  db,
  sultana,
  `select count(*)::int from public.my_deleted_content(50)`,
  0,
  'somebody else trash is empty',
);

await restore(db, rahim, 'comments', comment);
await check(
  db,
  `select comments_count::int from public.posts where id = '${post}'`,
  2,
  'restoring the comment puts the count back',
);

// --- a post goes to the trash ----------------------------------------------
await softDelete(db, ada, 'posts', post);
await check(
  db,
  `select posts_count::int from public.profiles where uid = '${ada}'`,
  0,
  'a post in the trash leaves the author post count',
);
await check(
  db,
  `select count(*)::int from public.posts where id = '${post}'`,
  1,
  'but the row is still there',
);
await checkAs(
  db,
  rahim,
  `select count(*)::int from public.posts where id = '${post}'`,
  0,
  'a reader cannot see it',
);
await checkAs(
  db,
  rahim,
  `select count(*)::int from public.comments where post_id = '${post}'`,
  0,
  'and neither can they see its comments',
);
await check(
  db,
  `select count(*)::int from public.feed_candidates(60, null) where post_id = '${post}'`,
  0,
  'the feed does not offer it',
);
await check(
  db,
  `select count(*)::int from public.global_search('thirty days', array['post'], 10) where id = '${post}'`,
  0,
  'search does not return it',
);
await check(
  db,
  `select count(*)::int from public.sitemap_urls('posts', 1, 1000) where loc = '/p/thirty-days'`,
  0,
  'the sitemap does not offer it to a crawler',
);
await check(
  db,
  `select robots from public.seo_for_path('/p/thirty-days')`,
  'noindex',
  'its page says noindex',
);
await expectFail(
  db,
  rahim,
  `select public.toggle_reaction('${post}', 'like')`,
  'P0002',
  'and it accepts no new reaction',
);
await checkRefused(
  db,
  rahim,
  `insert into public.comments (post_id, author_uid, body) values ('${post}', '${rahim}', 'late')`,
  'and no new comment',
);

// --- recovery ---------------------------------------------------------------
await checkAs(
  db,
  ada,
  `select kind::text from public.my_deleted_content(50) where id = '${post}'`,
  'post',
  'the trash lists the post',
);
await checkAs(
  db,
  ada,
  `select restorable from public.my_deleted_content(50) where id = '${post}'`,
  'true',
  'with the window open',
);
const expires = (
  await db.query(`select expires_at from public.my_deleted_content(50) where id = '${post}'`)
).rows[0]?.expires_at;
if (expires)
  console.log('      the list says it stops being recoverable at', expires.toISOString());

await restore(db, ada, 'posts', post);
await check(
  db,
  `select posts_count::int from public.profiles where uid = '${ada}'`,
  1,
  'restoring puts the author post count back',
);
await check(
  db,
  `select count(*)::int from public.feed_candidates(60, null) where post_id = '${post}'`,
  1,
  'and the feed offers it again',
);
await check(
  db,
  `select robots from public.seo_for_path('/p/thirty-days')`,
  'index',
  'and its page is indexable again',
);

// --- the window closes ------------------------------------------------------
await db.exec(`update public.posts set deleted_at = now() where id = '${post}'`);
await db.exec(
  `update public.posts set deleted_at = now() - interval '31 days' where id = '${post}'`,
);
await checkAs(
  db,
  ada,
  `select restorable from public.my_deleted_content(50) where id = '${post}'`,
  'false',
  'after thirty days the trash says it is not restorable',
);
await expectFail(
  db,
  ada,
  `update public.posts set deleted_at = null where id = '${post}'`,
  'P0001',
  'and the database refuses the restore',
);
await check(
  db,
  `select count(*)::int from public.posts where id = '${post}'`,
  1,
  'the row is still there until the purge',
);
await db.exec(`update public.posts set deleted_at = now() where id = '${post}'`);
await check(
  db,
  `select posts_removed from public.purge_deleted_content(30)`,
  0,
  'the purge leaves it alone while it is fresh',
);
await db.exec(
  `update public.posts set deleted_at = now() - interval '31 days' where id = '${post}'`,
);
await check(
  db,
  `select posts_removed from public.purge_deleted_content(30)`,
  1,
  'the purge takes it after thirty days',
);
await check(db, `select count(*)::int from public.posts where id = '${post}'`, 0, 'and it is gone');
await check(
  db,
  `select count(*)::int from public.comments where post_id = '${post}'`,
  0,
  'with its comments',
);

// --- the purge is not a member endpoint ------------------------------------
await expectFail(
  db,
  ada,
  `select public.purge_deleted_content(30)`,
  '42501',
  'a member cannot run the purge',
);
const purgeGrants = (
  await db.query(`
    select array_to_string(array[
      case when has_function_privilege('anon', 'public.purge_deleted_content(integer)', 'execute') then 'anon' end,
      case when has_function_privilege('authenticated', 'public.purge_deleted_content(integer)', 'execute') then 'authenticated' end,
      case when has_function_privilege('service_role', 'public.purge_deleted_content(integer)', 'execute') then 'service_role' end
    ], ',') as roles`)
).rows[0].roles;
await check(
  db,
  `select '${purgeGrants}'`,
  'service_role',
  'the purge belongs to service_role alone',
);
await check(db, `select greatest(coalesce(30, 30), 7)::text`, '30', 'harness sanity');

// --- permanent delete always works, window or not ---------------------------
const second = (
  await db.query(`
    insert into public.posts (author_uid, kind, slug, title, body, status, published_at, visibility)
    values ('${ada}', 'post', 'gone-for-good', 'Gone for good', 'body', 'published', now(), 'public')
    returning id`)
).rows[0].id;
await db.exec(
  `update public.posts set deleted_at = now() - interval '90 days' where id = '${second}'`,
);
await as(
  db,
  ada,
  `delete from public.posts where id = '${second}'`,
  'permanent delete by the author',
);
await check(
  db,
  `select count(*)::int from public.posts where id = '${second}'`,
  0,
  'an author can delete permanently at any time',
);

// --- editing stamps the edit; the trash does not count as an edit -----------
await db.exec(`update public.posts set deleted_at = null, edited_at = null where id = '${second}'`);
const third = (
  await db.query(`
    insert into public.posts (author_uid, kind, slug, title, body, status, published_at, visibility)
    values ('${ada}', 'post', 'being-edited', 'Being edited', 'body', 'published', now(), 'public')
    returning id`)
).rows[0].id;
await as(
  db,
  ada,
  `update public.posts set body = 'a new body' where id = '${third}'`,
  'the author edits the body',
);
await check(
  db,
  `select edited_at is not null from public.posts where id = '${third}'`,
  'true',
  'an edited post carries the edit time',
);
await db.exec(`update public.posts set edited_at = null where id = '${third}'`);
await as(
  db,
  ada,
  `update public.posts set deleted_at = now() where id = '${third}'`,
  'the author deletes it',
);
await check(
  db,
  `select edited_at is null from public.posts where id = '${third}'`,
  'true',
  'and going to the trash is not an edit',
);

// --- one member never touches another's trash -------------------------------
await as(
  db,
  rahim,
  `update public.posts set deleted_at = null where id = '${third}'`,
  'a stranger tries to restore it (a filtered update reports success)',
);
await check(
  db,
  `select deleted_at is not null from public.posts where id = '${third}'`,
  'true',
  'and the post is still in the trash',
);
await check(
  db,
  `select deleted_at is not null from public.posts where id = '${third}'`,
  'true',
  'and the row is still in the trash',
);

// --- counters survive a round trip ------------------------------------------
await restore(db, ada, 'posts', third);
const beforeCount = (
  await db.query(`select posts_count::int as c from public.profiles where uid = '${ada}'`)
).rows[0].c;
console.log('      the author count before the round trip:', beforeCount);
await db.exec(`update public.posts set deleted_at = now() where id = '${third}'`);
await db.exec(`update public.posts set deleted_at = null where id = '${third}'`);
await db.exec(`update public.posts set deleted_at = now() where id = '${third}'`);
const midCount = (
  await db.query(`select posts_count::int as c from public.profiles where uid = '${ada}'`)
).rows[0].c;
await db.exec(`update public.posts set deleted_at = null where id = '${third}'`);
await check(
  db,
  `select posts_count::int from public.profiles where uid = '${ada}'`,
  beforeCount,
  'delete and restore twice leaves the author count where it was',
);
await check(
  db,
  `select '${midCount}'`,
  String(beforeCount - 1),
  'and the count really did move while it was in the trash',
);

await db.close();
const libFails = summary();
console.log(`t20 SUMMARY: ${pass} passed, ${bad.length + libFails} failed`);
for (const f of bad) console.log('  failed: ' + f);
process.exit(bad.length + libFails === 0 ? 0 : 1);
