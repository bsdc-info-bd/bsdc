/**
 * A project can be corrected, taken down, and shown with more than one picture.
 *
 * `public.projects` has allowed an owner update and an owner delete since 0014,
 * and no screen ever offered either, so a published project was write-once in
 * practice. 0064 adds the gallery the project never had. Prove the whole
 * contract here, as the owner, as a stranger, as staff and as an anonymous
 * visitor — including the two columns a member must not be able to repoint.
 */
import { as, asAnon, expectFail, makeDb, summary } from './lib.mjs';

const owner = 'cccccccc-3333-4333-8333-000000000004';
const stranger = 'cccccccc-3333-4333-8333-000000000005';
const staff = 'cccccccc-3333-4333-8333-000000000006';
const slug = 'meghna-ferry-timetable';

const db = await makeDb();

await db.exec(`
  insert into public.profiles (uid, username, display_name)
  values
    ('${owner}', 'ferrybuilder', 'Ferry Builder'),
    ('${stranger}', 'passerby', 'Passer By'),
    ('${staff}', 'staffmember', 'Staff Member');

  insert into public.projects (
    slug, name, tagline, description, repo_url, demo_url, cover_url,
    tech, license, looking_for_contributors, owner_uid
  ) values (
    '${slug}', 'Meghna Timetable', 'Ferry times, kept current.',
    'The timetable everybody on the Meghna crossing keeps in their pocket.',
    'https://github.com/bsdc-info-bd/meghna', '',
    'https://res.cloudinary.com/bsdc/image/upload/meghna-cover.jpg',
    array['typescript'], 'MIT', false, '${owner}'
  );
`);

// Two screenshots, uploaded by the owner, recorded where every upload is recorded.
const assets = await db.query(`
  insert into public.media_assets (owner_uid, provider, kind, url, thumb_url, width, height, bytes, mime_type)
  values
    ('${owner}', 'cloudinary', 'image', 'https://res.cloudinary.com/bsdc/image/upload/shot-one.jpg', '', 1600, 900, 20480, 'image/jpeg'),
    ('${owner}', 'cloudinary', 'image', 'https://res.cloudinary.com/bsdc/image/upload/shot-two.jpg', '', 1600, 900, 20480, 'image/jpeg')
  returning id
`);
const [shotOne, shotTwo] = assets.rows.map((row) => row.id);

const projectId = (await db.query(`select id from public.projects where slug = '${slug}'`)).rows[0]
  .id;

// ---------------------------------------------------------------- gallery ---
const inserted = await as(
  db,
  owner,
  `insert into public.project_media (project_id, media_id, "position", alt_text)
   values ('${projectId}', '${shotOne}', 0, 'The departure board'),
          ('${projectId}', '${shotTwo}', 1, 'Route map')
   returning "position", alt_text`,
  'the owner can attach screenshots to their own project',
);
if (inserted?.rows.length !== 2) {
  console.log('FAIL  both screenshots were attached', JSON.stringify(inserted?.rows));
  process.exitCode = 1;
}

const readBack = await asAnon(
  db,
  `select m."position", a.url
     from public.project_media m
     join public.media_assets a on a.id = m.media_id
    where m.project_id = '${projectId}'
    order by m."position"`,
  'an anonymous visitor reads the gallery in the author\u2019s order',
);
if (
  readBack?.rows.length !== 2 ||
  readBack.rows[0].url !== 'https://res.cloudinary.com/bsdc/image/upload/shot-one.jpg' ||
  Number(readBack.rows[1].position) !== 1
) {
  console.log('FAIL  the gallery is public and ordered', JSON.stringify(readBack?.rows));
  process.exitCode = 1;
}

await expectFail(
  db,
  stranger,
  `insert into public.project_media (project_id, media_id, "position")
   values ('${projectId}', '${shotOne}', 9)`,
  '42501',
  'a stranger cannot add a picture to somebody else\u2019s project',
);

// RLS hides the row rather than raising: a stranger's DELETE matches nothing,
// so the correct assertion is "no rows went", not "the database refused".
// `expectFail` would have passed on a schema that leaked the row and failed on
// the one that protected it.
const strangerDelete = await as(
  db,
  stranger,
  `delete from public.project_media where project_id = '${projectId}' returning media_id`,
  'a stranger\u2019s delete of somebody else\u2019s gallery matches no row',
);
if (strangerDelete === null || strangerDelete.rows.length !== 0) {
  console.log('FAIL  a stranger removed a picture', JSON.stringify(strangerDelete?.rows));
  process.exitCode = 1;
}

// The two foreign keys are the gallery's integrity. Repointing either one would
// move a picture into a project its uploader does not own.
await expectFail(
  db,
  owner,
  `update public.project_media set media_id = '${shotTwo}'
    where project_id = '${projectId}' and media_id = '${shotOne}'`,
  '42501',
  'the owner cannot repoint a screenshot at a different upload',
);

await expectFail(
  db,
  owner,
  `update public.project_media set project_id = gen_random_uuid()
    where media_id = '${shotTwo}'`,
  '42501',
  'the owner cannot move a screenshot into a different project',
);

// Reordering is allowed: that is the point of granting update at all.
const reordered = await as(
  db,
  owner,
  `update public.project_media set "position" = 5
    where project_id = '${projectId}' and media_id = '${shotTwo}'
   returning "position"`,
  'the owner can reorder and re-caption their own gallery',
);
if (Number(reordered?.rows[0]?.position) !== 5) {
  console.log('FAIL  the reorder took effect', JSON.stringify(reordered?.rows));
  process.exitCode = 1;
}

// --------------------------------------------------------------- correcting ---
const corrected = await as(
  db,
  owner,
  `update public.projects
      set repo_url = 'https://github.com/bsdc-info-bd/meghna-timetable',
          tagline = 'Ferry times, corrected.',
          looking_for_contributors = true
    where slug = '${slug}'
    returning repo_url, tagline, looking_for_contributors`,
  'the owner can correct a published project',
);
if (
  corrected?.rows[0]?.repo_url !== 'https://github.com/bsdc-info-bd/meghna-timetable' ||
  corrected.rows[0]?.looking_for_contributors !== true
) {
  console.log('FAIL  the correction was written', JSON.stringify(corrected?.rows));
  process.exitCode = 1;
}

// Same rule as the delete above: the stranger's UPDATE sees no row, so it
// changes nothing. Assert the row is untouched, which is the claim that matters.
const strangerEdit = await as(
  db,
  stranger,
  `update public.projects set name = 'Not Mine' where slug = '${slug}' returning name`,
  'a stranger\u2019s edit of somebody else\u2019s project matches no row',
);
const nameAfter = await db.query(`select name from public.projects where slug = '${slug}'`);
if (
  strangerEdit === null ||
  strangerEdit.rows.length !== 0 ||
  nameAfter.rows[0]?.name !== 'Meghna Timetable'
) {
  console.log('FAIL  a stranger edited the project', JSON.stringify(nameAfter.rows[0]));
  process.exitCode = 1;
}

// The star counter has been server-owned since 0014; correcting a project must
// not have quietly made it writable.
await expectFail(
  db,
  owner,
  `update public.projects set stars_count = 999 where slug = '${slug}'`,
  '42501',
  'the owner still cannot write the star counter directly',
);

// ------------------------------------------------------------------ cascade ---
const removed = await as(
  db,
  owner,
  `delete from public.projects where slug = '${slug}' returning slug`,
  'the owner can take their own project down',
);
if (removed?.rows.length !== 1) {
  console.log('FAIL  the project was deleted', JSON.stringify(removed?.rows));
  process.exitCode = 1;
}

const orphans = await asAnon(
  db,
  `select count(*)::int as n from public.project_media where project_id = '${projectId}'`,
  'the gallery goes with the project it belonged to',
);
if (orphans?.rows[0]?.n !== 0) {
  console.log('FAIL  screenshots outlived their project', JSON.stringify(orphans?.rows));
  process.exitCode = 1;
}

const uploadsSurvive = await asAnon(
  db,
  `select count(*)::int as n from public.media_assets where id in ('${shotOne}', '${shotTwo}')`,
  'deleting a project does not delete the uploads it pointed at',
);
if (uploadsSurvive?.rows[0]?.n !== 2) {
  console.log(
    'FAIL  the uploads were destroyed with the project',
    JSON.stringify(uploadsSurvive?.rows),
  );
  process.exitCode = 1;
}

// -------------------------------------------------------------------- staff ---
await db.exec(`
  insert into public.projects (slug, name, description, owner_uid)
  values ('staff-target', 'Staff Target', 'A project staff must be able to remove.', '${stranger}');
`);
const staffProjectId = (
  await db.query(`select id from public.projects where slug = 'staff-target'`)
).rows[0].id;

const staffRemove = await as(
  db,
  staff,
  `delete from public.project_media where project_id = '${staffProjectId}' returning project_id`,
  'staff can clear a gallery they do not own',
  { bsdc_role: 'admin', staff: true },
);
if (staffRemove === null) {
  console.log('FAIL  staff could not moderate a gallery');
  process.exitCode = 1;
}

if (summary() > 0) process.exitCode = 1;
await db.close();
