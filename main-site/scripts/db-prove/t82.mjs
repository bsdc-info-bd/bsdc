/**
 * Proof for 0123: a post is saved once, or not at all.
 *
 * A save used to be up to nine requests: the post row, then tags, media, mentions
 * and the poll. Each could fail on its own, and the first one had already
 * published the post — so a member whose picture failed to attach saw an error
 * for a post that existed, without the picture, and often without the tags or the
 * mention notification either.
 *
 * What is asserted here:
 *
 *   1. **One call writes all of it.** The post, its vocabulary tags, its media,
 *      its mentions and its poll, with one return value.
 *   2. **A failure in any part leaves nothing behind.** A media id that does not
 *      exist fails the save and there is no post row afterwards, not even a draft;
 *      a poll whose ballot is locked fails the save and the post keeps the title
 *      it had.
 *   3. **Nothing the client relied on changed.** `published_at` is preserved on an
 *      edit and cleared on a return to draft, an unchanged poll is not rewritten
 *      (its option ids survive, so its votes do), unknown tags and unknown
 *      handles are dropped rather than invented, and two saves of the same title
 *      produce two slugs instead of one error.
 *   4. **The policies still decide.** Another member cannot edit the post through
 *      the function, and an anonymous caller cannot execute it at all.
 */
import { as, check, expectFail, failureCount, makeDb, summary } from './lib.mjs';

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';
const rahim = 'bbbbbbbb-2222-4222-8222-000000000002';
const asset = 'cccccccc-3333-4333-8333-000000000003';

const db = await makeDb();

await db.exec(`
  insert into public.profiles (uid, username, display_name, status) values
    ('${ada}',   'adafirst',    'Ada First',    'active'),
    ('${rahim}', 'rahimsecond', 'Rahim Second', 'active');

  insert into public.tags (slug, label_en, label_bn) values
    ('writing', 'Writing', 'লেখা'),
    ('tips',    'Tips',    'টিপস');

  insert into public.media_assets (id, owner_uid, provider, kind, url, thumb_url, width, height)
    values ('${asset}', '${ada}', 'imgbb', 'image', 'https://i.ibb.co/one.jpg',
            'https://i.ibb.co/one-thumb.jpg', 1200, 800);
`);

const post = (payload) => `jsonb_build_object(
  'kind', '${payload.kind ?? 'post'}',
  'status', '${payload.status ?? 'published'}',
  'visibility', '${payload.visibility ?? 'public'}',
  'title', ${sqlString(payload.title)},
  'body', ${sqlString(payload.body ?? 'Two days in.')},
  'excerpt', ${sqlString(payload.excerpt ?? 'Two days in.')},
  'language', 'en',
  'reading_time', 2
)`;

function sqlString(value) {
  return `$str$${value}$str$`;
}

function save({
  id = 'null',
  payload,
  slug = 'null',
  tags = 'null',
  media = 'null',
  mentions = 'null',
  poll = 'null',
}) {
  return `select public.save_post(
    p_id       => ${id},
    p_post     => ${post(payload)},
    p_slug     => ${slug},
    p_tags     => ${tags},
    p_media    => ${media},
    p_mentions => ${mentions},
    p_poll     => ${poll}
  ) as saved`;
}

// ------------------------------------------------------- one call, all of it ---

const created = await as(
  db,
  ada,
  save({
    payload: { title: 'My first week writing', body: 'Hello @rahimsecond, two days in.' },
    slug: sqlString('my-first-week-writing'),
    tags: `array['writing', 'tips', 'not-a-real-tag']`,
    media: `jsonb_build_array(jsonb_build_object('media_id', '${asset}', 'position', 0, 'alt_text', 'A desk'))`,
    mentions: `array['rahimsecond', 'nobodyhere']`,
    poll: `jsonb_build_array('Neovim', 'VS Code')`,
  }),
  'a member saves a published post with tags, a picture, a mention and a poll',
);
const savedId = created?.rows[0]?.saved?.id;
const savedSlug = created?.rows[0]?.saved?.slug;
check(typeof savedId === 'string' && savedId.length === 36, 'the save returns the new post id');
check(savedSlug === 'my-first-week-writing', 'the save returns the slug it wrote', savedSlug);

const parts = await db.query(`
  select
    (select count(*)::int from public.posts where id = '${savedId}') as posts,
    (select published_at is not null from public.posts where id = '${savedId}') as published,
    (select array_agg(tag_slug::text order by tag_slug) from public.post_tags where post_id = '${savedId}') as tags,
    (select count(*)::int from public.post_media where post_id = '${savedId}') as media,
    (select count(*)::int from public.post_mentions where post_id = '${savedId}') as mentions,
    (select array_agg(label order by "position") from public.poll_options where post_id = '${savedId}') as labels
`);
const row = parts.rows[0];
check(row.posts === 1, 'the post row exists');
check(row.published === true, 'a published post has its publication time');
check(
  JSON.stringify(row.tags) === JSON.stringify(['tips', 'writing']),
  'only words in the vocabulary are attached',
  JSON.stringify(row.tags),
);
check(row.media === 1, 'the picture is attached', String(row.media));
check(row.mentions === 1, 'only handles that exist are mentioned', String(row.mentions));
check(
  JSON.stringify(row.labels) === JSON.stringify(['Neovim', 'VS Code']),
  'the poll options are in the order they were written',
  JSON.stringify(row.labels),
);

// A draft saves without a publication time and without any of the optional
// parts, which is the common save from a composer that was not finished.
const draft = await as(
  db,
  ada,
  save({
    payload: { title: 'Half an idea', status: 'draft' },
    slug: sqlString('half-an-idea'),
    tags: `array[]::text[]`,
    media: `'[]'::jsonb`,
    mentions: `array[]::text[]`,
  }),
  'a member saves a draft with nothing else',
);
const draftId = draft?.rows[0]?.saved?.id;
const draftRow = (
  await db.query(`select published_at, status from public.posts where id = '${draftId}'`)
).rows[0];
check(draftRow?.status === 'draft', 'a draft is a draft');
check(draftRow?.published_at === null, 'a draft has no publication time');
check(
  (await db.query(`select 1 from public.post_tags where post_id = '${draftId}'`)).rows.length === 0,
  'a save with no tags leaves none behind',
);

// ------------------------------------------------- a failure leaves nothing ---

await expectFail(
  db,
  ada,
  save({
    payload: { title: 'A post that should not exist' },
    slug: sqlString('a-post-that-should-not-exist'),
    media: `jsonb_build_array(jsonb_build_object('media_id', '99999999-9999-4999-8999-999999999999'))`,
  }),
  '23503',
  'a picture that was never uploaded fails the save',
);
check(
  (
    await db.query(
      `select count(*)::int as n from public.posts where slug = 'a-post-that-should-not-exist'`,
    )
  ).rows[0].n === 0,
  'the failed save published nothing',
);

// A save that fails after the post row was written must roll the row back too.
// The tag table is the honest place to fail it: an unknown word is dropped, so
// instead fail on the poll, which is written last.
const locked = await as(
  db,
  ada,
  save({
    payload: { title: 'Poll with an audience', kind: 'poll' },
    slug: sqlString('poll-with-an-audience'),
    poll: `jsonb_build_array('Rust', 'Go')`,
  }),
  'a poll post is published',
);
const lockedId = locked?.rows[0]?.saved?.id;
const lockedOptions = (
  await db.query(
    `select id from public.poll_options where post_id = '${lockedId}' order by "position"`,
  )
).rows;
await as(
  db,
  rahim,
  `select public.cast_poll_vote('${lockedId}', '${lockedOptions[0].id}')`,
  'a reader votes on the poll',
);

await expectFail(
  db,
  ada,
  save({
    id: `'${lockedId}'`,
    payload: { title: 'Poll with an audience, reworded', kind: 'poll' },
    poll: `jsonb_build_array('Rust', 'Zig')`,
  }),
  '23514',
  'rewording a poll that has votes fails the save',
);

const afterRefusal = await db.query(`
  select (select title from public.posts where id = '${lockedId}') as title,
         (select array_agg(label order by "position") from public.poll_options where post_id = '${lockedId}') as labels
`);
check(
  afterRefusal.rows[0].title === 'Poll with an audience',
  'the refused save did not change the post title',
  afterRefusal.rows[0].title,
);
check(
  JSON.stringify(afterRefusal.rows[0].labels) === JSON.stringify(['Rust', 'Go']),
  'the refused save left the ballot its options',
  JSON.stringify(afterRefusal.rows[0].labels),
);

// ------------------------------------------------- nothing the client lost ---

const beforeEdit = (
  await db.query(`
    select published_at,
           (select array_agg(id::text order by "position") from public.poll_options where post_id = '${savedId}') as options
      from public.posts where id = '${savedId}'
  `)
).rows[0];
const publishedBefore = beforeEdit.published_at;

await new Promise((resolve) => setTimeout(resolve, 25));

await as(
  db,
  ada,
  save({
    id: `'${savedId}'`,
    payload: { title: 'My first week writing, corrected' },
    poll: `jsonb_build_array('Neovim', 'VS Code')`,
  }),
  'the author edits the title, leaving the poll as it was',
);

const edited = (
  await db.query(`
    select title, published_at,
           (select array_agg(id::text order by "position") from public.poll_options where post_id = '${savedId}') as options
      from public.posts where id = '${savedId}'
  `)
).rows[0];
check(edited.title === 'My first week writing, corrected', 'the edit is saved', edited.title);
check(
  new Date(edited.published_at).getTime() === new Date(publishedBefore).getTime(),
  'editing a published post keeps its publication time',
  `${publishedBefore} -> ${edited.published_at}`,
);
check(
  JSON.stringify(edited.options) === JSON.stringify(beforeEdit.options),
  'the unchanged poll is not rewritten, so its options keep their ids — and their votes',
  `${JSON.stringify(beforeEdit.options)} -> ${JSON.stringify(edited.options)}`,
);

await as(
  db,
  ada,
  save({ id: `'${savedId}'`, payload: { title: 'Back to the drafts', status: 'draft' } }),
  'the author returns the post to draft',
);
check(
  (await db.query(`select published_at from public.posts where id = '${savedId}'`)).rows[0]
    .published_at === null,
  'a post returned to draft loses its publication time',
);

// Two members who save the same title at the same moment get two posts, not one
// error: the second slug is numbered inside the transaction.
const first = await as(
  db,
  ada,
  save({ payload: { title: 'Same title' }, slug: sqlString('same-title') }),
  'the first member saves a title',
);
const second = await as(
  db,
  rahim,
  save({ payload: { title: 'Same title' }, slug: sqlString('same-title') }),
  'a second member saves the same title',
);
check(first?.rows[0]?.saved?.slug === 'same-title', 'the first keeps the slug it asked for');
check(
  second?.rows[0]?.saved?.slug === 'same-title-2',
  'the second gets the next free slug instead of an error',
  second?.rows[0]?.saved?.slug,
);

// ------------------------------------------------------ the policies decide ---

await expectFail(
  db,
  rahim,
  save({ id: `'${savedId}'`, payload: { title: 'Taken over' } }),
  'P0001',
  'another member cannot edit the post',
);
check(
  (await db.query(`select title from public.posts where id = '${savedId}'`)).rows[0].title ===
    'Back to the drafts',
  'the other member changed nothing',
);

// The function is granted to `authenticated` only, so an anonymous caller is
// refused by the grant before any policy is consulted.
try {
  await db.exec(
    `set role anon; select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', false);`,
  );
  await db.query(save({ payload: { title: 'Anonymous' }, slug: sqlString('anonymous-post') }));
  check(false, 'an anonymous caller cannot execute the save', 'the call succeeded');
} catch (e) {
  check(
    e.code === '42501',
    'an anonymous caller cannot execute the save',
    `${e.code} ${e.message}`,
  );
} finally {
  await db.exec('reset role;');
}
check(
  (await db.query(`select count(*)::int as n from public.posts where slug = 'anonymous-post'`))
    .rows[0].n === 0,
  'an anonymous caller published nothing',
);

// -------------------------------------------------------- one call, not nine ---

// The function must be the caller's own transaction, not a way around the
// policies: `security invoker` means every policy and column grant that applied
// to the nine requests applies inside it, and the checks above passed because of
// those policies, not in spite of them.
const shape = (
  await db.query(`
    select p.prosecdef as definer, p.provolatile as volatility, p.proisstrict as strict
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'save_post'
  `)
).rows[0];
check(shape?.definer === false, 'the save runs as the member who called it, not as its owner');
check(shape?.volatility === 'v', 'the save is written, so it is volatile');

if (failureCount() > 0) process.exitCode = 1;
summary();
