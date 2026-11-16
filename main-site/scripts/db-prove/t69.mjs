// 0103: a skill is found whatever case it was typed in, and stored in one form.
import { makeDb } from './lib.mjs';

let pass = 0;
const bad = [];
function check(condition, label, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`ok    ${label}`);
  } else {
    bad.push(label);
    console.log(`FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

const db = await makeDb();
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('skills-poster', 'skills_poster', 'Skills Poster', 'member', 'active');
  insert into public.jobs (slug, title, company, description, city, skills, status, poster_uid, published_at)
  values ('react-developer-x7k2', 'React developer', 'Dhaka Labs', '', 'Dhaka',
          array['  React ', 'TypeScript', 'react', '', 'Node   JS'], 'open', 'skills-poster', now());
  insert into public.gigs (slug, title, description, budget_min, budget_max, currency, is_hourly,
          skills, status, client_uid)
  values ('landing-page-q1w2e3', 'Landing page', '', 1000, 5000, 'BDT', false,
          array['Figma', 'figma '], 'open', 'skills-poster');
`);

const stored = await db.query(
  `select skills from public.jobs where slug = 'react-developer-x7k2'`,
);
check(
  JSON.stringify(stored.rows[0]?.skills) === JSON.stringify(['node js', 'react', 'typescript']),
  'skills are stored trimmed, lower-cased, de-duplicated and sorted',
  JSON.stringify(stored.rows[0]?.skills ?? null),
);

const gig = await db.query(`select skills from public.gigs where slug = 'landing-page-q1w2e3'`);
check(
  JSON.stringify(gig.rows[0]?.skills) === JSON.stringify(['figma']),
  'gig skills are normalised too',
  JSON.stringify(gig.rows[0]?.skills ?? null),
);

const board = await db.query(
  `select slug from public.job_board(50, null, 'REACT') where slug = 'react-developer-x7k2'`,
);
check(board.rows.length === 1, 'the job is found by its skill whatever the case of the filter');

await db.exec(`update public.jobs set skills = array['Vue ']
               where slug = 'react-developer-x7k2'`);
const updated = await db.query(`select skills from public.jobs where slug = 'react-developer-x7k2'`);
check(
  JSON.stringify(updated.rows[0]?.skills) === JSON.stringify(['vue']),
  'an update to skills is normalised as well',
  JSON.stringify(updated.rows[0]?.skills ?? null),
);

const empty = await db.query(`select bsdc.normalise_skills(array[' ', '']) as s`);
check(
  JSON.stringify(empty.rows[0]?.s) === JSON.stringify([]),
  'blank skills normalise to an empty array, not null',
);

console.log(`\n${pass} checks passed, ${bad.length} failed`);
if (bad.length > 0) process.exit(1);
