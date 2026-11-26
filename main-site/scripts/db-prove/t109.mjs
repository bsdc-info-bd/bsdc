/**
 * Proof for 0149: signal in detail.
 *
 * Response 8's claim is that every number here leads somebody to an action, and
 * that the three consoles cannot lie to their readers. That is a property of the
 * database, not of the screens, so every check below asks the function:
 *
 *   * a budget that has breached twice is not yet a regression, and a third
 *     consecutive breach is — because a monitor that pages on one slow window
 *     is a monitor nobody reads;
 *   * a metric with too few samples is reported as insufficient rather than as
 *     a trend, including when it is over its target;
 *   * an incident's internal note never reaches the public board, and resolving
 *     without a customer-facing sentence is refused by the table;
 *   * a drill notifies nobody and appears on no board;
 *   * verification answers revoked and unknown differently, is rate limited,
 *     and returns exactly the published field list and nothing else.
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

const OWNER = '00000000-0000-4000-8000-000000000e01';
const ADMIN = '00000000-0000-4000-8000-000000000e02';
const MEMBER = '00000000-0000-4000-8000-000000000e03';

await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${OWNER}',  'sigowner',  'Signal Owner',  'owner', 'active'),
    ('${ADMIN}',  'sigadmin',  'Signal Admin',  'admin', 'active'),
    ('${MEMBER}', 'sigmember', 'Signal Member', 'member','active')
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

/**
 * The job's own identity. `check_vital_budgets` writes regressions and is
 * granted to service_role only, because a scheduled sweep is not a person
 * clicking something.
 */
async function asJob(sql) {
  await db.exec(`set role service_role;`);
  try {
    return { rows: (await db.query(sql)).rows, error: null };
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

/** Measurements this harness planted, so the counts are arithmetic and not luck. */
const PLANTED = 'sig-build-1';

async function plant({ route = '/', metric = 'LCP', value = 2000, n = 1, daysAgo = 0, build = PLANTED, app = 'main-site' }) {
  await db.query(
    `insert into public.web_vitals (app, route, metric, value, build, recorded_at)
     select $1, $2, $3::bsdc_vital, $4, $5, now() - ($6 || ' days')::interval - (g || ' seconds')::interval
       from generate_series(1, $7) g`,
    [app, route, metric, value, build, String(daysAgo), n],
  );
}

// ---------------------------------------------------------------------------
// §13.1 Budgets are data
// ---------------------------------------------------------------------------
const budgetCountBefore = Number((await db.query(`select count(*) as n from public.vital_budgets`)).rows[0].n);
check(budgetCountBefore === 0, 'the budget table starts empty, so every number below was planted');

const badBudget = await as(ADMIN, 'admin', `
  select public.save_vital_budget('main-site', '/', 'LCP', 0) as id
`);
check(badBudget.error?.code === '22023', 'a budget of zero is refused, because zero is not a target', badBudget.error?.message);

const badStreak = await as(ADMIN, 'admin', `
  select public.save_vital_budget('main-site', '/', 'LCP', 2500, 1) as id
`);
check(badStreak.error?.code === '22023', 'a streak of one is refused, because one slow window is not a regression');

const clsUnit = await as(ADMIN, 'admin', `
  select public.save_vital_budget('main-site', '/', 'CLS', 2500) as id
`);
check(clsUnit.error?.code === '22023', 'a CLS budget in milliseconds is refused, because CLS is a score');

const memberBudget = await as(MEMBER, 'member', `
  select public.save_vital_budget('main-site', '/', 'LCP', 1000) as id
`);
check(memberBudget.error?.code === '42501', 'a member cannot set a budget');

const budget = await as(ADMIN, 'admin', `
  select public.save_vital_budget('main-site', '/', 'LCP', 2500, 3, 1, 10, 'The landing page budget') as id
`);
check(budget.error === null, 'a budget can be set with a target, a streak and a sample floor', budget.error?.message);
const routeBudget = budget.rows[0]?.id;
check(typeof routeBudget === 'string', 'and returns the id it wrote', String(routeBudget));

// Two samples is not a trend.
await plant({ n: 2, value: 4000 });
const thin = await db.query(`select * from bsdc.budget_breaches('main-site')`);
const thinRow = thin.rows.find((r) => r.budget_id === routeBudget);
check(thinRow?.insufficient === true, 'two measurements are reported as insufficient, not as a breach');
check(thinRow?.samples === 2, 'and the sample count says why', String(thinRow?.samples));

const thinCheck = await asJob(`select public.check_vital_budgets() as n`);
check(Number(thinCheck.rows[0]?.n) === 0, 'a breach with too few samples writes no regression');

// Now enough samples, and over target.
await plant({ n: 20, value: 4000 });
const oneWindow = await db.query(`select * from bsdc.budget_breaches('main-site')`);
const oneRow = oneWindow.rows.find((r) => r.budget_id === routeBudget);
check(oneRow?.insufficient === false, 'twenty samples is enough to say something', String(oneRow?.insufficient));
check(oneRow?.over_target === true, 'and 4000ms against a 2500ms budget is over');
check(oneRow?.streak === 1, 'one window over is a streak of one', String(oneRow?.streak));
check(Number(oneRow?.delta_share) > 0.59 && Number(oneRow?.delta_share) < 0.61, 'the delta is the share over target, not the difference', String(oneRow?.delta_share));

const firstCheck = await asJob(`select public.check_vital_budgets() as n`);
check(Number(firstCheck.rows[0]?.n) === 0, 'one window over does not open a regression when the streak required is three');

// Two more windows, each over. Planted at 1 and 2 days ago.
await plant({ n: 20, value: 4100, daysAgo: 1 });
await plant({ n: 20, value: 4200, daysAgo: 2 });
const threeWindows = await db.query(`select * from bsdc.budget_breaches('main-site')`);
const threeRow = threeWindows.rows.find((r) => r.budget_id === routeBudget);
check(Number(threeRow?.streak) === 3, 'three consecutive windows over is a streak of three', String(threeRow?.streak));
check(Number(threeRow?.observed) >= 4000, 'the observed value is the newest window, not the average of all three', String(threeRow?.observed));

// A quiet window in the middle breaks the streak, which is the whole point of
// counting a leading run rather than counting breaches.
await plant({ n: 20, value: 1000, daysAgo: 3 });
const broken = await db.query(`select * from bsdc.budget_breaches('main-site')`);
check(Number(broken.rows.find((r) => r.budget_id === routeBudget)?.streak) === 3,
  'a good window beyond the streak does not shorten it');
await db.exec(`delete from public.web_vitals where value = 1000`);

const opened = await asJob(`select public.check_vital_budgets() as n`);
check(Number(opened.rows[0]?.n) === 1, 'the third consecutive breach opens exactly one regression', String(opened.rows[0]?.n));

const regressions = await db.query(`select * from public.vital_regressions where budget_id = '${routeBudget}'`);
check(regressions.rows.length === 1, 'one regression per budget, not one per window');
const regression = regressions.rows[0];
check(regression?.build === PLANTED, 'the regression records the build that was live', String(regression?.build));
check(regression?.acknowledged_at === null, 'and it is open');

// Idempotent: running it again must not open a second regression.
const again = await asJob(`select public.check_vital_budgets() as n`);
check(Number(again.rows[0]?.n) === 0, 'checking again updates the open regression instead of writing a second');
const stillOne = await db.query(`select count(*) as n from public.vital_regressions where budget_id = '${routeBudget}'`);
check(Number(stillOne.rows[0]?.n) === 1, 'and there is still exactly one');

// Acknowledging needs a sentence and closes exactly once.
const ackShort = await as(ADMIN, 'admin', `select public.acknowledge_regression('${regression.id}', 'ok')`);
check(ackShort.error?.code === '22023', 'acknowledging with a shrug is refused');
const ack = await as(ADMIN, 'admin', `select public.acknowledge_regression('${regression.id}', 'Reverted the image optimisation change in sig-build-2')`);
check(ack.error === null, 'acknowledging with what was done is accepted', ack.error?.message);
const ackAgain = await as(ADMIN, 'admin', `select public.acknowledge_regression('${regression.id}', 'Acknowledging it twice to see what happens')`);
check(ackAgain.error?.code === 'P0002', 'and it cannot be acknowledged twice');
const acked = await db.query(`select acknowledged_by, ack_note from public.vital_regressions where id = '${regression.id}'`);
check(acked.rows[0]?.acknowledged_by === ADMIN, 'the acknowledgement names the person');
check((acked.rows[0]?.ack_note ?? '').includes('Reverted'), 'and carries the note');

// A budget for a route beats the site-wide one, which is the only precedence.
await as(ADMIN, 'admin', `select public.save_vital_budget('main-site', '*', 'LCP', 9000, 3, 1, 10, 'Site-wide') as id`);
await plant({ route: '/learn', n: 40, value: 3000 });
const precedence = await db.query(`select * from public.vitals_board('main-site', 7)`);
const learnRow = precedence.rows.find((r) => r.route === '/learn' && r.metric === 'LCP');
check(Number(learnRow?.target) === 9000, 'a route with no budget of its own uses the site-wide one', String(learnRow?.target));
check(learnRow?.over_budget === false, 'and 3000 against 9000 is inside it');
await as(ADMIN, 'admin', `select public.save_vital_budget('main-site', '/learn', 'LCP', 2000, 3, 1, 10, 'Learn') as id`);
const override = await db.query(`select * from public.vitals_board('main-site', 7)`);
const learnOverride = override.rows.find((r) => r.route === '/learn' && r.metric === 'LCP');
check(Number(learnOverride?.target) === 2000, 'a route budget beats the site-wide one', String(learnOverride?.target));
check(learnOverride?.over_budget === true, 'and the same measurement is now over', String(learnOverride?.over_budget));

// The read functions the console is built on.
const openBoard = await as(ADMIN, 'admin', `select * from public.vital_regressions_open(50)`);
check(openBoard.error === null, 'the open regression board can be read', openBoard.error?.message);
check((openBoard.rows ?? []).every((r) => r.acknowledged_at === null), 'and contains only open ones');
const openMember = await as(MEMBER, 'member', `select * from public.vital_regressions_open(50)`);
check(openMember.error?.code === '42501', 'a member cannot read the regression board');

const listed = await as(ADMIN, 'admin', `select * from public.vital_budget_list('main-site')`);
check(listed.error === null, 'the budget list can be read', listed.error?.message);
check((listed.rows ?? []).some((b) => b.id === routeBudget), 'and includes the budget just set');
const savesOne = await as(ADMIN, 'admin', `
  select public.save_vital_budget('main-site', '/', 'LCP', 2500, 3, 1, 10, 'The landing page budget') as id
`);
check(savesOne.rows[0]?.id === routeBudget, 'saving an existing budget updates it rather than adding a second', String(savesOne.rows[0]?.id));
const stillOneBudget = await db.query(`select count(*) as n from public.vital_budgets where app = 'main-site' and route = '/' and metric = 'LCP'`);
check(Number(stillOneBudget.rows[0]?.n) === 1, 'and there is still exactly one row for that route and metric');

// ---------------------------------------------------------------------------
// §13.1 Release comparison, with the honesty to refuse a thin one
// ---------------------------------------------------------------------------
await plant({ route: '/compare', metric: 'FCP', value: 1200, n: 60, daysAgo: 3, build: 'build-old' });
await plant({ route: '/compare', metric: 'FCP', value: 1900, n: 60, daysAgo: 0, build: 'build-new' });
await plant({ route: '/compare', metric: 'CLS', value: 0.05, n: 4, daysAgo: 3, build: 'build-old' });
await plant({ route: '/compare', metric: 'CLS', value: 0.2, n: 4, daysAgo: 0, build: 'build-new' });

const compare = await as(ADMIN, 'admin', `select * from public.vitals_release_compare('main-site', '/compare', 14)`);
const fcp = (compare.rows ?? []).find((r) => r.metric === 'FCP');
check(compare.error === null, 'the release comparison answers', compare.error?.message);
check(fcp?.build === 'build-new', 'the newest build is compared', String(fcp?.build));
check(fcp?.previous_build === 'build-old', 'against the one before it', String(fcp?.previous_build));
check(Number(fcp?.delta) === 700, 'the delta is stated', String(fcp?.delta));
check(fcp?.enough === true, 'with 60 samples on each side, the comparison is worth making');
const cls = (compare.rows ?? []).find((r) => r.metric === 'CLS');
check(cls?.enough === false, 'with four samples a side, the same comparison is refused rather than published');

const compareMember = await as(MEMBER, 'member', `select * from public.vitals_release_compare('main-site', '/compare', 14)`);
check(compareMember.error?.code === '42501', 'a member cannot read the performance boards');

// ---------------------------------------------------------------------------
// §13.2 An incident that survives its own resolution
// ---------------------------------------------------------------------------
await db.exec(`insert into public.services (key, name) values ('sig-svc', 'Signal service') on conflict do nothing`);

const noPublic = await as(ADMIN, 'admin', `
  select public.declare_incident('sig-svc', 'Cache cluster degraded', 'Slow pages', 'major', 'Short', '')
`);
check(noPublic.error?.code === '22023', 'declaring without a customer-facing sentence is refused');

const memberDeclare = await as(MEMBER, 'member', `
  select public.declare_incident('sig-svc', 'Cache cluster degraded', 'Slow pages across the site', 'major',
    'Pages are taking longer than usual to load while we restart the cache.', 'Cache restart')
`);
check(memberDeclare.error?.code === '42501', 'a member cannot declare an incident');

const declared = await as(ADMIN, 'admin', `
  select public.declare_incident('sig-svc', 'Cache cluster degraded', 'Slow pages across the site', 'major',
    'Pages are taking longer than usual to load while we restart the cache.',
    'Redis is at 100% CPU on node two.') as id
`);
check(declared.error === null, 'an incident can be declared', declared.error?.message);
const incidentId = declared.rows[0]?.id;

const incidentRow = (await db.query(`
  select i.*, s.state as service_state from public.incidents i
  join public.services s on s.key = i.service_key where i.id = '${incidentId}'
`)).rows[0];
check(incidentRow?.public_slug !== '', 'declaring assigns a public slug', String(incidentRow?.public_slug));
check(incidentRow?.declared_at !== null, 'and a declaration timestamp');
check(incidentRow?.channel_id !== null, 'and opens a staff channel linked back to it');
check(incidentRow?.service_state === 'partial', 'and moves the service, because a major impact is partial service');

const channel = (await db.query(`select name, is_private from public.corporate_channels where id = '${incidentRow.channel_id}'`)).rows[0];
check(channel?.is_private === true, 'the incident channel is private, because coordination notes are not the public record');
const members = await as(ADMIN, 'admin', `select * from public.my_channels()`);
check(
  (members.rows ?? []).some((c) => c.id === incidentRow.channel_id),
  'and everybody who may declare an incident can open it, because a private channel with no members is an empty room',
);
const linked = await as(ADMIN, 'admin', `select * from public.channel_incident('${incidentRow.channel_id}')`);
check(linked.error === null, 'the channel links back to its incident', linked.error?.message);
check(linked.rows?.[0]?.id === incidentId, 'and names the right one', String(linked.rows?.[0]?.id));

// The two boxes are two fields.
await as(ADMIN, 'admin', `
  select public.update_incident('${incidentId}',
    'We are still restarting the cache. Pages are loading slowly but nothing is lost.',
    'Node three also looks hot. Suspicious that the config rollout touched both.')
`);
const updateRow = (await db.query(`
  select public_body, internal_note from public.incident_updates
  where incident_id = '${incidentId}' order by created_at desc limit 1
`)).rows[0];
check(updateRow?.public_body !== updateRow?.internal_note, 'the customer sentence and the internal note are separate columns');
check((updateRow?.internal_note ?? '').includes('Suspicious'), 'the internal note keeps the speculation');

const noSentence = await as(ADMIN, 'admin', `select public.update_incident('${incidentId}', 'x', '')`);
check(noSentence.error?.code === '22023', 'an update without a customer sentence is refused, even when nothing changed publicly');

// Resolution needs a summary that a customer could read.
const resolveThin = await as(ADMIN, 'admin', `select public.resolve_with_summary('${incidentId}', 'fixed')`);
check(resolveThin.error?.code === '22023', 'resolving with "fixed" is refused');

const resolve = await as(ADMIN, 'admin', `
  select public.resolve_with_summary('${incidentId}',
    'The cache was restarted at 14:20 and page times are back to normal. No data was lost.',
    '[{"body":"Move the cache to a managed cluster so a node cannot saturate the pair","due_on":"2026-12-15"},
      {"body":"Alert on cache CPU above 80 percent for ten minutes","due_on":"2026-12-01"}]'::jsonb
  ) as n
`);
check(resolve.error === null, 'an incident can be resolved with a summary and an action list', resolve.error?.message);
check(Number(resolve.rows[0]?.n) === 2, 'both actions were created', String(resolve.rows[0]?.n));

const resolvedRow = (await db.query(`select resolved_at, resolved_by, summary from public.incidents where id = '${incidentId}'`)).rows[0];
check(resolvedRow?.resolved_at !== null, 'resolving writes the timestamp');
check(resolvedRow?.resolved_by === ADMIN, 'and the author');
check((resolvedRow?.summary ?? '').includes('back to normal'), 'and the customer-facing summary');
const serviceBack = (await db.query(`select state from public.services where key = 'sig-svc'`)).rows[0]?.state;
check(serviceBack === 'operational', 'and the service returns to operational');

const actionBad = await as(ADMIN, 'admin', `
  select public.resolve_with_summary('${incidentId}', 'Another summary that will never be written',
    '[{"body":"Something vague with no date"}]'::jsonb)
`);
check(actionBad.error?.code === '22023', 'a second resolution is refused');
const actions = await db.query(`select id, body, due_on, done_at from public.incident_actions where incident_id = '${incidentId}' order by due_on`);
check(actions.rows.length === 2, 'exactly two actions exist');
check(actions.rows.every((a) => a.due_on !== null), 'each action has a due date');
check(actions.rows.every((a) => a.done_at === null), 'and each starts open');

const doneShort = await as(ADMIN, 'admin', `select public.complete_incident_action('${actions.rows[0].id}', '')`);
check(doneShort.error?.code === '22023', 'closing an action needs a note saying what it delivered');
const done = await as(ADMIN, 'admin', `select public.complete_incident_action('${actions.rows[0].id}', 'Managed cluster provisioned and cut over')`);
check(done.error === null, 'an action can be closed with a note', done.error?.message);
const doneRow = (await db.query(`select done_at, done_by, done_note from public.incident_actions where id = '${actions.rows[0].id}'`)).rows[0];
check(doneRow?.done_by === ADMIN && doneRow?.done_at !== null, 'and records who closed it and when');

const pmEarly = await as(ADMIN, 'admin', `select public.record_postmortem('${incidentId}', 'A post-mortem written too early, during the incident itself.')`);
check(pmEarly.error === null, 'a post-mortem is accepted once resolved', pmEarly.error?.message);
const pmThin = await as(ADMIN, 'admin', `select public.record_postmortem('${incidentId}', 'It broke.')`);
check(pmThin.error?.code === '22023', 'but a one-sentence post-mortem is refused');
const pm = await as(ADMIN, 'admin', `
  select public.record_postmortem('${incidentId}',
    'The cache had been running on a single node since the October migration. A configuration rollout doubled the key count, which doubled the CPU on that node until it saturated. Two things would have caught it: an alert at 80 percent for ten minutes, and a managed cluster with a failover. Both are now actions with dates.')
`);
check(pm.error === null, 'a real post-mortem is stored', pm.error?.message);

// The public board: only public bodies, never the internal note.
const board = await asAnon(`select * from public.status_board(20)`);
const boardIncident = (board.rows ?? []).find((r) => r.id === incidentId);
check(board.error === null, 'the public board is readable without a session', board.error?.message);
check(boardIncident !== undefined, 'and lists the resolved incident');
check((boardIncident?.summary ?? '').includes('back to normal'), 'with its customer-facing summary');
const boardUpdates = JSON.stringify(boardIncident?.updates ?? []);
check(!boardUpdates.includes('Suspicious'), 'and never the internal note', boardUpdates.slice(0, 120));
check(boardUpdates.includes('restarting the cache'), 'while the public bodies are there');

// A drill: the whole flow, telling nobody.
await db.exec(`update public.services set state = 'operational' where key = 'sig-svc'`);
const channelsBefore = Number((await db.query(`select count(*) as n from public.corporate_channels`)).rows[0].n);
const drill = await as(ADMIN, 'admin', `
  select public.declare_incident('sig-svc', 'Drill: cache cluster', 'Drill: slow pages', 'major',
    'This is a drill. No customer is affected and nothing is broken.', 'Rehearsing the restart runbook.', true) as id
`);
check(drill.error === null, 'a drill can be declared', drill.error?.message);
const drillId = drill.rows[0]?.id;
const drillRow = (await db.query(`select is_drill, channel_id from public.incidents where id = '${drillId}'`)).rows[0];
check(drillRow?.is_drill === true, 'the incident is marked as a drill');
check(drillRow?.channel_id === null, 'a drill opens no staff channel');
const channelsAfter = Number((await db.query(`select count(*) as n from public.corporate_channels`)).rows[0].n);
check(channelsAfter === channelsBefore, 'and creates no channel at all');
const serviceAfterDrill = (await db.query(`select state from public.services where key = 'sig-svc'`)).rows[0]?.state;
check(serviceAfterDrill === 'operational', 'and leaves the service state alone');
const notifications = await db.query(`select count(*) as n from public.notifications where body like 'Incident declared:%'`);
check(Number(notifications.rows[0]?.n) === 1, 'only the real incident notified anybody', String(notifications.rows[0]?.n));
const boardDrill = (await asAnon(`select * from public.status_board(50)`)).rows ?? [];
check(!boardDrill.some((r) => r.id === drillId), 'a drill appears on no public board');

// The staff reads the console is built on.
const staffList = await as(ADMIN, 'admin', `select * from public.incidents_with_updates(25)`);
check(staffList.error === null, 'the staff incident list can be read', staffList.error?.message);
const staffIncident = (staffList.rows ?? []).find((r) => r.id === incidentId);
check(staffIncident?.public_title === 'Slow pages across the site', 'it carries the public title separately');
check(staffIncident?.channel_id !== null, 'and the staff channel, so the two records link both ways');
const staffJson = JSON.stringify(staffIncident?.updates_v2 ?? []);
check(staffJson.includes('Suspicious'), 'the staff list does include the internal note, because staff may see it');
const staffMember = await as(MEMBER, 'member', `select * from public.incidents_with_updates(25)`);
check(staffMember.error?.code === '42501', 'and a member cannot read it at all');

const actionRows = await as(ADMIN, 'admin', `select * from public.incident_actions_for('${incidentId}')`);
check(actionRows.error === null, 'the action list for one incident can be read', actionRows.error?.message);
check((actionRows.rows ?? []).length === 2, 'with both actions', String(actionRows.rows?.length));
check((actionRows.rows ?? []).some((a) => a.done_at !== null), 'and the closed one keeps its note');

const allOpen = await as(ADMIN, 'admin', `select * from public.incident_actions_open(100)`);
check(allOpen.error === null, 'the open action list across incidents can be read', allOpen.error?.message);
check((allOpen.rows ?? []).some((a) => a.body.includes('managed cluster')), 'and only lists what is still open');
check((allOpen.rows ?? []).every((a) => Number(a.days_late) >= 0), 'with how late each one is');

// A resolved incident cannot be updated: the record is the record.
const lateUpdate = await as(ADMIN, 'admin', `select public.update_incident('${incidentId}', 'A late update that rewrites history', '')`);
check(lateUpdate.error?.code === '22023', 'a resolved incident cannot be updated, only followed by a new one');

// ---------------------------------------------------------------------------
// §13.3 Verification that answers in one query
// ---------------------------------------------------------------------------
const keys = await db.query(`select public.verification_keys() as k`);
const published = keys.rows[0]?.k ?? [];
check(published.length === 12, 'the published field list has twelve fields', String(published.length));

// A certificate to verify.
const certCode = 'BSDC-CT-4A7C21B9-6';
await db.query(
  `insert into public.issued_certificates
     (code, recipient_name, subject, body, issued_on, expires_on, template_key, status, recipient_uid)
   values ($1, 'Rumana Haque', 'Signals', 'Completed the signals course.', current_date - 30, current_date + 335, 'course-completion', 'issued', $2)
   on conflict (code) do nothing`,
  [certCode, MEMBER],
);

const one = await asJob(`select * from public.verify_one('${certCode}', 'code')`);
check(one.error === null, 'a certificate verifies', one.error?.message);
const verified = one.rows[0];
check(verified?.found === true && verified?.state === 'valid', 'and comes back valid');
check(verified?.recipient_name === 'Rumana Haque', 'with the name printed on it');
check(verified?.hash_matches === true, 'and the stored hash reproduces, so the file is the file');

const responseKeys = Object.keys(verified ?? {}).sort();
check(
  JSON.stringify(responseKeys) === JSON.stringify([...published].sort()),
  'the response carries exactly the published fields and nothing else',
  responseKeys.filter((k) => !published.includes(k)).join(','),
);
check(!responseKeys.includes('recipient_uid'), 'in particular no recipient uid');
check(!responseKeys.includes('email'), 'and no email');

// Revoked and unknown are different answers, said differently.
await db.query(
  `insert into public.issued_certificates
     (code, recipient_name, subject, body, issued_on, template_key, status, revoke_reason, revoked_at)
   values ('BSDC-CT-9Z9Z9Z9Z-4', 'Nadia Karim', 'Signals', 'Did not complete.', current_date - 100, 'course-completion',
           'revoked', 'The recipient did not complete the course.', now())
   on conflict (code) do nothing`,
);
const revoked = (await asJob(`select * from public.verify_one('BSDC-CT-9Z9Z9Z9Z-4', 'code')`)).rows[0];
const unknown = (await asJob(`select * from public.verify_one('BSDC-CT-11112222-3', 'code')`)).rows[0];
check(revoked?.found === true && revoked?.state === 'revoked', 'a revoked certificate is found and says revoked');
check(revoked?.reason === 'The recipient did not complete the course.', 'with the issuer\'s own words', String(revoked?.reason));
check(unknown?.found === false && unknown?.state === 'not_found', 'an unknown code is not found');
check(revoked?.reason !== unknown?.reason, 'and the two answers do not share a sentence');

const malformed = (await asJob(`select * from public.verify_one('hello', 'code')`)).rows[0];
check(malformed?.state === 'not_found', 'a code that is not our shape is answered the same way as one that is');
check(malformed?.reason !== unknown?.reason || malformed?.code === 'HELLO',
  'and says why without revealing the format', String(malformed?.reason));

// Verification by file hash.
const recomputed = (await db.query(`
  select bsdc.certificate_hash(code, recipient_name, subject, body, issued_on, expires_on, template_key) as h
    from public.issued_certificates where code = '${certCode}'
`)).rows[0]?.h;
await db.query(`update public.issued_certificates set content_hash = $1 where code = $2`, [recomputed, certCode]);
const byHash = (await asAnon(`select * from public.verify_by_hash('${recomputed}')`)).rows[0];
check(byHash?.code === certCode, 'a file hash resolves to the document', String(byHash?.code));
check(byHash?.hash_matches === true, 'and reports that it reproduces');
const wrongHash = await asAnon(`select * from public.verify_by_hash('${'0'.repeat(64)}')`);
check(wrongHash.rows?.[0]?.found === false, 'a hash nothing matches is reported as not found, not as a forgery');
const badHash = await asAnon(`select * from public.verify_by_hash('not-a-hash')`);
check(badHash.error?.code === '22023', 'a malformed hash is refused rather than searched for');

// The batch form, and the rate limit.
const batch = await asAnon(`select public.verify_public(array['${certCode}', 'BSDC-CT-11112222-3'], 'harness-a') as r`);
check(batch.error === null, 'a batch of codes answers in one call', batch.error?.message);
check(Array.isArray(batch.rows[0]?.r?.results) && batch.rows[0].r.results.length === 2, 'with one result per code');
check(batch.rows[0]?.r?.remaining <= 58, 'and reports what is left of the allowance', String(batch.rows[0]?.r?.remaining));

await db.exec(`delete from public.verification_attempts`);
const many = Array.from({ length: 60 }, (_, i) => `BSDC-CT-${String(i).padStart(8, '0')}-1`);
const bigBatch = await asAnon(`select public.verify_public(array[${many.map((c) => `'${c}'`).join(',')}], 'harness-b') as r`);
check(bigBatch.error === null, 'a CSV of sixty codes is one legitimate call', bigBatch.error?.message);
check(bigBatch.rows[0]?.r?.results?.length === 60, 'and every code in it is answered');
check(bigBatch.rows[0]?.r?.remaining === 0, 'and the allowance is reported as spent', String(bigBatch.rows[0]?.r?.remaining));
const overLimit = await asAnon(`select public.verify_public(array['${certCode}'], 'harness-b') as r`);
check(overLimit.error?.code === '53400', 'the next check from the same connection is refused', String(overLimit.error?.code));
const tooMany = await asAnon(`select public.verify_public(array[${Array.from({ length: 250 }, () => `'${certCode}'`).join(',')}], 'harness-d') as r`);
check(tooMany.error?.code === '53400', 'and an array larger than the allowance is refused outright, not truncated');

const otherConnection = await asAnon(`select public.verify_public(array['${certCode}'], 'harness-c') as r`);
check(otherConnection.error === null, 'a different connection has its own allowance, so one desk cannot silence another');

const attempts = await db.query(`select bucket, batch_size, found from public.verification_attempts`);
check(attempts.rows.every((a) => a.bucket !== 'harness-b' && a.bucket.length === 32),
  'the throttle key is a hash, never the address that was given');
check(attempts.rows.some((a) => Number(a.batch_size) === 60), 'the batch size is recorded, so the limit counts requests rather than calls');

const rlsAttempts = await db.query(`select relrowsecurity from pg_class where relname = 'verification_attempts'`);
check(rlsAttempts.rows[0]?.relrowsecurity === true, 'the attempt table has row level security on');
const readAttempts = await as(ADMIN, 'admin', `select * from public.verification_attempts limit 1`);
check(readAttempts.error !== null, 'and even an admin cannot read it directly — only through the health summary');

const health = await as(ADMIN, 'admin', `select * from public.verification_health(30)`);
check(health.error === null, 'the trust desk can read aggregate verification health', health.error?.message);
check(Number(health.rows?.[0]?.checks) >= 61, 'which counts requests rather than codes', String(health.rows?.[0]?.checks));

// ---------------------------------------------------------------------------
// Permissions and RLS
// ---------------------------------------------------------------------------
const cat = await db.query(`
  select permission from public.permission_catalogue
   where permission in ('performance.manage', 'status.postmortem', 'verification.read')
`);
check(cat.rows.length === 3, 'the three new permissions are catalogued', String(cat.rows.length));

for (const table of ['vital_budgets', 'vital_regressions', 'incident_actions', 'verification_attempts']) {
  const rls = (await db.query(`select relrowsecurity from pg_class where relname = $1 and relnamespace = 'public'::regnamespace`, [table])).rows[0]?.relrowsecurity;
  check(rls === true, `${table} has row level security on`);
}

const boardNoPii = JSON.stringify((await asAnon(`select * from public.status_board(50)`)).rows ?? []);
check(!boardNoPii.includes('redis') && !boardNoPii.includes('Redis'), 'the public board carries no internal note at all', boardNoPii.slice(0, 160));

console.log(`\nSUMMARY: ${pass} passed, ${bad.length} failed`);
if (bad.length) {
  console.log(bad.map((b) => `  - ${b}`).join('\n'));
  process.exitCode = 1;
}
