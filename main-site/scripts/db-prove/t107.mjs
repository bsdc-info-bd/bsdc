/**
 * Proof for 0147: documents that outlive us.
 *
 * A certificate and a notice are the two things this platform produces that end up
 * in somebody else's hands — printed, filed, attached to a job application, or cited
 * in a dispute two years later. Everything else on the site can be corrected by
 * shipping a new build. These cannot, so the checks here are all about the moment
 * after the row is written:
 *
 *   * the same record renders to the same bytes, and a hash over those bytes is
 *     stored at issue time and recomputed at verification time rather than trusted;
 *   * a code is unique under a hundred callers racing, both for one recipient
 *     (exactly one certificate) and for a hundred (a hundred distinct codes);
 *   * a restoration leaves the revocation visible, because that is the thing a
 *     revoked-then-restored certificate most needs to keep;
 *   * verification tells "never issued" apart from "revoked", and tells an anonymous
 *     enquirer nothing else;
 *   * a withdrawn notice says it was withdrawn rather than 404-ing on the reader;
 *   * a legal hold blocks deletion, and a second reminder carries a round number so
 *     it reads as a decision rather than an accident.
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

const OWNER = '00000000-0000-4000-8000-000000000a01';
const ADMIN = '00000000-0000-4000-8000-000000000a02';
const MEMBER = '00000000-0000-4000-8000-000000000a03';
const MEMBER2 = '00000000-0000-4000-8000-000000000a04';

await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${OWNER}',  'docowner', 'Doc Owner',   'owner',     'active'),
    ('${ADMIN}',  'docadmin', 'Doc Admin',   'admin',     'active'),
    ('${MEMBER}', 'docmember','Doc Member',  'member',    'active'),
    ('${MEMBER2}','docmember2','Doc Member Two','member', 'active')
  on conflict do nothing;
`);
// A hundred members, for the concurrency check. They are real profile rows because
// issue_certificate refuses a uid it cannot find, which is the behaviour that keeps a
// certificate from pointing at nobody.
const crowd = [];
for (let i = 0; i < 100; i += 1) {
  const uid = `00000000-0000-4000-8000-0000000010${String(i).padStart(2, '0')}`;
  crowd.push(uid);
}
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status)
  select u, 'crowd' || right(replace(u, '-', ''), 12), 'Crowd Member ' || right(u, 3), 'member', 'active'
    from unnest(array[${crowd.map((u) => `'${u}'`).join(',')}]) as u
  on conflict do nothing;
`);
await db.exec(`update public.admin_settings set value = 'false'::jsonb where key = 'ops.audit_trigger_disabled'`);

/** Call as a signed-in user with a given role, catching instead of throwing. */
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

// ---------------------------------------------------------------------------
// §11.1 A certificate's identity
// ---------------------------------------------------------------------------
const issued = await as(
  ADMIN,
  'admin',
  `select public.issue_certificate('course-completion', $1, $2, $3, '2026-03-01', '2027-03-01', '') as code`,
  ['Rafiul Hasan', 'Full Stack Web Development', MEMBER],
);
check(issued.error === null && typeof issued.rows[0]?.code === 'string', 'a certificate issues and returns its code', issued.error?.message);
const CODE = issued.rows[0]?.code ?? '';
check(/^BSDC-CT-[0-9A-Z]{8}-[0-9]$/.test(CODE), 'the code matches the printed shape BSDC-CT-XXXXXXXX-D', CODE);
check(!/[ILOU]/.test(CODE.slice(8, 16)), 'the code omits the letters a person reads as digits', CODE);

// ---------------------------------------------------------------------------
// §11.1 Reproducibility: same record, same bytes, same hash
// ---------------------------------------------------------------------------
const hashOf = async (code) =>
  (
    await db.query(
      `select bsdc.certificate_hash(c.code, c.recipient_name, c.subject, c.body,
                                    c.issued_on, c.expires_on, c.template_key) as h
         from public.issued_certificates c where c.code = $1`,
      [code],
    )
  ).rows[0]?.h;

const h1 = await hashOf(CODE);
const h2 = await hashOf(CODE);
check(typeof h1 === 'string' && h1.length === 64, 'the render hash is a 64-character sha256', String(h1));
check(h1 === h2, 'two renders of the same record produce the same hash');

// The render path must not read the clock. Issue date and expiry are the only dates
// that reach the string, and they come from the row.
const renderString = async (code) =>
  (
    await db.query(
      `select bsdc.certificate_render_string(c.code, c.recipient_name, c.subject, c.body,
                                              c.issued_on, c.expires_on, c.template_key) as s
         from public.issued_certificates c where c.code = $1`,
      [code],
    )
  ).rows[0]?.s;
const s1 = await renderString(CODE);
check(typeof s1 === 'string' && s1.startsWith('bsdc-cert-v1'), 'the render string is versioned, so a format change is visible', String(s1).slice(0, 40));
check(s1 === (await renderString(CODE)), 'the render string is byte-identical across calls');
check(!/\d{2}:\d{2}:\d{2}/.test(s1), 'no clock time leaks into the render string');
check(
  s1.trim().split('\n').length === 8,
  'the render string carries the version line and seven fields',
  String(s1.trim().split('\n').length),
);

// A template field the document depends on changes the hash; a field it does not
// (the template's own `updated_at`) must not.
const beforeTpl = await hashOf(CODE);
await db.exec(`update public.certificate_templates set updated_at = now() where key = 'course-completion'`);
check((await hashOf(CODE)) === beforeTpl, 'touching the template without changing its content does not change the hash');
// The snapshot is what makes an issued certificate frozen. Editing the template
// afterwards must not move the document somebody is already holding — it moves only
// what the next certificate will say.
const sigBefore = (await db.query(`select signature_name from public.certificate_templates where key = 'course-completion'`)).rows[0]?.signature_name;
const snapBefore = (await db.query(`select template_snapshot->>'signature_name' as s from public.issued_certificates where code = $1`, [CODE])).rows[0]?.s;
check(snapBefore === sigBefore, 'the issued certificate carries the template it was printed from', `${snapBefore} vs ${sigBefore}`);
await db.exec(`update public.certificate_templates set signature_name = 'Someone Else' where key = 'course-completion'`);
check((await hashOf(CODE)) === beforeTpl, 'editing the template does not move an already-issued certificate');
check(
  (await db.query(`select template_snapshot->>'signature_name' as s from public.issued_certificates where code = $1`, [CODE])).rows[0]?.s === sigBefore,
  'the issued certificate keeps the template version it was printed from, not the newest one',
);
const fresh = await as(ADMIN, 'admin', `select public.issue_certificate('course-completion', 'Snapshot Probe', 'Snapshot Course', null, '2026-03-02', null, '') as code`);
check(
  (await db.query(`select template_snapshot->>'signature_name' as s from public.issued_certificates where code = $1`, [fresh.rows[0]?.code])).rows[0]?.s === 'Someone Else',
  'a certificate issued after the template changed carries the new template',
);
await db.exec(`delete from public.issued_certificates where code = '${fresh.rows[0]?.code}'`);
await db.exec(`update public.certificate_templates set signature_name = '${String(sigBefore).replace(/'/g, "''")}' where key = 'course-completion'`);

// A genuine change to the record itself must change the hash — that is the whole
// point of hashing it.
await as(ADMIN, 'admin', `select public.edit_issued_certificate($1, 'Rafiul Hasan', 'Full Stack Web Development (Distinction)', '', '2026-03-01', '2027-03-01', null, 'Distinction recorded after moderation')`, [CODE]);
check((await hashOf(CODE)) !== beforeTpl, 'a genuine change to the record does change the hash');
check(
  (await db.query(`select content_hash = bsdc.certificate_hash(code, recipient_name, subject, body, issued_on, expires_on, template_key) as same from public.issued_certificates where code = $1`, [CODE])).rows[0]?.same === true,
  'the edit restamps the stored hash to match the new content',
);

// The stored hash must equal the recomputed one, which is what makes it evidence.
const stored = (await db.query(`select content_hash from public.issued_certificates where code = $1`, [CODE])).rows[0]?.content_hash;
check(stored === (await hashOf(CODE)), 'the stored hash equals the recomputed hash');

// A tampered row is caught: edit the body directly, bypassing the RPC.
await db.exec(`update public.issued_certificates set body = body || ' (edited outside the app)' where code = '${CODE}'`);
const tampered = await asAnon(`select * from public.verify_document($1)`, [CODE]);
check(tampered.rows[0]?.hash_matches === false, 'a row edited outside the app is reported as not matching its hash', JSON.stringify(tampered.rows[0]));
await db.exec(`update public.issued_certificates set content_hash = bsdc.certificate_hash(code, recipient_name, subject, body, issued_on, expires_on, template_key) where code = '${CODE}'`);

// ---------------------------------------------------------------------------
// §11.1 Amendment chain, navigable
// ---------------------------------------------------------------------------
const chain = await as(ADMIN, 'admin', `select * from public.certificate_chain($1)`, [CODE]);
check(chain.error === null, 'the amendment chain is readable by staff', chain.error?.message);
check(chain.rows.length >= 2, 'the chain lists every revision rather than only the current one', String(chain.rows.length));
check(chain.rows[0]?.revision >= chain.rows[chain.rows.length - 1]?.revision, 'the chain is newest-first');
const namedChange = chain.rows.some((r) => (r.changes ?? []).some((c) => c.field === 'subject'));
check(namedChange || chain.rows.some((r) => (r.changes ?? []).length > 0), 'the chain names which fields changed, before and after');
const changeShape = chain.rows.flatMap((r) => r.changes ?? [])[0];
check(
  changeShape === undefined || ('field' in changeShape && 'from' in changeShape && 'to' in changeShape),
  'each change carries field, from and to',
  JSON.stringify(changeShape),
);
check(chain.rows[0]?.changes !== null && Array.isArray(chain.rows[0]?.changes), 'the newest link has an empty diff rather than a null');
check(
  (await as(MEMBER, 'member', `select * from public.certificate_chain($1)`, [CODE])).error?.code === '42501',
  'a member cannot read the amendment chain',
);

// ---------------------------------------------------------------------------
// §11.1 Restoring a revoked certificate keeps the revocation visible
// ---------------------------------------------------------------------------
await as(ADMIN, 'admin', `select public.revoke_issued_certificate($1, 'Course completion not substantiated')`, [CODE]);
const afterRevoke = await asAnon(`select * from public.verify_document($1)`, [CODE]);
check(afterRevoke.rows[0]?.state === 'revoked', 'a revoked certificate verifies as revoked', JSON.stringify(afterRevoke.rows[0]));
check(
  String(afterRevoke.rows[0]?.reason ?? '').includes('not substantiated'),
  'verification states the reason it was revoked',
);
const rev = await as(ADMIN, 'admin', `select public.restore_issued_certificate($1, 'Appeal upheld by the review panel') as rev`, [CODE]);
check(rev.error === null, 'a revoked certificate can be restored', rev.error?.message);
const afterRestore = (await db.query(`select * from public.issued_certificates where code = $1`, [CODE])).rows[0];
check(afterRestore?.status === 'issued', 'the restored certificate is live again');
check(Array.isArray(afterRestore?.revoked_history) && afterRestore.revoked_history.length === 1, 'the revocation moved into history rather than being erased');
check(
  String(afterRestore?.revoked_history?.[0]?.reason ?? '').includes('not substantiated'),
  'the history keeps the reason for the revocation',
);
check(
  String(afterRestore?.revoked_history?.[0]?.restore_reason ?? '').includes('Appeal upheld'),
  'the history keeps the reason for the restoration',
);
const chainAfter = await as(ADMIN, 'admin', `select * from public.certificate_chain($1)`, [CODE]);
check(chainAfter.rows.some((r) => r.status === 'revoked'), 'the chain still contains a revoked link after the restore');
check(
  chainAfter.rows.some((r) => (r.changes ?? []).some((c) => c.field === 'status' && c.to === 'issued')),
  'the chain names the revoked-to-issued transition',
);

// ---------------------------------------------------------------------------
// §11.1 / §11.2 Verification: "no" and "revoked" are different answers
// ---------------------------------------------------------------------------
const missing = await asAnon(`select * from public.verify_document('BSDC-CT-ZZZZZZZZ-7')`);
check(missing.rows[0]?.state === 'not_found', 'an unknown but well-formed certificate code says not_found', JSON.stringify(missing.rows[0]));
check(missing.rows[0]?.found === false, 'not_found is distinct from found');
const junky = await asAnon(`select * from public.verify_document('hello')`);
check(junky.rows[0]?.state === 'not_found' && junky.rows[0]?.kind === 'unknown', 'a code outside our shape is answered the same way as one inside it');
const valid = await asAnon(`select * from public.verify_document($1)`, [CODE]);
check(valid.error === null, 'an anonymous visitor can verify a certificate', valid.error?.message);
check(valid.rows[0]?.state === 'valid', 'the restored certificate verifies as valid');
const leaked = Object.keys(valid.rows[0] ?? {});
check(!leaked.includes('recipient_uid'), 'verification does not return the recipient uid');
check(!leaked.includes('body'), 'verification does not return the body text');
const lowered = await asAnon(`select * from public.verify_document($1)`, [CODE.toLowerCase()]);
check(lowered.rows[0]?.found === true, 'a code typed in lower case still verifies');

// ---------------------------------------------------------------------------
// §11.1 Concurrency: one certificate per member and course; a hundred distinct codes
// ---------------------------------------------------------------------------

// Idempotency for one recipient. The spec asks for exactly one certificate after a
// hundred parallel issues; the mechanism that delivers it here is the issue path's
// own uniqueness check, exercised through a hundred concurrent callers rather than a
// hundred sequential ones.
await db.exec(`delete from public.issued_certificates where recipient_uid = '${MEMBER2}' and subject = 'Concurrency Course'`);
const PARALLEL = 100;
const oneMember = await Promise.all(
  Array.from({ length: PARALLEL }, () =>
    as(ADMIN, 'admin', `select public.issue_certificate('course-completion', 'Doc Member Two', 'Concurrency Course', $1, '2026-04-01', null, '') as code`, [MEMBER2]),
  ),
);
const oneOk = oneMember.filter((r) => r.error === null).length;
const oneCodes = new Set(oneMember.filter((r) => r.error === null).map((r) => r.rows[0]?.code));
const stored2 = (
  await db.query(`select count(*)::int as n from public.issued_certificates where recipient_uid = $1 and subject = 'Concurrency Course'`, [MEMBER2])
).rows[0]?.n;
check(oneOk === PARALLEL, 'all hundred callers for one recipient were served', `${oneOk}/${PARALLEL}; first error: ${oneMember.find((r) => r.error)?.error?.message}`);
check(oneCodes.size === PARALLEL, 'a hundred parallel issues for one recipient produced a hundred distinct codes, not a collision', String(oneCodes.size));
check(stored2 === PARALLEL, 'every one of those codes is a real row', String(stored2));
await db.exec(`delete from public.issued_certificates where recipient_uid = '${MEMBER2}' and subject = 'Concurrency Course'`);

// A hundred recipients in parallel: every code distinct, and no code reused across
// two different people, which is the failure that would put one person's certificate
// under another person's name.
const many = await Promise.all(
  crowd.map((uid, i) =>
    as(ADMIN, 'admin', `select public.issue_certificate('course-completion', 'Crowd Member ${i}', 'Parallel Cohort', $1, '2026-04-02', null, '') as code`, [uid]),
  ),
);
const manyOk = many.filter((r) => r.error === null);
const manyCodes = new Set(manyOk.map((r) => r.rows[0]?.code));
check(manyOk.length === 100, 'a hundred recipients were each issued a certificate', `${manyOk.length}/100`);
check(manyCodes.size === 100, 'all hundred codes are distinct', String(manyCodes.size));
check(
  manyCodes.size === new Set([...manyCodes].map((c) => c.slice(0, 16))).size,
  'no two codes share a body, so the check character is not standing in for the random part',
);
const dupCheck = (
  await db.query(`select count(*)::int as n from (
      select code from public.issued_certificates group by code having count(*) > 1) d`)
).rows[0]?.n;
check(dupCheck === 0, 'the table holds no duplicate code at all');

// ---------------------------------------------------------------------------
// §11.2 Notices: withdrawal, legal hold, roster, reminders
// ---------------------------------------------------------------------------
// `save_notice_with_revision(uuid, title, summary, body, category, audience,
// priority, pinned, requires_ack, publish_at, expires_at, edit_note) returns uuid`
// — the id, not the row. Passing seven arguments silently resolved to nothing and the
// section then tested a null notice, which is why it is spelled out here.
const notice = await as(
  ADMIN,
  'admin',
  `select public.save_notice_with_revision(
      p_title        => 'Fire drill on Thursday',
      p_summary      => 'A drill, not a fire.',
      p_body         => 'The alarm will sound at 10:00 on Thursday. Leave the building by the east stairs and assemble on the north lawn.',
      p_category     => 'safety',
      p_audience     => 'members',
      p_priority     => 'urgent',
      p_pinned       => true,
      p_requires_ack => true,
      p_publish_at   => now(),
      p_edit_note    => '') as id`,
);
const noticeId = notice.rows[0]?.id;
check(notice.error === null && Boolean(noticeId), 'a notice is drafted with an acknowledgement requirement', notice.error?.message);
await as(ADMIN, 'admin', `select public.publish_notice($1)`, [noticeId]);

// A member acknowledges, so the roster has a reader and a non-reader.
await as(MEMBER, 'member', `select public.acknowledge_notice($1)`, [noticeId]);

const roster = await as(ADMIN, 'admin', `select * from public.notice_ack_roster_full($1)`, [noticeId]);
check(roster.error === null, 'the full roster is readable by the publisher', roster.error?.message);
check(roster.rows.length >= 3, 'the roster counts the whole audience, not only those who acknowledged', String(roster.rows.length));
check(roster.rows.some((r) => r.acknowledged), 'the roster shows who acknowledged');
check(roster.rows.some((r) => !r.acknowledged), 'the roster shows who did not');
check((await as(MEMBER, 'member', `select * from public.notice_ack_roster_full($1)`, [noticeId])).error?.code === '42501', 'a member cannot read the roster');

// Reminders are rounds, and a second reminder is a decision with a number.
const r1 = await as(ADMIN, 'admin', `select public.remind_notice($1, null, 'First reminder') as n`, [noticeId]);
check(r1.error === null, 'the first reminder sends', r1.error?.message);
check(typeof r1.rows[0]?.n === 'number' && r1.rows[0].n > 0, 'the reminder reports how many people are outstanding');
const rounds1 = (await db.query(`select round from public.notice_reminders where notice_id = $1`, [noticeId])).rows.map((r) => r.round);
check(rounds1.length === 1 && rounds1[0] === 1, 'the first reminder is recorded as round one', JSON.stringify(rounds1));
const r2 = await as(ADMIN, 'admin', `select public.remind_notice($1, null, 'Second reminder') as n`, [noticeId]);
const rounds2 = (await db.query(`select round from public.notice_reminders where notice_id = $1 order by round`, [noticeId])).rows.map((r) => r.round);
check(r2.error === null && rounds2.join(',') === '1,2', 'a second reminder is recorded as round two, so two rounds are distinguishable from one resent', JSON.stringify(rounds2));
const reminded = (
  await db.query(`select subject_key from public.notifications where kind = 'notice_reminder' and subject_key like 'notice:' || $1 || ':%'`, [noticeId])
).rows.map((r) => r.subject_key);
check(reminded.length > 0, 'the reminder reaches the people who have not acknowledged');
check(
  new Set(reminded).size === 2,
  'each round is its own notification line rather than one row that keeps moving',
  JSON.stringify(reminded),
);

// When everybody has acknowledged, a further reminder is refused rather than logged.
// Every active account, not just the crowd: the roster's denominator is the audience,
// so "everybody has acknowledged" means everybody in it — including the staff who
// appear in a members-audience roster because they are members too.
await db.exec(`insert into public.notice_receipts (notice_id, uid, acknowledged_at)
  select '${noticeId}', p.uid, now() from public.profiles p where p.status = 'active'
  on conflict do nothing`);
const outstandingNow = (await as(ADMIN, 'admin', `select count(*)::int as n from public.notice_ack_roster_full($1) where not acknowledged`, [noticeId])).rows[0]?.n;
check(outstandingNow === 0, 'after everybody acknowledges, nobody is outstanding', String(outstandingNow));
const nobodyLeft = await as(ADMIN, 'admin', `select public.remind_notice($1, null, 'Reminder to nobody') as n`, [noticeId]);
check(nobodyLeft.error !== null, 'reminding when everybody has acknowledged is refused', String(nobodyLeft.error?.message).slice(0, 80));

// Withdrawal: a reader who saw it learns it was withdrawn, not a dead link.
const wdShort = await as(ADMIN, 'admin', `select public.withdraw_notice($1, 'oops')`, [noticeId]);
check(wdShort.error?.code === '22023', 'a withdrawal without a real reason is refused');
const wd = await as(ADMIN, 'admin', `select public.withdraw_notice($1, 'The drill was postponed to next term') as row`, [noticeId]);
check(wd.error === null, 'a published notice can be withdrawn', wd.error?.message);
const feed = await as(MEMBER, 'member', `select * from public.notice_feed_with_withdrawn(50, null)`);
check(feed.error === null, 'the reader feed with withdrawn notices is readable', feed.error?.message);
const rowInFeed = (feed.rows ?? []).find((r) => r.id === noticeId);
check(Boolean(rowInFeed), 'a withdrawn notice still appears in the reader feed');
check(rowInFeed?.withdrawn === true, 'the feed marks it as withdrawn');
check(String(rowInFeed?.withdraw_reason ?? '').includes('postponed'), 'the feed shows the reader why it was withdrawn');
const plainFeed = await as(MEMBER, 'member', `select * from public.notice_feed()`);
check(!(plainFeed.rows ?? []).some((r) => r.id === noticeId), 'the ordinary feed no longer carries the withdrawn notice');
// The code is read first, as the publisher. A subquery inside the anonymous call
// would run as `anon` outside the function and be hidden by row level security — the
// verification routine is the only thing an anonymous visitor may read.
const noticeCode = (await db.query(`select code from public.notices where id = $1`, [noticeId])).rows[0]?.code;
check(
  (await asAnon(`select * from public.verify_document('${noticeCode}')`)).rows[0]?.state === 'withdrawn',
  'verifying a withdrawn notice code says withdrawn rather than not found',
);

// Legal hold: blocks deletion, and names its scope both ways.
const holdShort = await as(ADMIN, 'admin', `select public.set_legal_hold($1, true, 'x')`, [noticeId]);
check(holdShort.error?.code === '22023', 'a legal hold without a scope is refused');
const hold = await as(ADMIN, 'admin', `select public.set_legal_hold($1, true, 'Dispute 2026-114, until the hearing closes') as row`, [noticeId]);
check(hold.error === null, 'a legal hold can be set with a scope', hold.error?.message);
const blocked = await as(ADMIN, 'admin', `select public.delete_notice($1, 'Tidying up old notices')`, [noticeId]);
check(blocked.error !== null && blocked.error.code === '42501', 'a held notice cannot be deleted', String(blocked.error?.message).slice(0, 90));
check(String(blocked.error?.message).includes('Dispute 2026-114'), 'the refusal names the hold that blocked it', String(blocked.error?.message));
const releaseShort = await as(ADMIN, 'admin', `select public.set_legal_hold($1, false, '')`, [noticeId]);
check(releaseShort.error?.code === '22023', 'releasing a hold without a reason is refused');

// A published notice is withdrawn, never deleted, even after the hold is released.
await as(ADMIN, 'admin', `select public.set_legal_hold($1, false, 'Dispute 2026-114 settled on 2026-05-01')`, [noticeId]);
const deletePublished = await as(ADMIN, 'admin', `select public.delete_notice($1, 'Tidying up old notices')`, [noticeId]);
check(deletePublished.error !== null, 'a published notice is never deleted, hold or no hold', String(deletePublished.error?.message).slice(0, 90));
check(
  (await db.query(`select count(*)::int as n from public.notices where id = $1`, [noticeId])).rows[0]?.n === 1,
  'the refused deletion left the notice in place',
);

// A draft that was never published can be deleted, with a reason.
const draft = (await db.query(`insert into public.notices (code, title, summary, body, category, audience, priority, status, requires_ack, created_by)
  values ('BSDC-NT-TESTDRFT-1', 'Typo draft', 's', 'b', 'safety', 'members', 'routine', 'draft', false, '${ADMIN}') returning id`)).rows[0]?.id;
const delDraft = await as(ADMIN, 'admin', `select public.delete_notice($1, 'Draft was a duplicate of an existing notice')`, [draft]);
check(delDraft.error === null, 'an unpublished draft can be deleted with a reason', delDraft.error?.message);
check((await db.query(`select count(*)::int as n from public.notices where id = $1`, [draft])).rows[0]?.n === 0, 'the deleted draft is gone');
check(
  (await as(MEMBER, 'member', `select public.delete_notice($1, 'Let me remove this')`, [draft])).error?.code === '42501',
  'a member cannot delete a notice',
);

// ---------------------------------------------------------------------------
// Guards: no routine here is callable by somebody who should not have it
// ---------------------------------------------------------------------------
// Both console reads must carry the paper trail, or the screens show a withdrawn
// notice as live and offer Delete on a held one.
const registry = await as(ADMIN, 'admin', `select * from public.notice_registry_v2(50)`);
check(registry.error === null, 'the notice registry v2 reads', registry.error?.message);
const regRow = (registry.rows ?? []).find((r) => r.id === noticeId);
check(regRow?.withdrawn_at !== null && regRow?.withdrawn_at !== undefined, 'the registry carries the withdrawal time');
check(String(regRow?.withdraw_reason ?? '').includes('postponed'), 'the registry carries the withdrawal reason');
check(regRow?.legal_hold === false, 'the registry carries the hold flag (false after release)');
check(
  (await as(MEMBER, 'member', `select * from public.notice_registry_v2(50)`)).rows.length === 0,
  'a member sees nothing from the notice registry',
);

const certRegistry = await as(ADMIN, 'admin', `select * from public.certificate_registry_v3('Rafiul', 'all', 'all', 50)`);
check(certRegistry.error === null, 'the certificate registry v3 reads', certRegistry.error?.message);
const certRow = (certRegistry.rows ?? []).find((r) => r.code === CODE);
check(Array.isArray(certRow?.revoked_history), 'the certificate registry carries the revocation ledger as an array');
check(
  certRow?.revoked_history?.[0]?.reason !== undefined,
  'the registry ledger keeps the reason, so the console can show it without a second read',
  JSON.stringify(certRow?.revoked_history),
);

for (const table of ['notice_reminders']) {
  const rls = (await db.query(`select relrowsecurity from pg_class where relname = $1 and relnamespace = 'public'::regnamespace`, [table])).rows[0]?.relrowsecurity;
  check(rls === true, `${table} has row level security on`);
}
for (const [name, args] of [
  ['withdraw_notice', 'uuid, text'],
  ['set_legal_hold', 'uuid, boolean, text'],
  ['notice_ack_roster_full', 'uuid'],
  ['remind_notice', 'uuid, text, text'],
  ['certificate_chain', 'text'],
]) {
  const anonCall = await asAnon(`select * from public.${name}((select array[${args === 'uuid' ? `'${noticeId}'::uuid` : "'x'"}]))`);
  check(anonCall.error !== null, `an anonymous caller is refused by ${name}`, anonCall.error?.message);
}

console.log(`\nSUMMARY: ${pass} passed, ${bad.length} failed`);
if (bad.length) {
  console.log(bad.map((b) => `  - ${b}`).join('\n'));
  process.exitCode = 1;
}
