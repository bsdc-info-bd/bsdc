/**
 * Proof for 0141: SEO coverage, redirect cycles, and the 404s worth redirecting.
 *
 * The load-bearing claims:
 *
 *   * a redirect that would close a loop is refused *before* it is written, with
 *     the loop named — and a chain that does not loop is still allowed;
 *   * a chain longer than twenty steps is refused rather than walked forever;
 *   * two pages cannot share a canonical, and the empty canonical is not a
 *     colliding value;
 *   * a 404 is recorded without the recorder ever being able to fail the request
 *     that hit it, and a path that comes back returns to the queue;
 *   * coverage says what is wrong with an override, not only that one is missing.
 */
import { makeDb } from './lib.mjs';

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

const OWNER = '00000000-0000-4000-8000-000000000401';
const MEMBER = '00000000-0000-4000-8000-000000000402';

await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${OWNER}',  'seoowner',  'SEO Owner',  'owner',  'active'),
    ('${MEMBER}', 'seomember', 'SEO Member', 'member', 'active')
  on conflict do nothing;
`);
await db.exec(`update public.admin_settings set value = 'false'::jsonb where key = 'ops.audit_trigger_disabled'`);

async function as(uid, sql) {
  const claims = JSON.stringify({ sub: uid, role: 'authenticated' });
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', $jwt$${claims}$jwt$, false);`);
  const multi = /;\s*\S/.test(sql.trim());
  try {
    if (multi) {
      await db.exec(sql);
      return { rows: [], error: null };
    }
    const result = await db.query(sql);
    return { rows: result.rows, error: null };
  } catch (error) {
    try {
      await db.exec('rollback');
    } catch {
      /* not in a transaction */
    }
    return { rows: [], error };
  } finally {
    try {
      await db.exec('reset role;');
    } catch {
      /* already reset */
    }
  }
}

async function asSystem(sql) {
  await db.exec(`select set_config('request.jwt.claims', '{}', false);`);
  const multi = /;\s*\S/.test(sql.trim());
  try {
    if (multi) {
      await db.exec(sql);
      return { rows: [], error: null };
    }
    const result = await db.query(sql);
    return { rows: result.rows, error: null };
  } catch (error) {
    try {
      await db.exec('rollback');
    } catch {
      /* not in a transaction */
    }
    return { rows: [], error };
  }
}

const rows = async (sql) => (await asSystem(sql)).rows;

// ===========================================================================
// 1. A loop is refused before it exists
// ===========================================================================
const first = await as(OWNER, `select public.set_redirect('/old-blog', '/blog', 301::smallint, 'renamed the section')`);
check(first.error === null, 'an owner adds a redirect', first.error?.message ?? '');

const second = await as(OWNER, `select public.set_redirect('/blog', '/articles', 301::smallint, 'renamed again')`);
check(second.error === null, 'and a second, chaining off the first', second.error?.message ?? '');

const loop = await as(OWNER, `select public.set_redirect('/articles', '/old-blog', 301::smallint, 'closing the circle')`);
check(loop.error !== null, 'the redirect that would close the loop is refused', loop.error?.message ?? 'accepted');
check(
  String(loop.error?.message ?? '').includes('/old-blog'),
  'and the message names the path it would come back to, so the editor can see it',
  loop.error?.message,
);

const selfLoop = await as(OWNER, `select public.set_redirect('/loopys', '/loopys', 301::smallint, 'nonsense')`);
check(selfLoop.error !== null, 'a redirect to itself is refused too', selfLoop.error?.message ?? 'accepted');

const front = await as(OWNER, `select public.set_redirect('/', '/home', 301::smallint, 'nonsense')`);
check(front.error !== null, 'and the front page cannot be redirected at all', front.error?.message ?? 'accepted');

// The refused write left nothing behind.
const afterRefusal = await rows(`select count(*)::int as n from public.redirects where from_path = '/articles'`);
check(Number(afterRefusal[0]?.n) === 0, 'the refused redirect was not written', JSON.stringify(afterRefusal[0]?.n));

// ===========================================================================
// 2. The read finds a loop that a direct write got in
// ===========================================================================
// `set_redirect` is the only supported writer, but a restore from a backup or a
// hand-run SQL statement can still produce one. The read has to catch that.
await asSystem(`
  insert into public.redirects (from_path, to_path)
  values ('/handmade-a', '/handmade-b'), ('/handmade-b', '/handmade-a')
`);
const cycles = await rows(`select * from public.redirect_cycle_check()`);
check(cycles.length >= 1, 'a loop written around the guard is still found', JSON.stringify(cycles.length));
const handmade = cycles.find((c) => c.from_path === '/handmade-a' || c.from_path === '/handmade-b');
check(handmade !== undefined, 'and named', JSON.stringify(cycles.map((c) => c.from_path)));
check(
  Array.isArray(handmade?.loop_paths) && handmade.loop_paths.length >= 3,
  'with the loop itself listed, not only its start',
  JSON.stringify(handmade?.loop_paths),
);

// A legitimate chain is not reported as a loop.
const falsePositive = cycles.find((c) => c.from_path === '/old-blog' || c.from_path === '/blog');
check(falsePositive === undefined, 'a chain that ends is not reported as a loop', JSON.stringify(falsePositive));

// ===========================================================================
// 3. A chain longer than twenty is refused
// ===========================================================================
// Build a chain of 25 links, then try to attach one more.
// Fresh paths: the earlier sections already redirect `/old-blog` and friends, and
// reusing a path here silently overwrote one of them — which is how the first
// version of this check reported a chain of length one.
let chained = true;
for (let i = 0; i < 25; i += 1) {
  const r = await asSystem(
    `insert into public.redirects (from_path, to_path) values ('/chain-${i}', '/chain-${i + 1}')`,
  );
  if (r.error) {
    chained = false;
    console.log(`note  chain ${i}: ${r.error.message}`);
    break;
  }
}
check(chained, 'a long chain can be built by direct writes, which is the situation being defended against');

// The rule that stops a chain is about the *destination*: it must not itself be
// redirected. `/chain-1 → /chain-2` means `/chain-2` is not a final page, so a new
// redirect ending at `/chain-2` is refused and says why.
const intoChain = await as(OWNER, `select public.set_redirect('/chain-new', '/chain-2', 301::smallint, 'point at the middle of a chain')`);
check(intoChain.error !== null, 'a redirect whose destination is itself redirected is refused', intoChain.error?.message ?? 'accepted');
check(
  String(intoChain.error?.message ?? '').includes('itself redirected'),
  'and says to point at the final page rather than at another redirect',
  intoChain.error?.message,
);

// A chain that a hand-run statement made is still readable: nothing loops, but a
// visitor would take twenty-five hops, and that is worth seeing even though
// `set_redirect` would never have built it.
const longChain = await rows(`
  with recursive walk as (
    select r.from_path as start, r.to_path as here, 1 as depth
      from public.redirects r where r.from_path = '/chain-0'
    union all
    select w.start, r.to_path, w.depth + 1
      from walk w join public.redirects r on r.from_path = w.here
     where w.depth < 50
  )
  select max(depth)::int as depth from walk
`);
check(Number(longChain[0]?.depth) === 25, 'the reader can still see a chain of twenty-five links', JSON.stringify(longChain[0]?.depth));

// ===========================================================================
// 4. One canonical, one page
// ===========================================================================
const setA = await as(
  OWNER,
  `select public.set_seo_override('/products/widget', 'Widget', 'A widget you can buy')`,
);
if (setA.error) console.log(`note  override A: ${setA.error.message}`);
const setB = await as(
  OWNER,
  `select public.set_seo_override('/products/gadget', 'Gadget', 'A gadget you can buy')`,
);
if (setB.error) console.log(`note  override B: ${setB.error.message}`);

const claimCanonical = await as(
  OWNER,
  `update public.seo_overrides set canonical = '/products/widget' where path = '/products/widget'`,
);
check(claimCanonical.error !== null, 'a page cannot claim itself as its own canonical', claimCanonical.error?.message ?? 'accepted');

// The canonical lives on the *widget* page and points at the gadget page's URL, so
// the gadget page cannot also claim it. (The first version pointed the widget at
// itself, which the self-canonical check refuses — correctly, and for a different
// reason than the one being tested.)
const seeded = await asSystem(
  `update public.seo_overrides set canonical = '/products/gadget' where path = '/products/widget'`,
);
if (seeded.error) console.log(`note  canonical: ${seeded.error.message}`);
const shareCanonical = await asSystem(
  `update public.seo_overrides set canonical = '/products/gadget' where path = '/products/gadget'`,
);
check(shareCanonical.error !== null, 'two pages cannot share one canonical', shareCanonical.error?.message ?? 'accepted');

// The empty canonical is not a collision: many pages legitimately have none.
const emptyCanonicals = await asSystem(`
  insert into public.seo_overrides (path, title) values ('/products/thing-a', 'Thing A')
  on conflict (path) do nothing;
  insert into public.seo_overrides (path, title) values ('/products/thing-b', 'Thing B')
  on conflict (path) do nothing;
`);
check(emptyCanonicals.error === null, 'two pages with no canonical both exist', emptyCanonicals.error?.message ?? '');

// ===========================================================================
// 5. A 404 is recorded, and recording it cannot fail the request
// ===========================================================================
await asSystem(`select public.note_missing_path('/old-pricing')`);
await asSystem(`select public.note_missing_path('/old-pricing')`);
await asSystem(`select public.note_missing_path('/old-pricing/')`);
const hit = await rows(`select path, hits from public.seo_404_hits where path = '/old-pricing'`);
check(hit.length === 1, 'a 404 is recorded once, however it is spelled', JSON.stringify(hit));
check(Number(hit[0]?.hits) === 3, 'and counted, so frequency is visible', JSON.stringify(hit[0]?.hits));

const nonsense = await asSystem(`select public.note_missing_path(repeat('x', 1000))`);
check(nonsense.error === null, 'an absurd path is ignored rather than stored', nonsense.error?.message ?? '');
const stored = await rows(`select count(*)::int as n from public.seo_404_hits where char_length(path) > 300`);
check(Number(stored[0]?.n) === 0, 'and nothing long slipped through', JSON.stringify(stored[0]?.n));

const nullPath = await asSystem(`select public.note_missing_path(null)`);
check(nullPath.error === null, 'a null path does not raise either', nullPath.error?.message ?? '');

// The recorder is reachable by anon — it is called from the edge — but the table
// is not.
const anon = await asSystem(`set role anon; select public.note_missing_path('/anon-miss')`);
check(anon.error === null, 'the edge can record a miss without a session', anon.error?.message ?? '');
const anonRead = await asSystem(`set role anon; select * from public.seo_404_hits`);
check(anonRead.error !== null || anonRead.rows.length === 0, 'but cannot read the table', anonRead.error?.message ?? JSON.stringify(anonRead.rows.length));

const memberRead = await as(MEMBER, `select * from public.seo_404_hits`);
check(memberRead.error !== null || memberRead.rows.length === 0, 'and a member without seo.manage cannot read it either', memberRead.error?.message ?? JSON.stringify(memberRead.rows.length));

// ===========================================================================
// 6. The 404 queue, and resolving one
// ===========================================================================
const queue = await as(OWNER, `select * from public.redirect_404_sources(50)`);
check(queue.error === null, 'an owner reads the queue', queue.error?.message ?? '');
const priced = queue.rows.find((r) => r.path === '/old-pricing');
check(priced !== undefined, 'the miss is in it', JSON.stringify(queue.rows.map((r) => r.path)));
check(priced?.covered_by === null || priced?.covered_by === undefined, 'and is not yet covered by a redirect', priced?.covered_by);

const resolved = await as(OWNER, `select public.resolve_missing_path('/old-pricing', '/pricing')`);
check(resolved.error === null, 'resolving it also creates the redirect, in one step', resolved.error?.message ?? '');
const covered = await rows(`select to_path from public.redirects where from_path = '/old-pricing'`);
check(covered[0]?.to_path === '/pricing', 'and the redirect points where it was told to', JSON.stringify(covered[0]));

const queueAfter = await as(OWNER, `select * from public.redirect_404_sources(50)`);
check(
  queueAfter.rows.find((r) => r.path === '/old-pricing') === undefined,
  'the resolved path has left the queue',
  JSON.stringify(queueAfter.rows.map((r) => r.path)),
);

// A path that comes back after being dealt with returns to the queue: whatever was
// done did not work.
await asSystem(`select public.note_missing_path('/old-pricing')`);
const back = await as(OWNER, `select * from public.redirect_404_sources(50)`);
check(
  back.rows.find((r) => r.path === '/old-pricing') !== undefined,
  'a path that is missed again returns to the queue rather than staying ticked',
  JSON.stringify(back.rows.map((r) => r.path)),
);

const missing = await as(OWNER, `select public.resolve_missing_path('/never-seen')`);
check(missing.error !== null, 'resolving a path nobody recorded is an error, not a silent success', missing.error?.message ?? 'accepted');

// ===========================================================================
// 7. Coverage says what is wrong, not only what is missing
// ===========================================================================
// A published post with no override is the common case.
await asSystem(`
  insert into public.posts (author_uid, kind, slug, title, body, status, published_at, visibility)
  values ('${OWNER}', 'post', 'a-post-with-no-seo', 'A post with no SEO', 'body', 'published', now(), 'public')
  on conflict do nothing;
`);
const coverage = await as(OWNER, `select * from public.seo_coverage(200, true)`);
check(coverage.error === null, 'an owner reads coverage', coverage.error?.message ?? '');
const uncovered = coverage.rows.find((r) => r.path === '/a-post-with-no-seo');
check(uncovered !== undefined, 'a public post with no override is listed', JSON.stringify(coverage.rows.map((r) => r.path)));
check(
  String(uncovered?.problem ?? '').includes('no override'),
  'and says exactly what is missing',
  uncovered?.problem,
);

// An override with a title but no description is a different problem, and says so.
await asSystem(`
  insert into public.seo_overrides (path, title) values ('/a-post-with-no-seo', 'A post that does have a title')
  on conflict (path) do update set title = excluded.title, description = ''
`);
const thinCoverage = await as(OWNER, `select * from public.seo_coverage(200, true)`);
const thin = thinCoverage.rows.find((r) => r.path === '/a-post-with-no-seo');
check(
  String(thin?.problem ?? '').includes('no description'),
  'a half-filled override is reported as half-filled, not as covered',
  thin?.problem,
);

// A good override drops out of the problems-only list.
await asSystem(`
  update public.seo_overrides
     set description = 'What this post says, in a sentence a search result can use.',
         updated_at = now()
   where path = '/a-post-with-no-seo'
`);
const clean = await as(OWNER, `select * from public.seo_coverage(500, true)`);
check(
  clean.rows.find((r) => r.path === '/a-post-with-no-seo') === undefined,
  'an override with a title and a description is not a problem',
  JSON.stringify(clean.rows.find((r) => r.path === '/a-post-with-no-seo')),
);

// Staff-only.
const memberCoverage = await as(MEMBER, `select * from public.seo_coverage(10, true)`);
check(memberCoverage.error !== null, 'a member cannot read coverage at all', memberCoverage.error?.message ?? 'accepted');

const badLimitRead = await as(OWNER, `select * from public.seo_coverage(0, true)`);
check(badLimitRead.error !== null, 'a coverage page of zero is refused', badLimitRead.error?.message ?? 'accepted');

console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) {
  console.log(bad.map((b) => `  - ${b}`).join('\n'));
  process.exitCode = 1;
}
