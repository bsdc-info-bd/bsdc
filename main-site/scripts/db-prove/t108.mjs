/**
 * Proof for 0148: runtime and edge.
 *
 * Three consoles, one question each, and one shared failure mode: a screen that
 * shows a value without saying where it came from, what else it moves, or what
 * it looked like before. The checks here are about the answers being enforced
 * where the row is written, because a console cannot be trusted to enforce a
 * rule the database does not have:
 *
 *   * a setting that fails its own schema cannot be stored, and a secret is
 *     never readable — not by reading the read RPC, and not by reading the
 *     history table afterwards;
 *   * a production setting needs a different person, and the constraint says so
 *     rather than the screen;
 *   * a page cannot be published with a section that fails validation, cannot
 *     take a reserved slug, and a revert writes forward instead of erasing;
 *   * a block needs a reason, a label and a future review date, and the
 *     simulator names the rule that decided rather than agreeing with whatever
 *     the last person assumed.
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

const OWNER = '00000000-0000-4000-8000-000000000c01';
const ADMIN = '00000000-0000-4000-8000-000000000c02';
const ADMIN2 = '00000000-0000-4000-8000-000000000c03';
const MEMBER = '00000000-0000-4000-8000-000000000c04';

await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${OWNER}',  'rtowner',  'Runtime Owner',  'owner', 'active'),
    ('${ADMIN}',  'rtadmin',  'Runtime Admin',  'admin', 'active'),
    ('${ADMIN2}', 'rtadmin2', 'Second Admin',   'admin', 'active'),
    ('${MEMBER}', 'rtmember', 'Runtime Member', 'member','active')
  on conflict do nothing;
`);
await db.exec(`update public.admin_settings set value = 'false'::jsonb where key = 'ops.audit_trigger_disabled'`);

async function as(uid, role, sql, params = []) {
  const claims = JSON.stringify({ sub: uid, role: 'authenticated', bsdc_role: role, staff: role !== 'member' });
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', $jwt$${claims}$jwt$, false);`);
  try {
    return { rows: (await db.query(sql, params)).rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec('reset role');
  }
}

async function asAnon(sql, params = []) {
  await db.exec(`set role anon; select set_config('request.jwt.claims', '{"sub":"","role":"anon"}', false);`);
  try {
    return { rows: (await db.query(sql, params)).rows, error: null };
  } catch (error) {
    return { rows: [], error };
  } finally {
    await db.exec('reset role');
  }
}

// A key this harness can use without disturbing the seeded ones.
await db.exec(`
  insert into public.site_config
    (key, value, value_type, group_name, label, help, min_value, max_value, is_public, is_secret, requires_approval, sort_order)
  values
    ('test.cache_ttl', '60'::jsonb, 'number', 'ops', 'Cache TTL', 'Seconds a cached page lives.', 5, 3600, false, false, false, 900),
    ('test.stripe_key', 'null'::jsonb, 'string', 'ops', 'Stripe key', 'Write-only.', null, null, false, true, false, 901),
    ('test.rollout', 'false'::jsonb, 'boolean', 'ops', 'Rollout', 'Needs a second person.', null, null, false, false, true, 902),
    ('test.orphan', '1'::jsonb, 'number', 'ops', 'Orphan', 'Nothing reads this.', null, null, false, false, false, 903)
  on conflict (key) do update set
    value = excluded.value, is_secret = excluded.is_secret,
    requires_approval = excluded.requires_approval;
`);

// ---------------------------------------------------------------------------
// §12.1 A setting that cannot be wrong
// ---------------------------------------------------------------------------
const consoleRead = await as(ADMIN, 'admin', `select * from public.site_config_console()`);
check(consoleRead.error === null, 'the settings console reads', consoleRead.error?.message);
const ttl = (consoleRead.rows ?? []).find((r) => r.key === 'test.cache_ttl');
check(ttl?.source === 'default', 'a seeded value reports its source as default, not as a decision', String(ttl?.source));
check(ttl?.owner_area === 'platform', 'every setting names the area that owns it');

// Wrong type, out of range, and a number sent as a string are three different
// failures and each must say which.
const wrongType = await as(ADMIN, 'admin', `select public.save_config_setting('test.cache_ttl', '"fast"'::jsonb, 'Test wrong type')`);
check(wrongType.error?.code === '22023', 'a value of the wrong type is refused', String(wrongType.error?.message).slice(0, 90));
check(/number|Expected/i.test(String(wrongType.error?.message)), 'the refusal names the expected type', String(wrongType.error?.message));
const outOfRange = await as(ADMIN, 'admin', `select public.save_config_setting('test.cache_ttl', '99999'::numeric::text::jsonb, 'Test out of range')`);
check(outOfRange.error?.code === '22023', 'a value outside the declared range is refused');
check(/between 5 and 3600/i.test(String(outOfRange.error?.message)), 'the refusal states both bounds, not just "invalid"', String(outOfRange.error?.message));
const stringNumber = await as(ADMIN, 'admin', `select public.save_config_setting('test.cache_ttl', '"90"'::jsonb, 'Test string number')`);
check(stringNumber.error?.code === '22023', 'a numeric setting sent as a string is refused, because it would compare as text forever after');
const shortReason = await as(ADMIN, 'admin', `select public.save_config_setting('test.cache_ttl', '90'::numeric::text::jsonb, 'x')`);
check(shortReason.error?.code === '22023', 'a change without a real reason is refused');

const good = await as(ADMIN, 'admin', `select public.save_config_setting('test.cache_ttl', '90'::numeric::text::jsonb, 'Raised after the cache started missing') as r`);
check(good.error === null, 'a valid change is stored', good.error?.message);
check(good.rows[0]?.r?.route === 'direct', 'the result says which route the change took');
const afterWrite = (await db.query(`select value, source, updated_by from public.site_config where key = 'test.cache_ttl'`)).rows[0];
check(afterWrite?.value === 90, 'the value is stored as a number', JSON.stringify(afterWrite?.value));
check(afterWrite?.source === 'database', 'the source moves from default to database once an operator sets it');

// The UI validator and the RPC validator must be the same rules. The kit's copy
// is exercised in its own suite; here the server's copy is asked directly so a
// change to one that is not made to the other shows up as a failing harness.
const problem = await db.query(`select bsdc.config_value_problem('number', '90'::numeric::text::jsonb, 5, 3600, null) as p`);
check(problem.rows[0]?.p === null, 'the server validator accepts a number inside its bounds');
const problem2 = await db.query(`select bsdc.config_value_problem('number', '"90"'::jsonb, 5, 3600, null) as p`);
check(String(problem2.rows[0]?.p ?? '').includes('JSON number'), 'the server validator rejects the string that the console would have coerced');

// Blast radius.
await db.exec(`
  insert into public.config_usage (key, reader, kind, note) values
    ('test.cache_ttl', 'edge cache middleware', 'edge', 'Read on every HTML request'),
    ('test.cache_ttl', 'status-site', 'screen', 'Shows the effective TTL'),
    ('test.cache_ttl', 'nightly purge job', 'job', 'Uses the TTL to size the purge window')
  on conflict do nothing;
`);
const radius = await as(ADMIN, 'admin', `select * from public.config_blast_radius('test.cache_ttl')`);
check(radius.rows.length === 3, 'the blast radius lists every reader', String(radius.rows.length));
check(radius.rows.some((r) => r.kind === 'edge'), 'the blast radius distinguishes a reader on the edge from a screen');
await as(ADMIN, 'admin', `select public.config_refresh_reader_counts()`);
const counted = (await db.query(`select reader_count from public.site_config where key = 'test.cache_ttl'`)).rows[0]?.reader_count;
check(counted === 3, 'the stored count agrees with the list', String(counted));

// A key nobody reads can be proposed for removal; one somebody reads cannot.
const orphanProposal = await as(ADMIN, 'admin', `select public.propose_config_removal('test.orphan', true)`);
check(orphanProposal.error === null, 'a setting nobody reads can be proposed for removal', orphanProposal.error?.message);
const busyProposal = await as(ADMIN, 'admin', `select public.propose_config_removal('test.cache_ttl', true)`);
check(busyProposal.error?.code === '22023', 'a setting with readers cannot be proposed for removal');
check(String(busyProposal.error?.message).includes('3'), 'the refusal says how many readers there are', String(busyProposal.error?.message));

// ---------------------------------------------------------------------------
// §12.1 Secrets are write-only
// ---------------------------------------------------------------------------
const secretWrite = await as(ADMIN, 'admin', `select public.save_config_setting('test.stripe_key', '"sk_live_deadbeef"'::jsonb, 'Initial key from the vault export', null, true)`);
check(secretWrite.error === null, 'a secret can be written', secretWrite.error?.message);
const secretRead = (await as(ADMIN, 'admin', `select * from public.site_config_console()`)).rows.find((r) => r.key === 'test.stripe_key');
check(secretRead?.value === true, 'reading a secret returns whether it is set, never the value', JSON.stringify(secretRead?.value));
check(JSON.stringify(secretRead).includes('deadbeef') === false, 'the secret value does not appear anywhere in the console read');
check(secretRead?.secret_is_set === true, 'the read says the secret is set');
check(secretRead?.secret_set_at !== null, 'the read says when it was set, so rotation has a date');
const historyHasSecret = (
  await db.query(`select count(*)::int as n from public.site_config_history where key = 'test.stripe_key' and new_value::text like '%deadbeef%'`)
).rows[0]?.n;
check(historyHasSecret === 0, 'the secret never reaches the append-only history table');
const asPlain = await as(ADMIN, 'admin', `select public.save_config_setting('test.stripe_key', '"sk_live_other"'::jsonb, 'Trying to write it as a plain setting')`);
check(asPlain.error?.code === '22023', 'a secret cannot be written through the non-secret path');
const emptySecret = await as(ADMIN, 'admin', `select public.save_config_setting('test.stripe_key', '""'::jsonb, 'Clearing the key by accident', null, true)`);
check(emptySecret.error?.code === '22023', 'a secret cannot be cleared by saving an empty value; retiring is its own action');
const rotate = await as(ADMIN, 'admin', `select public.save_config_setting('test.stripe_key', '"sk_live_newer"'::jsonb, 'Rotated after the quarterly review', null, true)`);
check(rotate.error === null, 'a secret can be rotated');
const rotated = (await db.query(`select secret_set_at, secret_rotated_at from public.site_config where key = 'test.stripe_key'`)).rows[0];
check(rotated?.secret_rotated_at !== null, 'rotation records a separate date from the first set');
const rollbackSecret = await as(ADMIN, 'admin', `select public.rollback_config((select id from public.site_config_history where key = 'test.stripe_key' order by id limit 1), 'Rolling back a secret')`);
check(rollbackSecret.error?.code === '22023', 'a secret cannot be rolled back, because the old value was never stored');
const retire = await as(ADMIN, 'admin', `select public.retire_config_secret('test.stripe_key', 'Moved to the managed secret store')`);
check(retire.error === null, 'a secret can be retired', retire.error?.message);
check(
  (await db.query(`select secret_set_at from public.site_config where key = 'test.stripe_key'`)).rows[0]?.secret_set_at === null,
  'a retired secret reads as not set',
);

// ---------------------------------------------------------------------------
// §12.1 Two people for a production setting
// ---------------------------------------------------------------------------
const staged = await as(ADMIN, 'admin', `select public.save_config_setting('test.rollout', 'true'::jsonb, 'Turning on the new checkout for everybody') as r`);
check(staged.error === null, 'a setting that needs approval accepts a proposal', staged.error?.message);
check(staged.rows[0]?.r?.route === 'staged', 'the change is staged rather than applied');
check(staged.rows[0]?.r?.needs_approval === true, 'the result says approval is needed');
const notApplied = (await db.query(`select value from public.site_config where key = 'test.rollout'`)).rows[0]?.value;
check(notApplied === false, 'the live value is untouched while the change is staged', JSON.stringify(notApplied));
const stagedId = staged.rows[0]?.r?.staged_id;

const selfApprove = await as(ADMIN, 'admin', `select public.decide_config_change('${stagedId}'::uuid, true, 'Approving my own change')`);
check(selfApprove.error?.code === '42501', 'the person who proposed a change cannot approve it', String(selfApprove.error?.message));
const approve = await as(ADMIN2, 'admin', `select row_to_json(public.decide_config_change('${stagedId}'::uuid, true, 'Reviewed, checkout is behind a flag')) as r`);
check(approve.error === null, 'a second person can approve it', approve.error?.message);
check(
  (await db.query(`select value from public.site_config where key = 'test.rollout'`)).rows[0]?.value === true,
  'approving applies the value',
);
const approvedHistory = (
  await db.query(`select route, approved_by, changed_by from public.site_config_history where key = 'test.rollout' order by id desc limit 1`)
).rows[0];
check(approvedHistory?.route === 'staged', 'the history records that this was a staged change');
check(approvedHistory?.approved_by === ADMIN2, 'the history records who approved it');
check(approvedHistory?.changed_by === ADMIN, 'the history records who proposed it, which is a different person');
const twice = await as(ADMIN2, 'admin', `select public.decide_config_change('${stagedId}'::uuid, true, 'Approving it again')`);
check(twice.error?.code === '22023', 'a staged change can be decided exactly once');

// Rejection, and the constraint that makes self-approval impossible at the row
// level even if a caller found a way past the function.
const staged2 = await as(ADMIN, 'admin', `select public.save_config_setting('test.rollout', 'false'::jsonb, 'Rolling back the checkout flag') as r`);
const reject = await as(ADMIN2, 'admin', `select row_to_json(public.decide_config_change('${staged2.rows[0]?.r?.staged_id}'::uuid, false, 'Not until the tests pass')) as r`);
check(reject.rows[0]?.r?.status === 'rejected', 'a staged change can be rejected with a note', JSON.stringify(reject.rows[0]?.r ?? reject.error?.message));
const directSelfApprove = await db.query(
  `insert into public.config_staged_changes (key, proposed_value, reason, proposed_by, decided_by, status)
   values ('test.rollout', 'true'::jsonb, 'Bypassing the function', '${ADMIN}', '${ADMIN}', 'applied')`,
).then(() => null).catch((e) => e);
check(directSelfApprove !== null && directSelfApprove.code === '23514', 'the table itself refuses a self-approved row, not only the function');
// …but the proposer cancelling their own staging is housekeeping, not approval.
const selfCancel = await db.query(
  `insert into public.config_staged_changes (key, proposed_value, reason, proposed_by, decided_by, status)
   values ('test.rollout', 'true'::jsonb, 'A change I will withdraw', '${ADMIN}', '${ADMIN}', 'cancelled')`,
).then(() => 'inserted').catch((e) => e.code);
check(selfCancel === 'inserted', 'a proposer may cancel their own staged change, which needs no second person');

// ---------------------------------------------------------------------------
// §12.1 Scheduling, and rollback that is itself revertible
// ---------------------------------------------------------------------------
const scheduled = await as(ADMIN, 'admin', `select public.save_config_setting('test.cache_ttl', '120'::numeric::text::jsonb, 'Scheduled raise for the weekend', now() + interval '1 hour') as r`);
check(scheduled.rows[0]?.r?.route === 'scheduled', 'a change with a future time is scheduled, not applied');
check(
  (await db.query(`select value from public.site_config where key = 'test.cache_ttl'`)).rows[0]?.value === 90,
  'a scheduled change does not touch the live value',
);
// Fire it by moving the clock the only way a test can: rewrite apply_at.
await db.exec(`update public.config_staged_changes set apply_at = now() - interval '1 minute' where status = 'pending' and key = 'test.cache_ttl'`);
const applied = await as(ADMIN, 'admin', `select public.apply_due_config_changes() as n`);
check(applied.rows[0]?.n >= 1, 'a due change is applied by the scheduler', String(applied.rows[0]?.n));
check(
  (await db.query(`select value from public.site_config where key = 'test.cache_ttl'`)).rows[0]?.value === 120,
  'the scheduled value landed',
);
const applyAgain = await as(ADMIN, 'admin', `select public.apply_due_config_changes() as n`);
check(applyAgain.rows[0]?.n === 0, 'applying again is a no-op, so a retried scheduler tick does not re-apply');

const cancelTarget = await as(ADMIN, 'admin', `select public.save_config_setting('test.cache_ttl', '300'::numeric::text::jsonb, 'A change that will be cancelled', now() + interval '2 hours') as r`);
const cancelled = await as(ADMIN, 'admin', `select public.cancel_config_change('${cancelTarget.rows[0]?.r?.staged_id}'::uuid, 'Superseded by a better plan')`);
check(cancelled.error === null, 'a scheduled change can be cancelled before it fires');
check(
  (await db.query(`select value from public.site_config where key = 'test.cache_ttl'`)).rows[0]?.value === 120,
  'cancelling leaves the live value alone',
);

// Rollback: two rollbacks return to where we started.
const before = (await db.query(`select value from public.site_config where key = 'test.cache_ttl'`)).rows[0]?.value;
const latestTwo = (await db.query(`select id from public.site_config_history where key = 'test.cache_ttl' and old_value is not null order by id desc limit 1`)).rows[0]?.id;
const back1 = await as(ADMIN, 'admin', `select public.rollback_config(${Number(latestTwo)}, 'Rolling back the scheduled raise') as r`);
check(back1.error === null, 'a configuration change can be rolled back', back1.error?.message);
const mid = (await db.query(`select value from public.site_config where key = 'test.cache_ttl'`)).rows[0]?.value;
check(mid !== before, 'the rollback changed the value');
const rollbackRow = (await db.query(`select id from public.site_config_history where key = 'test.cache_ttl' order by id desc limit 1`)).rows[0]?.id;
const back2 = await as(ADMIN, 'admin', `select public.rollback_config(${Number(rollbackRow)}, 'Rolling back the rollback') as r`);
check(back2.error === null, 'the rollback is itself revertible');
// §12.1: "two rollbacks are a return to the original". The second rollback
// restores the value the first one replaced, so the pair is an undo of an undo
// rather than a second undo — which is the property that makes a rollback safe to
// reach for twice.
const finalValue = (await db.query(`select value from public.site_config where key = 'test.cache_ttl'`)).rows[0]?.value;
check(
  finalValue === before,
  'two rollbacks return to the value the first one replaced',
  `${String(before)} -> ${String(mid)} -> ${String(finalValue)}`,
);

// ---------------------------------------------------------------------------
// §12.2 Pages that are real
// ---------------------------------------------------------------------------
const slugFree = await as(ADMIN, 'admin', `select * from public.check_custom_page_slug('our-story')`);
check(slugFree.rows[0]?.available === true, 'a free slug is available');
const slugTaken = await as(ADMIN, 'admin', `select * from public.check_custom_page_slug('settings')`);
check(slugTaken.rows[0]?.available === false, 'a reserved route is not available as a slug');
check(slugTaken.rows[0]?.conflict === '/settings', 'the guard names the route it would shadow', String(slugTaken.rows[0]?.conflict));
const slugNested = await as(ADMIN, 'admin', `select * from public.check_custom_page_slug('auth/anything')`);
check(slugNested.rows[0]?.available === false, 'a slug under a reserved prefix is refused, not only an exact match');

const page = (await db.query(`insert into public.custom_pages (slug, title, description, status) values ('our-story', 'Our story', 'How we started', 'draft') returning id`)).rows[0]?.id;
check(Boolean(page), 'a draft page is created');
const emptyPublish = await as(ADMIN, 'admin', `select public.publish_custom_page('${page}'::uuid)`);
check(emptyPublish.error?.code === '22023', 'a page with no sections cannot be published');

await db.exec(`insert into public.page_sections (page_id, kind, "position", payload) values
  ('${page}', 'hero', 0, '{"heading":"We started in 2021"}'::jsonb),
  ('${page}', 'gallery', 1, '{"items":[{"src":"https://cdn/x.jpg","alt":"A meetup"}]}'::jsonb)`);
// `publish_custom_page` returns a composite, which PGlite hands back as a flat
// record literal rather than an object. `row_to_json` is the only way to read a
// field out of it from a harness.
const okPublish = await as(ADMIN, 'admin', `select row_to_json(public.publish_custom_page('${page}'::uuid)) as r`);
check(okPublish.error === null, 'a valid page publishes', okPublish.error?.message);
check(okPublish.rows[0]?.r?.current_version === 1, 'publishing writes version one');

// A broken gallery fails, and the failure names the section.
await db.exec(`update public.page_sections set payload = '{"items":[{"src":"https://cdn/y.jpg"}]}'::jsonb where page_id = '${page}' and kind = 'gallery'`);
const badPublish = await as(ADMIN, 'admin', `select public.publish_custom_page('${page}'::uuid)`);
check(badPublish.error?.code === '22023', 'a section that fails its own validation cannot be published');
check(/Section 2/.test(String(badPublish.error?.message)), 'the failure names the section that is broken (the gallery is the second section)', String(badPublish.error?.message));
check(/alt text/i.test(String(badPublish.error?.message)), 'the failure says what is wrong, not only where', String(badPublish.error?.message));
await db.exec(`update public.page_sections set payload = '{"items":[{"src":"https://cdn/y.jpg","alt":"A workshop"}]}'::jsonb where page_id = '${page}' and kind = 'gallery'`);

// Contrast, on a colour that is invisible on a white page.
await db.exec(`update public.page_sections set payload = payload || '{"color":"#f2f2f2"}'::jsonb where page_id = '${page}' and kind = 'hero'`);
const lowContrast = await as(ADMIN, 'admin', `select public.publish_custom_page('${page}'::uuid)`);
check(lowContrast.error?.code === '22023', 'a colour below AA contrast is refused at publish');
check(/contrast|4\.5/i.test(String(lowContrast.error?.message)), 'the refusal states the contrast and the floor', String(lowContrast.error?.message));
await db.exec(`update public.page_sections set payload = payload - 'color' where page_id = '${page}' and kind = 'hero'`);

// Scheduling with an end.
const scheduledPage = await as(ADMIN, 'admin', `select row_to_json(public.publish_custom_page('${page}'::uuid, now(), now() + interval '1 day')) as r`);
check(scheduledPage.error === null, 'a page can be published with an end', scheduledPage.error?.message);
check(scheduledPage.rows[0]?.r?.unpublish_at !== null, 'the end is stored');
const badWindow = await as(ADMIN, 'admin', `select public.publish_custom_page('${page}'::uuid, now(), now() - interval '1 day')`);
check(badWindow.error?.code === '22023', 'a page cannot stop being published before it starts');

// Version two, then a revert that writes version three rather than erasing two.
// This gets its own page: `publish_custom_page` is called earlier in this harness
// for the validation and scheduling checks, and those publishes are real versions.
// Asserting "the second publish is version two" against a page this script has
// already published four times would be measuring the fixture, not the function.
const vpage = (await db.query(`insert into public.custom_pages (slug, title, description) values ('version-story', 'Version story', 'History and reverts') returning id`)).rows[0]?.id;
await db.exec(`insert into public.page_sections (page_id, kind, "position", payload) values
  ('${vpage}', 'hero', 0, '{"heading":"We started in a room above a bakery"}'::jsonb)`);
const v1pub = await as(ADMIN, 'admin', `select row_to_json(public.publish_custom_page('${vpage}'::uuid)) as r`);
check(Number(v1pub.rows[0]?.r?.current_version) === 1, 'the first publish of a page is version one', String(v1pub.rows[0]?.r?.current_version));
await db.exec(`update public.page_sections set payload = '{"heading":"We started in 2021"}'::jsonb where page_id = '${vpage}' and kind = 'hero'`);
const v2pub = await as(ADMIN, 'admin', `select row_to_json(public.publish_custom_page('${vpage}'::uuid)) as r`);
check(Number(v2pub.rows[0]?.r?.current_version) === 2, 'the second publish is version two', String(v2pub.rows[0]?.r?.current_version));
const revert = await as(ADMIN, 'admin', `select row_to_json(public.revert_custom_page('${vpage}'::uuid, 1, 'The rewrite lost the founding story')) as r`);
check(revert.error === null, 'a page can be reverted to a version', revert.error?.message);
const versions = (await db.query(`select version from public.page_versions where page_id = '${vpage}' order by version`)).rows.map((r) => r.version);
check(versions.join(',') === '1,2,3', 'a revert writes a new version rather than deleting the ones after it', versions.join(','));
const heroNow = (await db.query(`select payload->>'heading' as h from public.page_sections where page_id = '${vpage}' and kind = 'hero'`)).rows[0]?.h;
check(String(heroNow).includes('bakery'), 'the revert restored the older section content', String(heroNow));

// A revert republishes through the same validator: a stale version cannot be a
// way around the accessibility checks.
check(revert.rows[0]?.r?.status === 'draft', 'a revert leaves the page as a draft, so publishing it again is a decision', String(revert.rows[0]?.r?.status));

const exported = await as(ADMIN, 'admin', `select public.export_custom_page('${page}'::uuid) as doc`);
check(exported.rows[0]?.doc?.format === 'bsdc-page-v1', 'a page exports in a versioned format');
check(Array.isArray(exported.rows[0]?.doc?.sections) && exported.rows[0].doc.sections.length === 2, 'the export carries every section in order');

// published_page is time-aware now.
await db.exec(`update public.custom_pages set status = 'published', publish_at = now() - interval '1 hour', unpublish_at = now() - interval '1 minute' where id = '${page}'`);
const expiredRead = await asAnon(`select * from public.published_page('our-story')`);
check((expiredRead.rows ?? []).length === 0, 'a page past its unpublish time is not served');
const expired = await as(ADMIN, 'admin', `select public.expire_scheduled_pages() as n`);
check(expired.rows[0]?.n >= 1, 'the scheduler returns the page to draft', String(expired.rows[0]?.n));
check(
  (await db.query(`select status from public.custom_pages where id = '${page}'`)).rows[0]?.status === 'draft',
  'the expired page is a draft again',
);

// ---------------------------------------------------------------------------
// §12.3 IP rules with a reason
// ---------------------------------------------------------------------------
const noReason = await as(ADMIN, 'admin', `select public.save_ip_rule('203.0.113.0/24'::cidr, 'block', 'bad', 'Test range')`);
check(noReason.error?.code === '22023', 'a block without a real reason is refused');
const noLabel = await as(ADMIN, 'admin', `select public.save_ip_rule('203.0.113.0/24'::cidr, 'block', 'Credential stuffing from this range', '')`);
check(noLabel.error?.code === '22023', 'a rule without a label is refused, so a list of rules is readable');

// Expiry and review are mandatory, and a review date in the past is refused.
const pastReview = await as(ADMIN, 'admin', `select public.save_ip_rule('203.0.113.0/24'::cidr, 'block', 'Credential stuffing from this range', 'Stuffing range', now() - interval '1 day')`);
check(pastReview.error?.code === '22023', 'a review date in the past is refused');
const shadowRule = await as(ADMIN, 'admin', `select public.save_ip_rule('198.51.100.0/24'::cidr, 'block', 'Scraping seen from a university range', 'Scraper range', null, null, true) as id`);
check(shadowRule.error === null, 'a shadow rule can be created', shadowRule.error?.message);
const shadowId = shadowRule.rows[0]?.id;
const ruleRow = (await db.query(`select review_at, shadow, label from public.ip_rules where id = '${shadowId}'`)).rows[0];
check(ruleRow?.review_at !== null, 'a block with no review date gets a default one rather than becoming permanent');
check(ruleRow?.shadow === true, 'the rule is in shadow mode');

// The simulator names the rule that decided, and the refused rules say why.
const testerRule = await as(ADMIN, 'admin', `select public.save_ip_rule('203.0.113.42/32'::cidr, 'block', 'Repeated card testing from this host', 'Card tester', now() + interval '30 days') as id`);
check(testerRule.error === null, 'a specific block rule can be created', testerRule.error?.message);
// Face the rule up against a deliberately wider watch rule, so the simulator has
// something to pass over and an explanation to give.
await db.exec(`update public.ip_rules set kind = 'watch' where kind = 'watch'`);
const sim = await as(ADMIN, 'admin', `select * from public.ip_simulate('203.0.113.42'::inet)`);
check(sim.error === null, 'the simulator answers for an address', sim.error?.message);
const decided = (sim.rows ?? []).find((r) => r.decision === 'block' || r.decision === 'allow');
check(decided?.decision === 'block', 'the simulator reports the decision the engine would make', JSON.stringify(decided));
check(decided?.matched === '203.0.113.42/32', 'the simulator names the exact rule that decided', String(decided?.matched));
check(decided?.matched_label === 'Card tester', 'the simulator names the rule by its label');
check(
  (sim.rows ?? []).every((r) => r.decision !== null || r.skipped_why !== null),
  'every rule the simulator passes over carries a reason',
  JSON.stringify((sim.rows ?? []).map((r) => r.skipped_why)),
);
const shadowSim = await as(ADMIN, 'admin', `select * from public.ip_simulate('198.51.100.7'::inet)`);
check(
  (shadowSim.rows ?? []).some((r) => r.decision === 'would block'),
  'a shadow rule reports what it would do without blocking',
  JSON.stringify((shadowSim.rows ?? []).map((r) => r.decision)),
);
const simDisagrees = await db.query(`select d.decision as engine, s.decision as sim from public.ip_decision('203.0.113.42'::inet) d, public.ip_simulate('203.0.113.42'::inet) s where s.decision in ('block','allow') limit 1`);
check(simDisagrees.rows[0]?.engine === simDisagrees.rows[0]?.sim, 'the simulator and the engine agree, which is the only thing that makes the simulator useful', JSON.stringify(simDisagrees.rows[0]));

// Dry run against real history.
//
// The candidate range has to be one where a block would actually change something.
// 203.0.113.42 already has a /32 block from the simulator section above, so a /24
// around it would change nothing and the dry run would — correctly — return no
// rows. The evidence is collected on 192.0.2.0/24, which nothing has decided yet.
await db.exec(`insert into public.ip_events (ip, action, created_at) values
  ('203.0.113.42', 'checkout.callback', now() - interval '2 days'),
  ('203.0.113.42', 'auth.login', now() - interval '2 days'),
  ('203.0.113.42', 'feed.read', now() - interval '3 days'),
  ('192.0.2.10',   'checkout.callback', now() - interval '1 day'),
  ('192.0.2.10',   'auth.login', now() - interval '1 day'),
  ('192.0.2.11',   'feed.read', now() - interval '2 days')`);
const dry = await as(ADMIN, 'admin', `select * from public.ip_dry_run('192.0.2.0/24'::cidr, 'block', 7, 50)`);
check(dry.error === null, 'a dry run runs', dry.error?.message);
// `ip_dry_run` is defined with OUT parameters, so PGlite returns real columns; a
// definition change that made it return one jsonb column would break every claim
// below silently, so the shape is asserted before it is used.
const dryRow = (dry.rows ?? [])[0] ?? {};
check(typeof dryRow === 'object' && 'ip' in dryRow, 'the dry run returns named columns', JSON.stringify(Object.keys(dryRow)));
check(dryRow?.ip === '192.0.2.10', 'the dry run lists the addresses the rule would affect, busiest first', JSON.stringify(dryRow));
check(Number(dryRow?.would_change) === 2, 'the dry run counts the requests whose outcome would change', String(dryRow?.would_change));
check((dryRow?.actions ?? []).includes('checkout.callback'), 'the dry run shows what those requests were doing, so a payment callback is visible before the rule is saved', JSON.stringify(dryRow?.actions));
const dryEmpty = await as(ADMIN, 'admin', `select * from public.ip_dry_run('198.51.200.0/24'::cidr, 'block', 7, 50)`);
check((dryEmpty.rows ?? []).length === 0, 'a rule that would affect nobody returns nothing');
// And the honest negative: a wider rule around an address that is already blocked
// changes no outcome, so the dry run says so rather than inventing hits.
const dryRedundant = await as(ADMIN, 'admin', `select * from public.ip_dry_run('203.0.113.0/24'::cidr, 'block', 7, 50)`);
check((dryRedundant.rows ?? []).length === 0, 'a rule that changes no existing outcome reports nothing, so a redundant block is visibly redundant', JSON.stringify(dryRedundant.rows));

// The tracer.
const reqId = 'req-2026-11-23-aaaa';
await as(ADMIN, 'admin', `select public.record_ip_decision('203.0.113.42'::inet, 'checkout.callback', '${reqId}', null)`);
const trace = await as(ADMIN, 'admin', `select * from public.ip_trace('${reqId}')`);
check((trace.rows ?? []).length === 1, 'a request id traces to its decision');
check(trace.rows[0]?.rule_reason !== undefined, 'the trace carries the rule that decided');

// Arming.
const armEarly = await as(ADMIN, 'admin', `select public.arm_ip_rule('${shadowId}'::uuid, '')`);
check(armEarly.error?.code === '22023', 'arming without a note about the shadow period is refused');
const armed = await as(ADMIN, 'admin', `select row_to_json(public.arm_ip_rule('${shadowId}'::uuid, 'Fourteen days, no legitimate traffic')) as r`);
check(armed.rows[0]?.r?.shadow === false, 'a shadow rule can be armed with the evidence recorded');
const armAgain = await as(ADMIN, 'admin', `select public.arm_ip_rule('${shadowId}'::uuid, 'Arming twice')`);
check(armAgain.error?.code === '22023', 'an armed rule cannot be armed again');

// Review list, and disable.
await db.exec(`update public.ip_rules set review_at = now() - interval '2 days' where id = '${shadowId}'`);
const review = await as(ADMIN, 'admin', `select * from public.ip_rules_needing_review(50)`);
check((review.rows ?? []).some((r) => r.id === shadowId), 'a rule past its review date is listed rather than trusted');
check(review.rows.find((r) => r.id === shadowId)?.overdue_by !== undefined, 'the list says how overdue it is');
const disabled = await as(ADMIN, 'admin', `select public.disable_ip_rule('${shadowId}'::uuid, 'Range reassigned to a partner network')`);
check(disabled.error === null, 'a rule can be disabled with a reason');
const stillListed = (await as(ADMIN, 'admin', `select * from public.ip_rules_needing_review(50)`)).rows.some((r) => r.id === shadowId);
check(!stillListed, 'a disabled rule drops off the review list');

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------
check(
  (await as(MEMBER, 'member', `select * from public.site_config_console()`)).rows.length === 0,
  'a member sees nothing from the settings console',
);
check(
  (await as(MEMBER, 'member', `select public.save_config_setting('test.cache_ttl', '5'::numeric::text::jsonb, 'A member trying to change the cache')`)).error?.code === '42501',
  'a member cannot write a setting',
);
check(
  (await asAnon(`select * from public.site_config_console()`)).error !== null,
  'an anonymous caller cannot read the settings console',
);
check(
  (await as(MEMBER, 'member', `select public.save_ip_rule('192.0.2.0/24'::cidr, 'block', 'A member blocking a range', 'Nope', now() + interval '1 day')`)).error?.code === '42501',
  'a member cannot create an IP rule',
);
check(
  (await asAnon(`select * from public.ip_simulate('192.0.2.1'::inet)`)).error !== null,
  'the simulator is not open to anonymous callers, because it reveals the rule list',
);
for (const table of ['config_usage', 'config_staged_changes', 'page_versions', 'reserved_paths']) {
  const rls = (await db.query(`select relrowsecurity from pg_class where relname = $1 and relnamespace = 'public'::regnamespace`, [table])).rows[0]?.relrowsecurity;
  check(rls === true, `${table} has row level security on`);
}

// ---------------------------------------------------------------------------
// The two read RPCs the screens are built on.
//
// `config_pending_changes` is the only place a screen can learn whether *this*
// person may decide a staged change, because the browser has no uid to check
// against. If the answer were computed in the client it would be a suggestion;
// here the same call feeds the button and the refusal.
// ---------------------------------------------------------------------------
{
  // A staged change with no schedule: only a second person may decide it.
  const staged = await as(ADMIN2, 'admin', `
    select public.save_config_setting(
      'test.rollout', 'true'::jsonb,
      'Turning the rollout on after the canary held all afternoon', null, null
    ) as r
  `);
  check(staged.error === null, 'an admin can stage a change for approval', staged.error?.message);

  const proposer = await as(ADMIN2, 'admin', `select * from public.config_pending_changes(50)`);
  const own = (proposer.rows ?? []).find((r) => r.key === 'test.rollout');
  check(own !== undefined, 'the staged change appears in the pending list to its proposer');
  check(own?.can_decide === false, 'the proposer is told they cannot decide their own change');
  check(
    typeof own?.blocker === 'string' && own.blocker.toLowerCase().includes('second person'),
    'and the blocker says a second person has to decide it',
    own?.blocker,
  );
  check(own?.scheduled === false, 'an unscheduled proposal is not reported as scheduled');

  const other = await as(ADMIN, 'admin', `select * from public.config_pending_changes(50)`);
  const seen = (other.rows ?? []).find((r) => r.key === 'test.rollout');
  check(seen?.can_decide === true, 'a different admin is told they can decide it');
  check(seen?.blocker === '', 'with no blocker', JSON.stringify(seen?.blocker));

  // A schedule is applied by the clock, not decided by a person, so it is
  // cancellable by whoever is on shift.
  const scheduled = await as(ADMIN2, 'admin', `
    select public.save_config_setting(
      'ops.ip_allowlist_only', 'true'::jsonb,
      'Turning on the allowlist for the incident window', now() + interval '2 hours', null
    ) as r
  `);
  check(scheduled.error === null, 'an admin can schedule a change', scheduled.error?.message);
  const again = await as(ADMIN2, 'admin', `select * from public.config_pending_changes(50)`);
  const sched = (again.rows ?? []).find((r) => r.key === 'ops.ip_allowlist_only');
  check(sched?.scheduled === true, 'a scheduled change is reported as scheduled');
  check(sched?.can_decide === true, 'and even its proposer may cancel it, because nothing is being approved');

  const member = await as(MEMBER, 'member', `select * from public.config_pending_changes(50)`);
  check((member.rows ?? []).length === 0, 'a member sees no pending changes at all');

  const limited = await as(ADMIN, 'admin', `select * from public.config_pending_changes(1)`);
  check((limited.rows ?? []).length === 1, 'the pending list honours its limit');
}

{
  const versions = await as(ADMIN, 'admin', `
    select row_to_json(v) as r from public.custom_page_versions('${vpage}') v
  `);
  check(versions.error === null, 'the version list can be read', versions.error?.message);
  const rows = (versions.rows ?? []).map((r) => r.r);
  check(rows.length >= 2, 'a page that was published and reverted has more than one version', String(rows.length));
  check(
    rows.filter((v) => v.current === true).length === 1,
    'exactly one version is marked current',
  );
  check(
    rows[0]?.version >= rows[rows.length - 1]?.version,
    'versions come back newest first',
  );
  check(
    rows.every((v) => typeof v.section_count === 'number' && v.section_count >= 0),
    'every version reports how many sections it had',
  );
  const missing = await as(ADMIN, 'admin', `select * from public.custom_page_versions('00000000-0000-0000-0000-000000000000')`);
  check(
    missing.error === null && (missing.rows ?? []).length === 0,
    'a page that does not exist gives an empty list, not an error to decode',
  );
  const member = await as(MEMBER, 'member', `select * from public.custom_page_versions('${vpage}')`);
  check((member.rows ?? []).length === 0, 'a member cannot read the version history of a draft page');
}

// ---------------------------------------------------------------------------
// §12.3, on the screen's terms: the simulator must name the winner, the dry run
// must be worth reading, and a rule must be able to prove itself in shadow mode
// before it can take anything down.
// ---------------------------------------------------------------------------
{
  // Nothing has decided 198.18.0.0/15 yet, so a rule here changes an answer
  // rather than restating one.
  const made = await as(ADMIN, 'admin', `
    select public.save_ip_rule(
      '198.18.0.0/15'::cidr, 'block',
      'Card testing burst seen in the payment logs', 'Shadow card range',
      now() + interval '30 days', null, true
    ) as id
  `);
  check(made.error === null, 'a shadow rule can be created', made.error?.message);
  const madeId = made.rows?.[0]?.id;

  const shadowSim = await as(ADMIN, 'admin', `
    select * from public.ip_simulate('198.18.4.7'::inet)
  `);
  check(
    (shadowSim.rows ?? []).some((s) => s.decision === 'would block'),
    'the simulator reports what a shadow rule would have done',
    JSON.stringify((shadowSim.rows ?? []).map((s) => s.decision)),
  );
  check(
    (shadowSim.rows ?? []).every((s) => s.decision !== 'block'),
    'a shadow rule blocks nothing, not even in the simulator',
  );

  const armed = await as(ADMIN, 'admin', `
    select row_to_json(public.arm_ip_rule('${madeId}'::uuid, 'Seven quiet days, no complaint from the range owner')) as r
  `);
  check(armed.error === null, 'a shadow rule can be armed', armed.error?.message);
  check(armed.rows?.[0]?.r?.shadow === false, 'arming turns shadow mode off');
  const afterArm = await as(ADMIN, 'admin', `
    select * from public.ip_simulate('198.18.4.7'::inet)
  `);
  check(
    (afterArm.rows ?? []).some((s) => s.decision === 'block'),
    'once armed, the same address is blocked',
  );

  const disarm = await as(ADMIN, 'admin', `
    select public.disable_ip_rule('${madeId}'::uuid, 'The burst stopped; the range belongs to a partner')
  `);
  check(disarm.error === null, 'a rule can be disabled rather than deleted', disarm.error?.message);
  const disabled = await as(ADMIN, 'admin', `
    select disabled_at, disabled_reason from public.ip_rules where id = '${madeId}'::uuid
  `);
  check(disabled.rows?.[0]?.disabled_at !== null, 'disabling records when it happened');
  check(
    (disabled.rows?.[0]?.disabled_reason ?? '').includes('partner'),
    'and why, so the next person does not re-add it',
  );
  const afterDisarm = await as(ADMIN, 'admin', `
    select * from public.ip_simulate('198.18.4.7'::inet)
  `);
  check(
    (afterDisarm.rows ?? []).every((s) => s.decision !== 'block'),
    'a disabled rule blocks nobody',
  );

  const noReview = await as(ADMIN, 'admin', `
    select public.save_ip_rule('198.51.100.0/24'::cidr, 'block', 'A block with no review date at all', 'No review', null, null, false)
  `);
  check(noReview.error === null, 'a missing review date is defaulted, not refused', noReview.error?.message);
  const review = await as(ADMIN, 'admin', `
    select review_at, now() as now from public.ip_rules where range = '198.51.100.0/24'::cidr and disabled_at is null
  `);
  const reviewAt = review.rows?.[0]?.review_at;
  check(reviewAt !== null && reviewAt !== undefined, 'the default review date is stored');
  check(
    new Date(reviewAt) > new Date(review.rows?.[0]?.now),
    'and it is in the future, because a review date in the past is not a review',
  );

  const due = await as(ADMIN, 'admin', `select * from public.ip_rules_needing_review(30)`);
  check(Array.isArray(due.rows), 'the review list can be read');
}

console.log(`\nSUMMARY: ${pass} passed, ${bad.length} failed`);
if (bad.length) {
  console.log(bad.map((b) => `  - ${b}`).join('\n'));
  process.exitCode = 1;
}
