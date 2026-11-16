/**
 * A private page is not a page for crawlers.
 *
 * Two lists decided which pages an index may hold. robots.txt carried fourteen
 * Disallow prefixes; the default branch of `public.seo_for_path` noindexed six
 * of them. Everything in the first list but not the second was served to a
 * crawler as `index,follow` — and was Disallowed at the same time, so the
 * crawler could never fetch it to learn otherwise. That combination is the one
 * guaranteed to leave a bare, contentless URL in a search index.
 *
 * So this harness does not restate either list. It reads the JSON that robots.txt
 * and the browser-side engine are built from, and asks the database the same
 * question about every entry in it. Adding a private area to one list and
 * forgetting the other now fails here, which is the only reason the two can be
 * allowed to live in two places at all.
 *
 * It also proves the two ways this rule goes wrong by accident: a prefix that
 * matches more than it names, and an editor pattern that swallows a permalink.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { asAnon, makeDb, summary } from './lib.mjs';

const routesFile = fileURLToPath(new URL('../../src/lib/seo/static-routes.json', import.meta.url));
const { disallow } = JSON.parse(readFileSync(routesFile, 'utf8'));

const owner = 'cccccccc-3333-4333-8333-000000000007';
const db = await makeDb();

await db.exec(`
  insert into public.profiles (uid, username, display_name)
  values ('${owner}', 'twobuilds', 'Two Builds');

  insert into public.projects (slug, name, tagline, description, owner_uid) values
    ('padma-river-monitor', 'Padma Monitor', 'River levels, measured openly.',
     'An open source river-level monitor built for the Padma and the people who live beside it.',
     '${owner}'),
    ('edit', 'Edit', 'A project whose slug is the word edit.',
     'Published to prove that a permalink and an editor are not the same shape of path.',
     '${owner}');
`);

let checks = 0;

/** Asks the database what a crawler is told, once, and says whether it is right. */
async function expectRobots(path, wanted, pass, fail) {
  const row = await asAnon(
    db,
    `select robots from public.seo_for_path('${path}')`,
    `seo_for_path('${path}') answers a crawler`,
  );
  const found = row?.rows[0]?.robots ?? 'NO-ROW';
  checks += 1;
  if (found === wanted) {
    console.log(`ok    ${pass}`);
  } else {
    console.log(`FAIL  ${fail} — answered ${found}, wanted ${wanted}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// every entry the robots.txt list names is refused by the database too
// ---------------------------------------------------------------------------
for (const entry of disallow) {
  const path = entry.includes('*') ? entry.split('*').join('sample') : entry;

  await expectRobots(
    path,
    'noindex',
    `${path} is noindexed, as robots.txt already promised`,
    `${path} is served to a crawler as indexable while robots.txt disallows it`,
  );

  if (entry.includes('*')) {
    // The same witness one segment short. This is the case a careless pattern
    // gets wrong: `/projects/edit` is a project a member published, and only
    // `/projects/edit/edit` is that project's editor.
    const shorter = `/${path.split('/').filter(Boolean).slice(1).join('/')}`;
    await expectRobots(
      shorter,
      'index',
      `${shorter} stays crawlable, because an editor is always one segment below a permalink`,
      `${shorter} was swallowed by the editor pattern`,
    );
  } else {
    await expectRobots(
      `${path}/deeper/page`,
      'noindex',
      `${path}/deeper/page is noindexed, so a private area cannot be reached around`,
      `${path}/deeper/page escaped the prefix rule`,
    );
  }
}

// ---------------------------------------------------------------------------
// a permalink stays crawlable and its editor does not
// ---------------------------------------------------------------------------
await expectRobots(
  '/projects/padma-river-monitor',
  'index',
  'the project permalink a sitemap exists to advertise is still indexable',
  'the project permalink was made private by the editor rule',
);
await expectRobots(
  '/projects/padma-river-monitor/edit',
  'noindex',
  'the owner editor for that project is noindexed',
  'the owner editor was served as a second, empty, indexable copy of the permalink',
);
await expectRobots(
  '/projects/edit',
  'index',
  'a project slugged `edit` keeps its crawlable permalink',
  'a project slugged `edit` lost its permalink to the editor pattern',
);
await expectRobots(
  '/projects/edit/edit',
  'noindex',
  'and that project still has an editor nothing indexes',
  'that project editor was indexable',
);

// ---------------------------------------------------------------------------
// private, archived, and unpublished records never leak metadata in seo_for_path
// ---------------------------------------------------------------------------
await db.exec(`
  insert into public.profiles (uid, username, display_name, bio, avatar_url, status, privacy) values
    ('dddddddd-4444-4444-8444-000000000008', 'hidden_dev', 'Hidden Dev', 'Secret bio text',
     'https://i.ibb.co/secret/avatar.webp', 'active', '{"discoverable": false}'::jsonb);

  insert into public.groups (slug, name, description, privacy, owner_uid, cover_url) values
    ('secret-guild', 'Secret Guild Name', 'Internal group description', 'private',
     '${owner}', 'https://i.ibb.co/secret/cover.webp');

  insert into public.shops (id, slug, name, owner_uid, status) values
    ('eeeeeeee-5555-4555-8555-000000000001', 'open-shop', 'Open Shop', '${owner}', 'active');

  insert into public.products (shop_id, slug, title, summary, description, price, status, images) values
    ('eeeeeeee-5555-4555-8555-000000000001', 'draft-widget', 'Unreleased Draft Widget',
     'Unreleased draft summary', 'Unreleased description', 1000, 'draft',
     array['https://i.ibb.co/secret/widget.webp']);

  insert into public.courses (slug, title, summary, description, cover_url, instructor_uid, status) values
    ('draft-course', 'Secret Course Title', 'Draft course summary', 'Draft syllabus',
     'https://i.ibb.co/secret/course.webp', '${owner}', 'draft');
`);

for (const [path, secret] of [
  ['/@hidden_dev', 'Hidden Dev'],
  ['/g/secret-guild', 'Secret Guild Name'],
  ['/shop/draft-widget', 'Unreleased Draft Widget'],
  ['/learn/draft-course', 'Secret Course Title'],
]) {
  const row = await asAnon(
    db,
    `select title, description, image_url, robots from public.seo_for_path('${path}')`,
    `seo_for_path('${path}') redacts non-public metadata`,
  );
  const entry = row?.rows[0];
  checks += 1;
  const leaked =
    !entry ||
    entry.robots !== 'noindex' ||
    String(entry.title).includes(secret) ||
    String(entry.image_url).includes('i.ibb.co/secret');
  if (!leaked) {
    console.log(`ok    ${path} is noindexed and redacts non-public title and image`);
  } else {
    console.log(`FAIL  ${path} leaked private metadata: ${JSON.stringify(entry)}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// a prefix names an area, not every word beginning with those letters
// ---------------------------------------------------------------------------
for (const path of ['/author/raha', '/authentic-tools', '/createbridge', '/cartography']) {
  await expectRobots(
    path,
    'index',
    `${path} is indexable, because the prefix rule is anchored to a segment`,
    `${path} was noindexed by a prefix that only meant to name an area`,
  );
}

// ---------------------------------------------------------------------------
// public content keeps its place in an index
// ---------------------------------------------------------------------------
for (const path of ['/', '/projects', '/shop', '/learn', '/jobs', '/about']) {
  await expectRobots(path, 'index', `${path} stays indexable`, `${path} was made private`);
}

// ---------------------------------------------------------------------------
// the sitemap advertises permalinks and never an editor
// ---------------------------------------------------------------------------
const urls = await asAnon(
  db,
  `select loc from public.sitemap_urls('projects', 1, 1000)`,
  'an anonymous crawler can list the projects',
);
const rows = urls?.rows ?? [];
const malformed = rows.filter(
  (row) => !/^\/projects\/[a-z0-9][a-z0-9-]{2,119}$/.test(String(row.loc)),
);
checks += 1;
if (rows.length === 2 && malformed.length === 0) {
  console.log('ok    the live sitemap lists both projects as permalinks and no editor');
} else {
  console.log(
    `FAIL  the sitemap advertised something that is not a permalink — ${JSON.stringify(rows)}`,
  );
  process.exitCode = 1;
}

console.log(`\n${checks} checks against the list the crawler actually receives`);
if (summary() > 0) process.exitCode = 1;
await db.close();
