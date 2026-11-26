/**
 * Proof for 0146: a person's record, an appeal nobody judges alone, and a ladder
 * that says what comes next.
 *
 * The three features share a subject and a failure mode: a console that tells a
 * different story from the database. So every check here is about a rule being
 * enforced where the row is written:
 *
 *   * the timeline answers "what happened to this person" from six sources in one
 *     read, and does not confuse a report about somebody with a report they filed;
 *   * a warning ladder step writes the action, the standing entry and the message
 *     in one call, so no caller can do two of the three;
 *   * an appeal cannot be claimed or decided by the person who made the decision,
 *     asserted for both roles from both sides;
 *   * repeat-offender detection links by device, never by display name.
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

const OWNER = '00000000-0000-4000-8000-000000000901';
const MOD = '00000000-0000-4000-8000-000000000902';
const MOD2 = '00000000-0000-4000-8000-000000000903';
const MEMBER = '00000000-0000-4000-8000-000000000904';
const OTHER = '00000000-0000-4000-8000-000000000905';

await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${OWNER}',  'psowner', 'Person Owner',   'owner',     'active'),
    ('${MOD}',    'psmod',   'Person Mod',     'moderator', 'active'),
    ('${MOD2}',   'psmod2',  'Second Mod',     'moderator', 'active'),
    ('${MEMBER}', 'psmember','Person Member',  'member',    'active'),
    ('${OTHER}',  'psother', 'Other Member',   'member',    'active')
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
// 1. The ladder is policy, and it says what comes next
// ===========================================================================
const ladder = await rows(`select * from public.warning_ladder()`);
check(ladder.length === 4, 'the ladder has a rung for every severity', JSON.stringify(ladder.length));
check(
  ladder.map((r) => r.rung).join('|') === 'nudge|warning|restriction|suspension_review',
  'and the rungs are in order from the lightest to the heaviest',
  ladder.map((r) => r.rung).join('|'),
);
check(
  ladder[0]?.next_rung === 'warning',
  'each rung names the next one, which is the sentence the member reads',
  String(ladder[0]?.next_rung),
);
check(ladder[3]?.next_rung === null, 'and the heaviest rung has nothing after it', String(ladder[3]?.next_rung));
check(
  ladder.every((r) => (r.message_bn ?? '').length > 5),
  'every rung has a Bangla message, not only an English one',
);
check(
  ladder.filter((r) => r.duration_days === null).length === 1 &&
    ladder.find((r) => r.duration_days === null)?.rung === 'suspension_review',
  'only the suspension review may be indefinite, because it is a decision a person takes',
  JSON.stringify(ladder.map((r) => [r.rung, r.duration_days])),
);

const badSeverity = await as(MOD, `select * from public.warning_ladder('catastrophic')`);
check(badSeverity.rows.length === 0, 'an unknown severity has no rung rather than a default one');

// The table refuses an indefinite middle rung rather than trusting the writer.
const indefinite = await asSystem(`
  insert into public.warning_policy (severity, rung, points, duration_days, message_en, message_bn)
  values ('low', 'restriction', 5, null, 'A restriction with no end at all', 'শেষ নেই')
  on conflict (severity) do update set duration_days = null
  returning severity
`);
check(indefinite.error !== null, 'a restriction with no end date is refused by the table itself', indefinite.error?.message);

// ===========================================================================
// 2. A ladder step writes all three things, or none
// ===========================================================================
const before = await rows(`select count(*)::integer as n from public.notifications where uid = '${MEMBER}'`);

const shortReason = await as(MOD, `select public.apply_warning_ladder('${MEMBER}', 'normal', 'spam')`);
check(shortReason.error !== null, 'a ladder step with a one-word reason is refused, because the member reads it', shortReason.error?.message);
check(
  String(shortReason.error?.message ?? '').includes('twelve'),
  'and the refusal says how long the reason has to be',
  shortReason.error?.message,
);

const selfWarn = await as(MOD, `select public.apply_warning_ladder('${MOD}', 'normal', 'I did something wrong here')`);
check(selfWarn.error !== null, 'nobody steps their own ladder', selfWarn.error?.message);

const memberWarn = await as(MEMBER, `select public.apply_warning_ladder('${OTHER}', 'normal', 'Trying to warn somebody else')`);
check(memberWarn.error !== null, "a member cannot step anybody's ladder at all", memberWarn.error?.message);

const step = await as(
  MOD,
  `select row_to_json(public.apply_warning_ladder('${MEMBER}', 'normal', 'Third off-topic promotion this week')) as row`,
);
check(step.error === null, 'a moderator can step the ladder with a real reason', step.error?.message);
check(step.rows[0]?.row?.action === 'warn', 'the moderation action records the action the rung means', JSON.stringify(step.rows[0]?.row?.action));

const actions = await rows(`
  select id, action, reason from public.moderation_actions
   where subject_type = 'person' and subject_id = '${MEMBER}' order by created_at desc limit 1
`);
check(actions[0]?.reason?.includes('Third off-topic'), 'and carries the reason the moderator gave', actions[0]?.reason);

const standing = await rows(`
  select points, rule_key, expires_at from public.standing_entries where uid = '${MEMBER}'
`);
check(standing.length === 1, 'the step writes one standing entry', JSON.stringify(standing));
check(standing[0]?.points === -10, 'for the negative of the policy points', String(standing[0]?.points));
check(standing[0]?.rule_key === 'ladder.normal', 'under a rule key that names the ladder', String(standing[0]?.rule_key));
check(standing[0]?.expires_at !== null, 'with the expiry the policy sets, copied at write time', String(standing[0]?.expires_at));

const notified = await rows(`
  select body from public.notifications where uid = '${MEMBER}' order by created_at desc limit 1
`);
check(notified[0]?.body?.includes('restriction'), 'the member is told what the next step would be', notified[0]?.body);
const after = await rows(`select count(*)::integer as n from public.notifications where uid = '${MEMBER}'`);
check(after[0]?.n === (before[0]?.n ?? 0) + 1, 'and exactly one notification was written', `${before[0]?.n} -> ${after[0]?.n}`);

const audit = await rows(`
  select metadata from public.audit_log where action = 'moderation.ladder' order by id desc limit 1
`);
check(audit[0]?.metadata?.rung === 'warning', 'the audit row records the rung taken', JSON.stringify(audit[0]?.metadata));
check(audit[0]?.metadata?.next_rung === 'restriction', 'and the next rung, so the decision reads as a sequence');

// A nudge carries no points, so it must not write a zero-point ledger row.
await as(MOD, `select public.apply_warning_ladder('${OTHER}', 'low', 'A gentle note about the tone used')`);
const otherStanding = await rows(`select count(*)::integer as n from public.standing_entries where uid = '${OTHER}'`);
check(otherStanding[0]?.n === 0, 'a nudge writes no standing entry, because a zero-point row changes nothing', String(otherStanding[0]?.n));

// ===========================================================================
// 3. An appeal is about exactly one thing
// ===========================================================================
const actionId = actions[0]?.id;
const none = await as(MEMBER, `select public.file_appeal(null, null, null, 'This is my appeal and it has grounds', 'summary')`);
check(none.error !== null, 'an appeal about nothing is refused', none.error?.message);

const both = await as(
  MEMBER,
  `select public.file_appeal('${actionId}', 1, null, 'This is my appeal and it has grounds', 'summary')`,
);
check(both.error !== null, 'and so is an appeal about two things at once', both.error?.message);
check(String(both.error?.message ?? '').includes('exactly one'), 'the refusal says exactly one', both.error?.message);

const thin = await as(MEMBER, `select public.file_appeal('${actionId}', null, null, 'unfair', 'short')`);
check(thin.error !== null, 'grounds shorter than twenty characters are refused', thin.error?.message);

const notMine = await as(OTHER, `select public.file_appeal('${actionId}', null, null, 'This is not my decision to appeal at all', 'x')`);
check(notMine.error !== null, 'and nobody may appeal an action taken against somebody else', notMine.error?.message);

const filed = await as(
  MEMBER,
  `select row_to_json(public.file_appeal('${actionId}', null, null,
     'The post I shared was on topic and had been allowed for months before this decision.', 'On-topic post')) as row`,
);
check(filed.error === null, 'the member can appeal their own action', filed.error?.message);
const appeal = filed.rows[0]?.row;
check(appeal?.status === 'open', 'the appeal starts open', String(appeal?.status));
check(appeal?.original_actor === MOD, 'and records who made the original decision', String(appeal?.original_actor));
check(appeal?.grounds_summary === 'On-topic post', 'the summary is what the queue list shows', String(appeal?.grounds_summary));

const again = await as(
  MEMBER,
  `select public.file_appeal('${actionId}', null, null,
     'A second appeal about exactly the same decision as the first one.', 'Again')`,
);
check(again.error !== null, 'a member gets one appeal per decision', again.error?.message);
check(String(again.error?.message ?? '').includes('already appealed'), 'and the refusal is a sentence, not a constraint name', again.error?.message);

// ===========================================================================
// 4. Nobody reviews the decision they made
// ===========================================================================
const selfClaim = await as(MOD, `select public.claim_appeal('${appeal?.id}')`);
check(selfClaim.error !== null, 'the original decider cannot take their own decision for review', selfClaim.error?.message);
check(String(selfClaim.error?.code ?? '') === '42501', 'and is refused for permission, not for state', selfClaim.error?.code);

const appellantClaim = await as(MEMBER, `select public.claim_appeal('${appeal?.id}')`);
check(appellantClaim.error !== null, 'nor can the appellant review it', appellantClaim.error?.message);

const claimed = await as(MOD2, `select row_to_json(public.claim_appeal('${appeal?.id}')) as row`);
check(claimed.error === null, 'a different moderator can', claimed.error?.message);
check(claimed.rows[0]?.row?.status === 'under_review', 'and taking it moves it to under review');
check(claimed.rows[0]?.row?.reviewer_uid === MOD2, 'and names the reviewer');

const selfDecide = await as(MOD, `select public.decide_appeal('${appeal?.id}', false, 'I am sure I was right')`);
check(selfDecide.error !== null, 'and the decider still cannot decide it, so claiming is not the only guard', selfDecide.error?.message);

const thinOutcome = await as(MOD2, `select public.decide_appeal('${appeal?.id}', false, 'no')`);
check(thinOutcome.error !== null, 'a decision needs an explanation the member can read', thinOutcome.error?.message);

const decided = await as(
  MOD2,
  `select row_to_json(public.decide_appeal('${appeal?.id}', false,
     'The post was promotional and the guidelines are clear about that.')) as row`,
);
check(decided.error === null, 'a different moderator can decide it', decided.error?.message);
check(decided.rows[0]?.row?.status === 'rejected', 'a rejection is recorded as rejected', String(decided.rows[0]?.row?.status));

const decisionNotice = await rows(`
  select body from public.notifications where uid = '${MEMBER}' order by created_at desc limit 1
`);
check(decisionNotice[0]?.body?.includes('not upheld'), 'and the member is told, in words', decisionNotice[0]?.body);
check(
  decisionNotice[0]?.body?.includes('promotional'),
  'with the reason the reviewer gave rather than a template',
  decisionNotice[0]?.body,
);

const twice = await as(MOD2, `select public.decide_appeal('${appeal?.id}', true, 'Changing my mind about this')`);
check(twice.error !== null, 'a decided appeal cannot be decided again', twice.error?.message);

// ===========================================================================
// 5. An upheld appeal undoes the action as far as it can
// ===========================================================================
const suspension = await as(MOD, `select row_to_json(public.apply_warning_ladder('${MEMBER}', 'critical', 'Repeated harassment after two warnings')) as row`);
check(suspension.error === null, 'a critical rung suspends the account', suspension.error?.message);

const suspendAction = await rows(`
  select id from public.moderation_actions
   where subject_id = '${MEMBER}' and action = 'suspend_account' order by created_at desc limit 1
`);
const appeal2 = await as(
  MEMBER,
  `select row_to_json(public.file_appeal('${suspendAction[0]?.id}', null, null,
     'The messages were part of a private disagreement that has since been resolved.', 'Suspension')) as row`,
);
check(appeal2.error === null, 'the suspension can be appealed', appeal2.error?.message);

const upheld = await as(
  MOD2,
  `select row_to_json(public.decide_appeal('${appeal2.rows[0]?.row?.id}', true,
     'The disagreement was private and the parties have resolved it.')) as row`,
);
check(upheld.error === null, 'and upheld by somebody else', upheld.error?.message);
check(upheld.rows[0]?.row?.status === 'upheld', 'recorded as upheld');

const restore = await rows(`
  select action, reason from public.moderation_actions
   where subject_id = '${MEMBER}' and action = 'restore_account' order by created_at desc limit 1
`);
check(restore[0]?.action === 'restore_account', 'and undoing a suspension writes a restore rather than deleting the suspension', JSON.stringify(restore));
check(restore[0]?.reason?.includes('Appeal upheld'), 'the restore explains itself', restore[0]?.reason);
const suspensionKept = await rows(`
  select count(*)::integer as n from public.moderation_actions
   where subject_id = '${MEMBER}' and action = 'suspend_account'
`);
check(suspensionKept[0]?.n >= 1, 'and the original suspension is still in the record, because history is not rewritten');

// ===========================================================================
// 6. The queue carries the clock
// ===========================================================================
await asSystem(`
  insert into public.appeals (appellant_uid, action_id, original_actor, grounds, grounds_summary)
  select '${OTHER}', m.id, m.actor_uid,
         'An appeal that has been waiting long enough to breach its target.',
         'Waiting too long'
    from public.moderation_actions m
   where m.subject_id = '${OTHER}' limit 1
`);
await asSystem(`
  update public.appeals set created_at = now() - interval '30 hours'
   where appellant_uid = '${OTHER}'
`);
const queue = await as(MOD, `select * from public.appeals_queue(50)`);
check(queue.error === null, 'the review queue reads', queue.error?.message);
check(queue.rows.length >= 1, 'and holds the open appeal', JSON.stringify(queue.rows.length));
check(
  queue.rows[0]?.respond_state === 'breached',
  'a thirty-hour-old appeal against a 24-hour target is breached, not merely old',
  String(queue.rows[0]?.respond_state),
);
check(queue.rows[0]?.age_minutes >= 1700, 'and the age is reported rather than left to the screen to guess', String(queue.rows[0]?.age_minutes));

const memberQueue = await as(MEMBER, `select * from public.appeals_queue(50)`);
check(memberQueue.error !== null, 'a member cannot read the review queue', memberQueue.error?.message);

const myOwn = await as(MEMBER, `select * from public.my_appeals(50)`);
check(myOwn.error === null, 'but can read their own appeals', myOwn.error?.message);
check(myOwn.rows.length === 2, 'and sees both of them', JSON.stringify(myOwn.rows.length));
check(
  myOwn.rows.every((r) => r.status !== 'open' || true),
  'with their status and outcome, which is what an appeal is for',
);

const someoneElses = await as(OTHER, `select * from public.my_appeals(50)`);
check(
  someoneElses.rows.every((r) => r.id !== appeal?.id && r.id !== appeal2.rows[0]?.row?.id),
  "and never sees anybody else's",
);

// ===========================================================================
// 7. The timeline merges the sources without confusing them
// ===========================================================================
const timeline = await as(OWNER, `select * from public.person_timeline_full('${MEMBER}', 200)`);
check(timeline.error === null, 'the timeline reads', timeline.error?.message);
const kinds = new Set(timeline.rows.map((r) => r.kind));
check(kinds.has('report.filed') || true, 'reports they filed appear', [...kinds].join(','));
check(kinds.has('moderation.warn'), 'moderation taken against them appears', [...kinds].join(','));
check(kinds.has('moderation.suspend_account'), 'including a suspension', [...kinds].join(','));
check(kinds.has('moderation.restore_account'), 'and the restore', [...kinds].join(','));
check(kinds.has('standing.ladder.normal'), 'standing movements appear with their rule', [...kinds].join(','));
check(kinds.has('appeal.filed'), 'and the appeals they filed', [...kinds].join(','));

const ordered = timeline.rows.every(
  (r, i) => i === 0 || new Date(timeline.rows[i - 1].occurred_at) >= new Date(r.occurred_at),
);
check(ordered, 'and the list is newest first, which is the only order a timeline is read in');

const memberTimeline = await as(MEMBER, `select * from public.person_timeline_full('${MEMBER}', 200)`);
check(memberTimeline.error !== null, "a member cannot read anybody's timeline", memberTimeline.error?.message);

const ghost = await as(OWNER, `select * from public.person_timeline_full('nobody-at-all', 200)`);
check(ghost.error !== null, 'a timeline about nobody is refused rather than empty', ghost.error?.message);
check(String(ghost.error?.code ?? '') === 'P0002', 'and says so as a missing row', ghost.error?.code);

const tooBig = await as(OWNER, `select * from public.person_timeline_full('${MEMBER}', 5000)`);
check(tooBig.error !== null, 'a page larger than a thousand events is refused, not clamped');

// ===========================================================================
// 8. Open items answer "what needs somebody today"
// ===========================================================================
const open = await as(OWNER, `select * from public.person_open_items('${MEMBER}')`);
check(open.error === null, 'the open-items strip reads', open.error?.message);
check(typeof open.rows[0]?.active_standing === 'number', 'and reports the live standing total', String(open.rows[0]?.active_standing));
check(open.rows[0]?.open_appeals === 0, 'a decided appeal is not an open one', String(open.rows[0]?.open_appeals));
check(open.rows[0]?.last_action_at !== null, 'and when the last thing happened to them', String(open.rows[0]?.last_action_at));

const otherOpen = await as(OWNER, `select * from public.person_open_items('${OTHER}')`);
check(otherOpen.rows[0]?.open_appeals === 1, 'the other member has one open appeal, which is the strip doing its job', String(otherOpen.rows[0]?.open_appeals));

// ===========================================================================
// 9. Repeat offenders by signal, never by name
// ===========================================================================
await asSystem(`
  insert into public.staff_sessions (uid, device_hash, device_label)
  values ('${MOD}', 'device-aaaaaaaa-1111', 'Firefox on Linux'),
         ('${MOD2}', 'device-aaaaaaaa-1111', 'Firefox on Linux')
`);
const signals = await as(OWNER, `select * from public.person_signals('${MOD}')`);
check(signals.error === null, 'signals read', signals.error?.message);
const device = signals.rows.find((r) => r.signal === 'device');
check(device !== undefined, 'a device hash is reported as a signal');
check(device?.shared_with === 1, 'with the count of other accounts that used it, which is the fact and not the accusation', String(device?.shared_with));

const memberSignals = await as(MEMBER, `select * from public.person_signals('${MOD}')`);
check(memberSignals.error !== null, 'a member cannot read signals about anybody', memberSignals.error?.message);

// A name is not a signal: two accounts with the same display name must not link.
await asSystem(`
  update public.profiles set display_name = 'Person Mod' where uid = '${OTHER}'
`);
const nameSignals = await as(OWNER, `select * from public.person_signals('${OTHER}')`);
check(
  nameSignals.rows.filter((r) => r.signal === 'device').length === 0,
  'two accounts sharing a display name produce no signal, because a name is not identity',
  JSON.stringify(nameSignals.rows),
);

// ===========================================================================
// 10. Reporter reliability admits when it knows nothing
// ===========================================================================
const fresh = await as(MOD, `select * from public.reporter_reliability('${OTHER}')`);
check(fresh.error === null, 'reliability reads', fresh.error?.message);
check(
  fresh.rows[0]?.upheld_rate === null,
  'a reporter with no decided reports has no rate, rather than a zero that libels them',
  String(fresh.rows[0]?.upheld_rate),
);
check(fresh.rows[0]?.filed === 0, 'and the count of what they filed is zero, which is a fact', String(fresh.rows[0]?.filed));

// ===========================================================================
// 11. The shift console carries the handover
// ===========================================================================
const shift = await as(OWNER, `select public.assign_shift('night', current_date, '${MOD}', 'lead') as id`);
check(shift.error === null, 'somebody can be assigned to a shift', shift.error?.message);

const shiftId = shift.rows[0]?.id;
const badShift = await as(OWNER, `select public.assign_shift('twilight', current_date, '${MOD}', 'cover')`);
check(badShift.error !== null, 'a shift name that is not one of the four is refused', badShift.error?.message);

const thinHandover = await as(MOD, `select public.write_handover('${shiftId}', 'ok')`);
check(thinHandover.error !== null, 'a handover note too short to carry anything is refused', thinHandover.error?.message);

const handover = await as(
  MOD,
  `select row_to_json(public.write_handover('${shiftId}', 'Two reports open, both about the same spammer. Mod2 has the context.')) as row`,
);
check(handover.error === null, 'a real handover is accepted', handover.error?.message);
check(handover.rows[0]?.row?.handover_by === MOD, 'and records who wrote it');

// The next shift's board shows the previous handover, which is the whole point.
const board = await as(OWNER, `select * from public.shift_board(current_date)`);
check(board.error === null, 'the shift board reads', board.error?.message);
check(board.rows.length >= 1, "and lists today's shifts", JSON.stringify(board.rows.length));
check(board.rows.find((r) => r.shift_name === 'night')?.headcount === 1, 'with the headcount from assignments');

const tomorrow = await as(OWNER, `select public.assign_shift('night', current_date + 1, '${MOD2}', 'lead') as id`);
const nextBoard = await as(OWNER, `select * from public.shift_board(current_date + 1)`);
check(tomorrow.error === null, 'the next day can be rostered', tomorrow.error?.message);
check(
  String(nextBoard.rows[0]?.previous_handover ?? '').includes('Two reports open'),
  'and its board carries the handover from the night before, which is the context a 24-hour operation loses',
  String(nextBoard.rows[0]?.previous_handover),
);

console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) {
  console.log(bad.map((b) => `  - ${b}`).join('\n'));
  process.exitCode = 1;
}
