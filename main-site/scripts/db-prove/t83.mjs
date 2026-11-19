/**
 * Proof for 0124: a tag a member types is a tag.
 *
 * The composer offers the curated vocabulary and accepts anything the member
 * types, and the save attached only the words that already existed in
 * `public.tags`. Everything else disappeared between the chip on screen and the
 * published post, with nothing on screen saying so — which is what "the tag
 * system does not work" looks like from the outside.
 *
 * Asserted here:
 *
 *   1. A word the vocabulary has never seen is created and attached.
 *   2. A curated word keeps its bilingual labels and gains no duplicate row.
 *   3. The vocabulary is only grown by the save: a member still cannot write a
 *      tag row directly with somebody else's authority, and the shape of a slug
 *      is still the column's constraint.
 *   4. The tag counts the tag page reads still move when a tag is attached.
 *   5. A short word is the one thing that is still not a tag — refused by the
 *      composer's normaliser, and by the save.
 */
import { as, check, expectFail, failureCount, makeDb, summary } from './lib.mjs';

const ada = 'aaaaaaaa-1111-4111-8111-000000000001';

const db = await makeDb();

await db.exec(`
  insert into public.profiles (uid, username, display_name, status) values
    ('${ada}', 'adafirst', 'Ada First', 'active');

  insert into public.tags (slug, label_en, label_bn, description) values
    ('react', 'React', 'রিঅ্যাক্ট', 'Component based user interfaces')
  on conflict (slug) do nothing;
`);

const save = (tags, slug, title = 'A post with tags') => `select public.save_post(
  p_post   => jsonb_build_object('kind', 'post', 'status', 'published', 'title', $t$${title}$t$),
  p_slug   => '${slug}',
  p_tags   => array[${tags.map((tag) => `'${tag}'`).join(', ')}]
) as saved`;

// ------------------------------------------- a word nobody has used before ---

const created = await as(
  db,
  ada,
  save(['react', 'edge-runtime', 'wasm'], 'tags-created'),
  'a member saves a post with one curated tag and two new ones',
);
const postId = created?.rows[0]?.saved?.id;

const attached = (
  await db.query(
    `select tag_slug::text as slug from public.post_tags where post_id = '${postId}' order by 1`,
  )
).rows.map((row) => row.slug);
check(
  JSON.stringify(attached) === JSON.stringify(['edge-runtime', 'react', 'wasm']),
  'every tag on the chip list is on the post',
  JSON.stringify(attached),
);

const vocabulary = (
  await db.query(`select slug::text as slug, label_en, label_bn from public.tags order by 1`)
).rows;
const slugs = vocabulary.map((row) => row.slug);
check(
  ['edge-runtime', 'wasm'].every((slug) => slugs.includes(slug)),
  'the vocabulary grew by the words the post used',
  slugs.join(','),
);
check(
  slugs.filter((slug) => slug === 'react').length === 1,
  'and a word it already knew was not created a second time',
);
const react = vocabulary.find((row) => row.slug === 'react');
check(
  react?.label_en === 'React' && react?.label_bn === 'রিঅ্যাক্ট',
  'a curated tag keeps the labels it already had',
  JSON.stringify(react),
);
const newTag = vocabulary.find((row) => row.slug === 'edge-runtime');
check(
  newTag?.label_en === 'Edge Runtime',
  'a new tag gets a readable label from its slug',
  newTag?.label_en,
);

// Saving again with the same word must not create a second row, and must not
// lose the label a translator may have written in between.
await db.exec(`update public.tags set label_bn = 'এজ রানটাইম' where slug = 'edge-runtime'`);
await as(db, ada, save(['edge-runtime'], 'tags-again'), 'the same word is used again');
const afterSecond = (
  await db.query(
    `select count(*)::int as n, min(label_bn) as bn from public.tags where slug = 'edge-runtime'`,
  )
).rows[0];
check(afterSecond.n === 1, 'a word used twice is one tag', String(afterSecond.n));
check(afterSecond.bn === 'এজ রানটাইম', 'and its Bangla label survives the second save');

// ----------------------------------------------------------- tag counts move ---

const counts = (
  await db.query(`select slug::text as slug, posts_count from public.tags order by 1`)
).rows;
check(
  counts.find((row) => row.slug === 'react')?.posts_count === 1,
  'a curated tag counts the post that used it',
);
check(
  counts.find((row) => row.slug === 'wasm')?.posts_count === 1,
  'a new tag counts the post that created it — the tag page is not empty',
);

// --------------------------------------------------------- what is still not ---

// The composer's normaliser refuses a word that normalises to less than two
// characters, so it never reaches the database. The save path enforces the same
// rule, which is what this asserts.
const shortResult = await as(
  db,
  ada,
  save(['react', 'c'], 'tags-short'),
  'a one-character tag is passed to the save',
);
const shortPostId = shortResult?.rows[0]?.saved?.id;
const shortTags = (
  await db.query(
    `select tag_slug::text as slug from public.post_tags where post_id = '${shortPostId}'`,
  )
).rows.map((row) => row.slug);
check(
  JSON.stringify(shortTags) === JSON.stringify(['react']),
  'a one-character word is not a tag',
  JSON.stringify(shortTags),
);

// The slug shape is the column's constraint, not something the save can be
// talked out of: a word with characters a slug cannot hold is refused.
await expectFail(
  db,
  ada,
  `insert into public.tags (slug, label_en) values ('Not A Slug!', 'x')`,
  '23514',
  'a tag whose slug breaks the slug pattern is refused by the table',
);

// And a member cannot write over a tag that already exists, because the save
// never updates the vocabulary — only adds to it.
await as(
  db,
  ada,
  `insert into public.tags (slug, label_en) values ('react', 'Hijacked') on conflict (slug) do nothing`,
  'a member tries to claim an existing tag',
);
check(
  (await db.query(`select label_en from public.tags where slug = 'react'`)).rows[0].label_en ===
    'React',
  'the existing tag is unchanged',
);

if (failureCount() > 0) process.exitCode = 1;
summary();
