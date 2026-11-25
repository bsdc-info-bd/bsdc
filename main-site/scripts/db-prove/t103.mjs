/**
 * Proof for 0143: a standing ledger, and a cache that is checked against it.
 *
 * The point of this file is the word *checked*. A cache beside a ledger will
 * diverge; what matters is that the divergence is detectable, attributable and
 * repairable. So the checks walk:
 *
 *   * the cache equals the sum after every write, including a revocation and an
 *     expiry — and a stale cache is *found* by `standing_reconcile` rather than
 *     quietly believed;
 *   * an expired entry stops counting without being deleted, so the history is
 *     still there and still says what happened;
 *   * a revoked entry keeps its points and its reason, and stops counting;
 *   * a rule marked manual-only cannot be applied by nobody at all;
 *   * a rule's default does not get retroactively rewritten when the rule changes.
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

const OWNER = '00000000-0000-4000-8000-000000000601';
const MOD = '00000000-0000-4000-8000-000000000602';
const MEMBER = '00000000-0000-4000-8000-000000000603';
const OTHER = '00000000-0000-4000-8000-000000000604';

await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${OWNER}',  'standowner',  'Standing Owner',  'owner',     'active'),
    ('${MOD}',    'standmod',    'Standing Mod',    'moderator', 'active'),
    ('${MEMBER}', 'standmember', 'Standing Member', 'member',    'active'),
    ('${OTHER}',  'standother',  'Standing Other',  'member',    'active')
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
const cached = async (uid) =>
  Number((await rows(`select standing_points from public.profiles where uid = '${uid}'`))[0]?.standing_points);
const ledger = async (uid) =>
  Number((await rows(`select bsdc.standing_total('${uid}') as n`))[0]?.n);

// ===========================================================================
// 1. The rules are data, and a rule that does not exist is refused
// ===========================================================================
const ruleCount = await rows(`select count(*)::int as n from public.standing_rules`);
check(Number(ruleCount[0]?.n) >= 10, 'the rule keyboard is seeded', JSON.stringify(ruleCount[0]?.n));

const rulesReadable = await as(MEMBER, `select key, label from public.standing_rules limit 3`);
check(rulesReadable.rows.length === 3, 'a member can read the rules, so a penalty can be looked up', rulesReadable.error?.message ?? '');

const unknownRule = await as(MOD, `select public.person_standing_adjust('${MEMBER}', 'made.up.rule', 'because I said so')`);
check(unknownRule.error !== null, 'a rule key that is not in the table is refused', unknownRule.error?.message ?? 'accepted');
check(
  String(unknownRule.error?.message ?? '').includes('standing_rules'),
  'and the refusal points at the table rather than at a function body',
  unknownRule.error?.message,
);

// A free-text penalty is exactly what the table exists to prevent, so check that
// the entry cannot be written without a rule at all.
const noRule = await asSystem(`
  insert into public.standing_entries (uid, points, reason, rule_key)
  values ('${MEMBER}', -50, 'I did not like them', 'invented.on.the.spot')
`);
check(noRule.error !== null, 'and the table refuses an entry whose rule does not exist', noRule.error?.message ?? 'accepted');

// ===========================================================================
// 2. An entry moves the cache
// ===========================================================================
const before = await cached(MEMBER);
check(before === 0, 'a member starts at zero', JSON.stringify(before));

const warned = await as(
  MOD,
  `select public.person_standing_adjust('${MEMBER}', 'warning.official',
     'Warned after a second complaint about the same thread')`,
);
check(warned.error === null, 'a moderator applies an official warning', warned.error?.message ?? '');

const afterWarn = await cached(MEMBER);
check(afterWarn === -10, 'the cache moves by the rule default, not by whatever the caller felt', JSON.stringify(afterWarn));
check((await ledger(MEMBER)) === afterWarn, 'and the ledger agrees', `${await ledger(MEMBER)} vs ${afterWarn}`);

const rule = await rows(`select default_points from public.standing_rules where key = 'warning.official'`);
check(Number(rule[0]?.default_points) === -10, 'the rule holds the number', JSON.stringify(rule[0]?.default_points));

// An explicit number overrides the default, which is what a judgement needs.
const custom = await as(
  MOD,
  `select public.person_standing_adjust('${MEMBER}', 'warning.minor',
     'A smaller penalty than the rule suggests, because the thread was provoked', -1)`,
);
check(custom.error === null, 'an explicit number overrides the rule default', custom.error?.message ?? '');
check((await cached(MEMBER)) === -11, 'and both entries count', JSON.stringify(await cached(MEMBER)));

// Zero is refused: an entry worth nothing is a comment.
const zero = await as(
  MOD,
  `select public.person_standing_adjust('${MEMBER}', 'warning.minor', 'Worth nothing at all', 0)`,
);
check(zero.error !== null, 'an entry worth nothing is refused', zero.error?.message ?? 'accepted');

// ===========================================================================
// 3. A rule's default does not rewrite history
// ===========================================================================
// A penalty is what it was when it was applied. If tuning the rule changed old
// entries, a member's score would move for something they did a year ago.
await asSystem(`update public.standing_rules set default_points = -50 where key = 'warning.official'`);
const afterRetune = await ledger(MEMBER);
check(afterRetune === -11, 'tuning a rule leaves existing entries alone', `${afterRetune} vs -11`);
await asSystem(`update public.standing_rules set default_points = -10 where key = 'warning.official'`);

// ===========================================================================
// 4. Revocation keeps the evidence
// ===========================================================================
const entryId = Number(warned.rows[0]?.person_standing_adjust);
const revoked = await as(
  MOD,
  `select public.revoke_standing_entry(${entryId}, 'The second complaint was the same person, not a second incident')`,
);
check(revoked.error === null, 'a moderator corrects an entry', revoked.error?.message ?? '');

const afterRevoke = await cached(MEMBER);
check(afterRevoke === -1, 'the revoked entry stops counting', JSON.stringify(afterRevoke));
check((await ledger(MEMBER)) === afterRevoke, 'and the ledger agrees', `${await ledger(MEMBER)}`);

const kept = await rows(
  `select points, reason, revoked_at is not null as revoked, revoke_reason
     from public.standing_entries where id = ${entryId}`,
);
check(kept.length === 1, 'the entry still exists, so the history is intact');
check(kept[0]?.revoked === true, 'marked as revoked', JSON.stringify(kept[0]?.revoked));
check(
  String(kept[0]?.revoke_reason ?? '').includes('same person'),
  'with the reason it was wrong, which is the thing that makes it a correction',
  kept[0]?.revoke_reason,
);
check(Number(kept[0]?.points) === -10, 'and the points it originally carried', JSON.stringify(kept[0]?.points));

const revokeTwice = await as(MOD, `select public.revoke_standing_entry(${entryId}, 'again and again')`);
check(revokeTwice.error !== null, 'revoking twice is refused rather than silently counted', revokeTwice.error?.message ?? 'accepted');

const revokeNoReason = await as(
  MOD,
  `select public.revoke_standing_entry(${Number(custom.rows[0]?.person_standing_adjust)}, '')`,
);
check(revokeNoReason.error !== null, 'a correction with no reason is refused', revokeNoReason.error?.message ?? 'accepted');

const directRevoke = await asSystem(
  `update public.standing_entries set revoked_at = now() where id = ${entryId + 1}`,
);
check(directRevoke.error !== null, 'and a bare UPDATE cannot revoke without a reason either', directRevoke.error?.message ?? 'accepted');

// ===========================================================================
// 5. An expiry stops the entry counting, without deleting it
// ===========================================================================
const shortLived = await as(
  MOD,
  `select public.person_standing_adjust('${MEMBER}', 'warning.minor',
     'A short penalty that wears off in a day', null, 1)`,
);
check(shortLived.error === null, 'an entry can be given its own window', shortLived.error?.message ?? '');
const withShort = await cached(MEMBER);
check(withShort === -4, 'and counts while it lasts', JSON.stringify(withShort));

const expireEntry = Number(shortLived.rows[0]?.person_standing_adjust);
// Backdate the expiry rather than waiting a day: PGlite freezes now(), so the row
// has to be aged rather than the clock moved.
await asSystem(`
  update public.standing_entries
     set expires_at = now() - interval '1 second',
         created_at = now() - interval '2 days'
   where id = ${expireEntry}
`);
const recomputed = await rows(`select bsdc.standing_total('${MEMBER}') as n`);
check(Number(recomputed[0]?.n) === -1, 'an expired entry stops contributing to the sum', JSON.stringify(recomputed[0]?.n));

const stillThere = await rows(`select count(*)::int as n from public.standing_entries where id = ${expireEntry}`);
check(Number(stillThere[0]?.n) === 1, 'but is not deleted, so the history still says what happened', JSON.stringify(stillThere[0]?.n));

// Backdating the row fires the trigger, so the cache is already right. That is the
// point of the trigger. The divergence the reconciliation exists for is the other
// kind: a cache that is wrong for any reason at all, including one this test has to
// manufacture because a frozen clock cannot wait a day for it to happen naturally.
check((await cached(MEMBER)) === -1, 'the trigger already recomputed the cache when the expiry moved', JSON.stringify(await cached(MEMBER)));

// Now make it wrong on purpose, the way a crashed backfill or a hand-run UPDATE
// would leave it, and check that the reconciliation is what finds it.
await asSystem(`update public.profiles set standing_points = -4 where uid = '${MEMBER}'`);
const staleCache = await cached(MEMBER);
check(staleCache === -4, 'the cache is now wrong, which is the situation the reconciliation exists for', JSON.stringify(staleCache));

// ===========================================================================
// 6. Reconciliation finds it, and repair fixes it
// ===========================================================================
const reconcile = await as(MOD, `select * from public.standing_reconcile(200)`);
check(reconcile.error === null, 'a moderator runs the reconciliation', reconcile.error?.message ?? '');
const found = reconcile.rows.find((r) => r.uid === MEMBER);
check(found !== undefined, 'and the stale member is in the result', JSON.stringify(reconcile.rows.map((r) => r.uid)));
check(Number(found?.cached_points) === -4, 'with the cached number', JSON.stringify(found?.cached_points));
check(Number(found?.ledger_points) === -1, 'and the ledger number', JSON.stringify(found?.ledger_points));
check(Number(found?.difference) === -3, 'and the difference between them', JSON.stringify(found?.difference));

// The other member is untouched and does not appear.
check(
  reconcile.rows.find((r) => r.uid === OTHER) === undefined,
  'a member whose cache agrees is not listed',
  JSON.stringify(reconcile.rows.map((r) => r.uid)),
);

const repaired = await as(MOD, `select public.repair_standing(200) as n`);
check(Number(repaired.rows[0]?.n) === 1, 'the repair fixes one member', JSON.stringify(repaired.rows[0]?.n));
check((await cached(MEMBER)) === -1, 'and the cache now equals the ledger', JSON.stringify(await cached(MEMBER)));

const reconcileAfter = await as(MOD, `select * from public.standing_reconcile(200)`);
check(reconcileAfter.rows.length === 0, 'the reconciliation is now clean', JSON.stringify(reconcileAfter.rows.length));

// The sweep is the routine that catches up after an expiry nobody wrote a row for:
// time passed, the entry stopped counting, and the cache still holds the old sum.
// Same manufactured divergence, for the same reason: the clock is frozen.
await asSystem(`update public.profiles set standing_points = -4 where uid = '${MEMBER}'`);
const beforeSweep = await cached(MEMBER);
check(beforeSweep === -4, 'the cache holds a number the ledger no longer agrees with', JSON.stringify(beforeSweep));
const swept = await asSystem(`select public.sweep_standing_expiry(500) as n`);
check(Number(swept.rows[0]?.n) >= 1, 'the sweep recomputes the member it concerns', JSON.stringify(swept.rows[0]?.n));
check((await cached(MEMBER)) === -1, 'and the cache is right again', JSON.stringify(await cached(MEMBER)));

// ===========================================================================
// 7. Permissions
// ===========================================================================
const memberAdjust = await as(
  MEMBER,
  `select public.person_standing_adjust('${OTHER}', 'warning.official', 'I will punish my rival')`,
);
check(memberAdjust.error !== null, 'a member cannot adjust anybody’s standing', memberAdjust.error?.message ?? 'accepted');

const memberReconcile = await as(MEMBER, `select * from public.standing_reconcile(10)`);
check(memberReconcile.error !== null, 'and cannot run the reconciliation', memberReconcile.error?.message ?? 'accepted');

const memberRepair = await as(MEMBER, `select public.repair_standing(10)`);
check(memberRepair.error !== null, 'and cannot repair', memberRepair.error?.message ?? 'accepted');

const memberSweep = await as(MEMBER, `select public.sweep_standing_expiry(10)`);
check(memberSweep.error !== null, 'and cannot sweep', memberSweep.error?.message ?? 'accepted');

const memberWrite = await as(
  MEMBER,
  `insert into public.standing_entries (uid, points, reason, rule_key)
   values ('${MEMBER}', 100, 'I award myself points for existing', 'good.faith')`,
);
check(memberWrite.error !== null, 'a member cannot write an entry into their own ledger', memberWrite.error?.message ?? 'accepted');

// The manual-only rule: applied with no session at all, it is refused.
const systemManual = await asSystem(
  `select public.person_standing_adjust('${OTHER}', 'warning.official', 'a sweep decided to punish somebody')`,
);
check(systemManual.error !== null, 'a manual-only rule cannot be applied by nobody', systemManual.error?.message ?? 'accepted');

const badLimit = await as(MOD, `select * from public.standing_reconcile(0)`);
check(badLimit.error !== null, 'a reconciliation page of zero is refused', badLimit.error?.message ?? 'accepted');

// ===========================================================================
// 8. What a member sees
// ===========================================================================
const mine = await as(MEMBER, `select * from public.my_standing(50)`);
check(mine.error === null, 'a member reads their own standing', mine.error?.message ?? '');
check(mine.rows.length === 3, 'with every entry, including the revoked and the expired one', JSON.stringify(mine.rows.length));

const counting = mine.rows.filter((r) => r.counted === true);
const summing = counting.reduce((n, r) => n + Number(r.points), 0);
check(summing === -1, 'and the rows marked as counting add up to the number', `${summing} vs -1`);

const revokedRow = mine.rows.find((r) => r.revoked_at !== null);
check(revokedRow !== undefined, 'a revoked entry is shown rather than hidden', JSON.stringify(mine.rows.map((r) => r.counted)));
check(revokedRow?.counted === false, 'marked as not counting, so the member can see the correction', JSON.stringify(revokedRow?.counted));

const label = mine.rows[0]?.rule_label;
check(typeof label === 'string' && label.length > 3, 'and a rule label rather than a bare key', JSON.stringify(label));

const othersStanding = await as(MEMBER, `select * from public.standing_entries where uid = '${OTHER}'`);
check(othersStanding.rows.length === 0, 'a member reads their own ledger and not somebody else’s', JSON.stringify(othersStanding.rows.length));

const adminRead = await as(MOD, `select * from public.admin_standing('${MEMBER}')`);
check(adminRead.error === null, 'a moderator reads one member’s standing', adminRead.error?.message ?? '');
check(adminRead.rows[0]?.agrees === true, 'and the read says the cache agrees with the ledger', JSON.stringify(adminRead.rows[0]?.agrees));
check(Number(adminRead.rows[0]?.entries) === 3, 'with the total entry count', JSON.stringify(adminRead.rows[0]?.entries));
check(Number(adminRead.rows[0]?.counted_entries) === 1, 'and the count that actually counts', JSON.stringify(adminRead.rows[0]?.counted_entries));

const unknownMember = await as(MOD, `select * from public.admin_standing('${OTHER}0')`);
check(unknownMember.error !== null, 'a member who does not exist is refused', unknownMember.error?.message ?? 'accepted');

console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) {
  console.log(bad.map((b) => `  - ${b}`).join('\n'));
  process.exitCode = 1;
}
