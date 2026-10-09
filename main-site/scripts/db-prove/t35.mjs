/**
 * A published project has its own crawlable, searchable permalink.
 *
 * The project directory used to be the only landing page; a newly published
 * project went back to `/projects`, every search hit led there, and crawlers
 * never received per-project metadata or URLs. Prove the 0063 database
 * contract: anonymous SEO middleware can describe a project, its URL is present
 * in the live sitemap, and the section index advertises the right count.
 */
import { asAnon, makeDb, summary } from './lib.mjs';

const owner = 'cccccccc-3333-4333-8333-000000000003';
const slug = 'padma-river-monitor';
const path = `/projects/${slug}`;
const db = await makeDb();

await db.exec(`
  insert into public.profiles (uid, username, display_name)
  values ('${owner}', 'projectbuilder', 'Project Builder');

  insert into public.projects (
    slug, name, tagline, description, repo_url, demo_url, cover_url,
    tech, license, looking_for_contributors, owner_uid
  ) values (
    '${slug}', 'Padma Monitor', 'River levels, measured openly.',
    'An open source river-level monitor built for the Padma and the people who live beside it.',
    'https://github.com/bsdc-info-bd/padma-monitor', '',
    'https://res.cloudinary.com/bsdc/image/upload/padma-cover.jpg',
    array['rust', 'postgres'], 'Apache-2.0', true, '${owner}'
  );
`);

const seo = await asAnon(
  db,
  `select title, description, image_url, canonical, robots, source
     from public.seo_for_path('${path}')`,
  'anonymous edge SEO receives project-specific metadata',
);
if (
  seo?.rows[0]?.title === 'Padma Monitor — BSDC Projects' &&
  seo.rows[0]?.description === 'River levels, measured openly.' &&
  seo.rows[0]?.image_url === 'https://res.cloudinary.com/bsdc/image/upload/padma-cover.jpg' &&
  seo.rows[0]?.canonical === path &&
  seo.rows[0]?.robots === 'index' &&
  seo.rows[0]?.source === 'project'
) {
  console.log('ok    the project SEO row has its title, summary, cover, canonical and index rule');
} else {
  console.log('FAIL  project SEO row is complete and crawlable', JSON.stringify(seo?.rows[0]));
  process.exitCode = 1;
}

const urls = await asAnon(
  db,
  `select loc, priority from public.sitemap_urls('projects', 1, 1000)`,
  'anonymous sitemap can list public projects',
);
if (
  urls?.rows.length === 1 &&
  urls.rows[0]?.loc === path &&
  Number(urls.rows[0]?.priority) === 0.7
) {
  console.log('ok    the live project sitemap contains the canonical permalink');
} else {
  console.log(
    'FAIL  project permalink is missing from the live sitemap',
    JSON.stringify(urls?.rows),
  );
  process.exitCode = 1;
}

const section = await asAnon(
  db,
  `select urls, pages from public.sitemap_sections(1000) where section = 'projects'`,
  'anonymous sitemap index advertises the projects section',
);
if (section?.rows[0]?.urls === 1 && section.rows[0]?.pages === 1) {
  console.log('ok    sitemap index reports the exact project URL count');
} else {
  console.log('FAIL  project sitemap section count is wrong', JSON.stringify(section?.rows));
  process.exitCode = 1;
}

if (summary() > 0) process.exitCode = 1;
await db.close();
