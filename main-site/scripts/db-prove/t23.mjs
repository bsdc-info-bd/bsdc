/**
 * Proof for 0052: the moderator the thread offers is a moderator the database
 * allows — and the row they hide is a row they can read again.
 *
 * Before: the post author's soft delete of somebody else's comment failed with
 * 42501 "new row violates row-level security policy", because a trashed
 * comment was private to its own author. The control was offered and did
 * nothing.
 */
import { makeDb } from './lib.mjs';

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002';
const sultana = 'cccccccc-3333-4333-8333-000000000003';

let pass = 0;
const bad = [];

async function as(db, uid, sql, claims = {}) {
  const payload = JSON.stringify({
    sub: uid,
    role: 'authenticated',
    bsdc_role: 'member',
    ...claims,
  });
  try {
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claims', $jwt$${payload}$jwt$, false);`,
    );
    return { ok: true, result: await db.query(sql) };
  } catch (e) {
    return { ok: false, error: e };
  } finally {
    await db.exec('reset role;');
  }
}

function check(got, expected, label) {
  if (String(got) === String(expected)) {
    pass += 1;
    console.log(`ok    ${label}`);
  } else {
    bad.push(label);
    console.log(
      `FAIL  ${label}  -> got ${JSON.stringify(got)}, wanted ${JSON.stringify(expected)}`,
    );
  }
}

const hidden = (db, id) =>
  db.query(`select (deleted_at is not null)::int as n from public.comments where id = '${id}'`);

const visibleTo = async (db, uid, id) => {
  const r = await as(db, uid, `select count(*)::int as n from public.comments where id = '${id}'`);
  return r.ok ? r.result.rows[0].n : `[${r.error.code}]`;
};

// ---------------------------------------------------------------------------
// Before 0052 — the deployed policies, exactly as production has them
// ---------------------------------------------------------------------------
const before = await makeDb({ skip: ['0052_'] });
await before.exec(`
  insert into public.profiles (uid, display_name, username) values
    ('${ada}', 'Ada Lovelace', 'ada'),
    ('${rahim}', 'Rahim Uddin', 'rahim');
`);
const beforePost = (
  await before.query(`insert into public.posts (author_uid, kind, slug, title, body, status, published_at, visibility)
    values ('${ada}', 'post', 'before', 'Before', 'b', 'published', now(), 'public') returning id`)
).rows[0].id;
const beforeComment = (
  await before.query(
    `insert into public.comments (post_id, author_uid, body) values ('${beforePost}', '${rahim}', 'a comment') returning id`,
  )
).rows[0].id;

const beforeAttempt = await as(
  before,
  ada,
  `update public.comments set deleted_at = now() where id = '${beforeComment}'`,
);
const beforeOutcome = beforeAttempt.ok
  ? 'accepted, nothing written'
  : `[${beforeAttempt.error.code}] ${String(beforeAttempt.error.message).split('\n')[0]}`;
console.log(
  `--- BEFORE 0052 ---\n` +
    `the post author's soft delete: ${beforeOutcome}\n` +
    `the row is hidden afterwards: ${(await hidden(before, beforeComment)).rows[0].n}`,
);

// The update policy is only half of it. Widening it alone — the obvious fix —
// turns the quiet no-op into a refusal, because a trashed comment is still
// private to the member who wrote it and Postgres will not write a row the
// writer cannot read.
await before.exec(`
  drop policy comments_update_own on public.comments;
  create policy comments_update_own on public.comments for update
    using (
      author_uid = bsdc.current_uid()
      or bsdc.is_staff()
      or exists (select 1 from public.posts p where p.id = post_id and p.author_uid = bsdc.current_uid())
    )
    with check (
      author_uid = bsdc.current_uid()
      or bsdc.is_staff()
      or exists (select 1 from public.posts p where p.id = post_id and p.author_uid = bsdc.current_uid())
    );
`);
const halfFix = await as(
  before,
  ada,
  `update public.comments set deleted_at = now() where id = '${beforeComment}'`,
);
console.log(
  `with only the update policy widened: ${
    halfFix.ok
      ? 'accepted'
      : `[${halfFix.error.code}] ${String(halfFix.error.message).split('\n')[0]}`
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

const post = async (authorUid, slug) =>
  (
    await db.query(`insert into public.posts (author_uid, kind, slug, title, body, status, published_at, visibility)
      values ('${authorUid}', 'post', '${slug}', '${slug}', 'b', 'published', now(), 'public') returning id`)
  ).rows[0].id;
const comment = async (postId, authorUid, body) =>
  (
    await db.query(
      `insert into public.comments (post_id, author_uid, body) values ('${postId}', '${authorUid}', '${body}') returning id`,
    )
  ).rows[0].id;

const adaPost = await post(ada, 'ada-thread');
const onAdasPost = await comment(adaPost, rahim, 'rahim on adas thread');
const rahimPost = await post(rahim, 'rahim-thread');
const onRahimsPost = await comment(rahimPost, ada, 'ada on rahims thread');
const nobodyOfAdas = await comment(rahimPost, sultana, 'sultana on rahims thread');

// 1. the moderator's hide lands
const hide = await as(
  db,
  ada,
  `update public.comments set deleted_at = now() where id = '${onAdasPost}'`,
);
check(
  hide.ok ? 1 : `[${hide.error.code}]`,
  1,
  'the post author soft-deletes a comment on their post',
);
check((await hidden(db, onAdasPost)).rows[0].n, 1, 'and it is hidden');

// 2. the moderator can read it back — the half that made the write possible
check(await visibleTo(db, ada, onAdasPost), 1, 'the post author still reads the hidden comment');
check(await visibleTo(db, rahim, onAdasPost), 1, 'and so does the member who wrote it');
check(await visibleTo(db, sultana, onAdasPost), 0, 'nobody else does');

// 3. the trash names it as something they moderated
const trash = await as(
  db,
  ada,
  `select string_agg(id::text || ':' || moderated::text, ',') as listing from public.my_deleted_content(50)`,
);
check(
  trash.ok ? trash.result.rows[0].listing : `[${trash.error.code}]`,
  `${onAdasPost}:true`,
  'the trash lists the hidden comment as moderated',
);
const rahimTrash = await as(
  db,
  rahim,
  `select count(*)::int as n from public.my_deleted_content(50)`,
);
check(
  rahimTrash.ok ? rahimTrash.result.rows[0].n : `[${rahimTrash.error.code}]`,
  1,
  'his own trash holds his own row only',
);

// 4. restore goes through the same door
const restore = await as(
  db,
  ada,
  `update public.comments set deleted_at = null where id = '${onAdasPost}'`,
);
check(restore.ok ? 1 : `[${restore.error.code}]`, 1, 'the post author restores the comment');
check((await hidden(db, onAdasPost)).rows[0].n, 0, 'and it is visible again');

// 5. the rest of the rules are unchanged
const own = await as(
  db,
  ada,
  `update public.comments set deleted_at = now() where id = '${onRahimsPost}'`,
);
check(own.ok ? 1 : `[${own.error.code}]`, 1, 'a member still deletes their own comment');
const stranger = await as(
  db,
  ada,
  `update public.comments set deleted_at = now() where id = '${nobodyOfAdas}'`,
);
check(
  stranger.ok ? (await hidden(db, nobodyOfAdas)).rows[0].n : `[${stranger.error.code}]`,
  0,
  'a member with no part in a thread still changes nothing',
);
const thirdPartyOwn = await comment(adaPost, sultana, 'sultana again on adas thread');
const strangerOnOwnPost = await as(
  db,
  rahim,
  `update public.comments set deleted_at = now() where id = '${thirdPartyOwn}'`,
);
check(
  strangerOnOwnPost.ok
    ? (await hidden(db, thirdPartyOwn)).rows[0].n
    : `[${strangerOnOwnPost.error.code}]`,
  0,
  "a commenter on somebody else's post cannot moderate that thread",
);
const staff = await as(
  db,
  sultana,
  `update public.comments set deleted_at = now() where id = '${thirdPartyOwn}'`,
  { bsdc_role: 'moderator', staff: true },
);
check(
  staff.ok ? (await hidden(db, thirdPartyOwn)).rows[0].n : `[${staff.error.code}]`,
  1,
  'staff still delete any comment',
);

// 6. a post the author may not read still hides its comments, hidden or not
const privatePost = (
  await db.query(`insert into public.posts (author_uid, kind, slug, title, body, status, published_at, visibility)
    values ('${rahim}', 'post', 'private-thread', 'Private', 'b', 'published', now(), 'private') returning id`)
).rows[0].id;
const privateComment = await comment(privatePost, rahim, 'private thread comment');
const hiddenPrivate = await as(
  db,
  rahim,
  `update public.comments set deleted_at = now() where id = '${privateComment}'`,
);
check(
  hiddenPrivate.ok ? 1 : `[${hiddenPrivate.error.code}]`,
  1,
  'a private post still trashes its comments',
);
check(await visibleTo(db, ada, privateComment), 0, 'and an outsider cannot read the trashed one');

console.log('');
console.log(`SUMMARY: ${pass} passed, ${bad.length} failed`);
if (bad.length) console.log(`  failed: ${bad.join(', ')}`);
process.exit(bad.length === 0 ? 0 : 1);
