/**
 * Proof for 0139: a decision reaches the person it was made about.
 *
 * The claim is simple and the failure it prevents is not: four staff actions that
 * used to be invisible to the only person who cared now say something. So the
 * proof walks each one and asks the affected member's inbox.
 *
 * The load-bearing checks are the awkward ones:
 *
 *   * a member who muted the kind still does not get social notifications, so
 *     preferences are not overridden wholesale by adding staff messages;
 *   * a suspension IS delivered anyway, because it is the explanation for
 *     everything that stops working next;
 *   * the reason travels, in both languages, and the Bangla half is in Bangla
 *     script rather than English in a Bangla column;
 *   * deciding the same row twice notifies once.
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

const OWNER = '00000000-0000-4000-8000-000000000201';
const APPLICANT = '00000000-0000-4000-8000-000000000202';
const REPORTER = '00000000-0000-4000-8000-000000000203';
const MUTED = '00000000-0000-4000-8000-000000000204';

await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${OWNER}',     'notifyowner',   'Notify Owner',   'owner',  'active'),
    ('${APPLICANT}', 'notifyapp',     'Notify Applicant', 'member', 'active'),
    ('${REPORTER}',  'notifyrep',     'Notify Reporter', 'member', 'active'),
    ('${MUTED}',     'notifymuted',   'Notify Muted',    'member', 'active')
  on conflict do nothing;
`);

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
  // A security-definer trigger still reads `request.jwt.claims` to answer
  // `current_uid()`, and `set_config(..., false)` lasts for the session. Without
  // this reset, a later trigger would attribute its own write to whoever ran the
  // previous statement — which is exactly how the bulk-apply check below first
  // failed: the shop-decision trigger fired with the *applicant* as the actor, and
  // `bsdc.notify` suppresed the message as a self-notification.
  // `{}` rather than the empty string: `current_uid()` casts the setting to
  // jsonb, so a blank value raises "invalid input syntax for type json" inside
  // whatever trigger touches it next.
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

async function submitApplication(uid, shopName, txn) {
  return as(uid, `select public.mk_submit_vendor_application($json$${JSON.stringify({
    full_name: 'Notify Applicant',
    shop_name: shopName,
    nid_number: '1234567890123',
    mobile: '01712345678',
    vendor_type: 'grocery',
    address_line: '7 Notify Road, Sylhet',
    lat: 24.9,
    lng: 91.87,
    place_label: 'Sylhet',
    package_code: '10',
    payment_sender: '01712345678',
    payment_holder: 'Notify Applicant',
    payment_txn_id: txn,
    agreements: {
      terms: true, privacy: true, vendor_policy: true,
      cod_policy: true, self_delivery: true, accuracy: true,
    },
  })}$json$::jsonb)`);
}

async function inbox(uid) {
  const { rows } = await as(uid, `select * from public.my_notifications_page(50, null, false)`);
  return rows;
}

// ===========================================================================
// 1. The bilingual body
// ===========================================================================
const both = await asSystem(`select bsdc.bilingual('Hello', 'হ্যালো') as b`);
check(both.rows[0]?.b === 'Hello | হ্যালো', 'two languages are joined by a separator', both.rows[0]?.b);
const enOnly = await asSystem(`select bsdc.bilingual('Hello', '') as b`);
check(enOnly.rows[0]?.b === 'Hello', 'an empty translation is not a dangling separator');
const capped = await asSystem(`select char_length(bsdc.bilingual(repeat('x', 400), ''))::int as n`);
check(
  Number(capped.rows[0]?.n) === 280,
  'a long sentence becomes a short one rather than a failed insert',
  String(capped.rows[0]?.n),
);

// ===========================================================================
// 2. A shop decision reaches the applicant
// ===========================================================================
const submitted = await submitApplication(APPLICANT, 'Notify Shop', `NT-${Date.now()}`);
check(submitted.error === null, 'an application is submitted', submitted.error?.message ?? '');

const beforeDecision = await inbox(APPLICANT);
check(
  beforeDecision.every((row) => !String(row.body_en).includes('Notify Shop')),
  'nothing is said before the decision',
  JSON.stringify(beforeDecision.map((r) => r.body_en)),
);

const appId = await asSystem(
  `select id from public.mk_vendor_applications where shop_name = 'Notify Shop' limit 1`,
);
await asSystem(`select set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', false);`);
const refused = await as(
  OWNER,
  `select public.mk_admin_decide_application('${appId.rows[0]?.id}', 'reject',
     'The trade licence number does not match the one on file')`,
);
check(refused.error === null, 'the owner refuses the application', refused.error?.message ?? '');

const afterRefusal = await inbox(APPLICANT);
const refusalNote = afterRefusal.find((row) => String(row.body_en).includes('Notify Shop'));
check(refusalNote !== undefined, 'the applicant is told', JSON.stringify(afterRefusal.map((r) => r.body_en)));
check(
  String(refusalNote?.body_en ?? '').includes('not approved'),
  'and told it was not approved',
  refusalNote?.body_en,
);
check(
  String(refusalNote?.body_en ?? '').includes('trade licence'),
  'and given the actual reason, not a category',
  refusalNote?.body_en,
);
check(
  /[\u0980-\u09FF]/.test(String(refusalNote?.body_bn ?? '')),
  'and it is said in Bangla too, in Bangla script',
  refusalNote?.body_bn,
);
check(
  String(refusalNote?.body_bn ?? '').includes('অনুমোদন'),
  'with the Bangla half saying the same thing',
);
check(refusalNote?.is_unread === true, 'and it arrives unread');
check(
  refusalNote?.actor_uid === OWNER,
  'and names the staff member who decided, so it can be replied to',
  refusalNote?.actor_uid,
);
check(refusalNote?.is_staff === true, 'and marks the actor as staff');

// Deciding again must not double the notification.
const again = await as(
  OWNER,
  `select public.mk_admin_decide_application('${appId.rows[0]?.id}', 'reject',
     'The trade licence number does not match the one on file')`,
);
const afterTwice = await inbox(APPLICANT);
const shopNotes = afterTwice.filter((row) => String(row.body_en).includes('Notify Shop'));
check(
  shopNotes.length === 1,
  'deciding the same application twice notifies once',
  `${shopNotes.length}`,
);
check(again.error !== null || shopNotes.length === 1, 'and the second attempt is either refused or silent');

// An approval says something different.
const approvedApplicant = '00000000-0000-4000-8000-000000000205';
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${approvedApplicant}', 'notifyapp2', 'Notify Applicant Two', 'member', 'active')
  on conflict do nothing;
`);
const second = await submitApplication(approvedApplicant, 'Notify Shop Two', `NT2-${Date.now()}`);
check(second.error === null, 'a second application is submitted', second.error?.message ?? '');
const secondId = await asSystem(
  `select id from public.mk_vendor_applications where shop_name = 'Notify Shop Two' limit 1`,
);
await asSystem(`select set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', false);`);
await as(OWNER, `select public.mk_admin_decide_application('${secondId.rows[0]?.id}', 'approve', 'Complete')`);
const approvedInbox = await inbox(approvedApplicant);
const approvalNote = approvedInbox.find((row) => String(row.body_en).includes('Notify Shop Two'));
check(
  String(approvalNote?.body_en ?? '').includes('is open'),
  'an approval says the shop is open, not that it was approved',
  approvalNote?.body_en,
);
check(
  String(approvalNote?.body_en ?? '').includes('first product'),
  'and tells them what to do next',
  approvalNote?.body_en,
);

// ===========================================================================
// 3. A muted member is not overridden — except for account state
// ===========================================================================
await asSystem(`
  update public.profiles
     set notifications = jsonb_build_object('followers', false, 'comments', false,
                                            'mentions', false, 'messages', false)
   where uid = '${MUTED}';
`);
const mutedPref = await asSystem(
  `select bsdc.notification_allowed('${MUTED}', 'moderation') as ok`,
);
check(mutedPref.rows[0]?.ok === true, 'moderation notifications are not a muteable kind');

// A suspension is delivered regardless of preferences — it is the explanation for
// everything that stops working next.
await asSystem(`select set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated"}', false);`);
const suspended = await as(
  OWNER,
  `select public.set_account_status('${MUTED}', 'suspended',
     'Repeated spam in three channels after a warning')`,
);
check(suspended.error === null, 'an owner suspends the account through the real RPC', suspended.error?.message ?? '');
const mutedInbox = await asSystem(
  `select body, actor_uid from public.notifications where uid = '${MUTED}' order by created_at desc limit 5`,
);
check(mutedInbox.rows.length > 0, 'a suspended member is told, whatever their preferences', `${mutedInbox.rows.length}`);
const suspensionBody = String(mutedInbox.rows[0]?.body ?? '');
check(suspensionBody.includes('suspended'), 'and told what happened', suspensionBody);
check(
  suspensionBody.includes('Repeated spam'),
  'and why, from the audit trail rather than a second copy of the reason',
  suspensionBody,
);
check(
  /[\u0980-\u09FF]/.test(suspensionBody),
  'in both languages',
  suspensionBody,
);
check(
  suspensionBody.includes('review'),
  'and told what they can do about it, which is the difference between a notice and a wall',
  suspensionBody,
);

// Restoring says so.
const restored = await as(
  OWNER,
  `select public.set_account_status('${MUTED}', 'active',
     'Appeal upheld after review of the channel logs')`,
);
check(restored.error === null, 'and restores it the same way', restored.error?.message ?? '');
const restoredInbox = await asSystem(
  `select body from public.notifications where uid = '${MUTED}' order by created_at desc limit 1`,
);
check(
  String(restoredInbox.rows[0]?.body ?? '').includes('active again'),
  'a restore says the account works again',
  restoredInbox.rows[0]?.body,
);

// ===========================================================================
// 4. A report outcome already reaches the reporter — and now only once
// ===========================================================================
//
// 0088's `resolve_report` notifies the reporter. The gap this migration was
// originally going to close here did not exist, and adding a trigger would have
// doubled every message. This section proves the existing path still works and
// that nothing here doubles it.
const author = '00000000-0000-4000-8000-000000000207';
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${author}', 'notifyauthor', 'Notify Author', 'member', 'active')
  on conflict do nothing;
`);
// A post is written by its author, through the same `authenticated` role and
// session claim a browser uses — not by the fixture reaching around RLS.
const post = await as(
  author,
  `insert into public.posts (author_uid, kind, title, slug, body, status, published_at)
   values ('${author}', 'post', 'A post that gets reported', 'a-post-that-gets-reported',
           'Body text for the report proof.', 'published', now())
   returning id`,
);
if (post.error) console.log(`note  post: ${post.error.message}`);
const postId = post.rows[0]?.id;
check(typeof postId === 'string', 'a post exists to be reported', post.error?.message ?? '');

// No `returning id`: `authenticated` holds `insert` on reports but not `select`,
// so RETURNING is refused even though the insert itself is allowed. That
// asymmetry is deliberate — a reporter cannot read the table back — so the
// fixture reads the id afterwards the way a moderator would.
const filed = await as(
  REPORTER,
  `insert into public.reports (reporter_uid, subject_type, subject_id, reason, details)
   values ('${REPORTER}', 'post', '${postId}', 'harassment',
           'Repeated personal attacks in the replies under my post')`,
);
if (filed.error) console.log(`note  report: ${filed.error.message}`);

const reportId = await asSystem(
  `select id from public.reports where reporter_uid = '${REPORTER}' limit 1`,
);
check(reportId.rows.length === 1, 'a report exists to be resolved', JSON.stringify(reportId.rows.length));

if (reportId.rows.length === 1) {
  const preResolve = await asSystem(
    `select count(*)::int as n from public.notifications where uid = '${REPORTER}'`,
  );
  const beforeCount = Number(preResolve.rows[0]?.n ?? 0);

  const resolved = await as(
    OWNER,
    `select public.resolve_report('${reportId.rows[0].id}', 'hide_content',
       'Post hidden and the author warned')`,
  );
  check(resolved.error === null, 'an owner resolves the report', resolved.error?.message ?? '');

  const postResolve = await asSystem(
    `select body, kind::text as kind from public.notifications where uid = '${REPORTER}' order by created_at desc`,
  );
  check(
    Number(postResolve.rows.length) === beforeCount + 1,
    'the reporter is told exactly once, not twice — the existing path is the only one',
    `${beforeCount} -> ${postResolve.rows.length}`,
  );
  const outcome = postResolve.rows.find((row) => String(row.body).startsWith('Report actioned'));
  check(outcome !== undefined, 'and the message says the report was actioned', JSON.stringify(postResolve.rows.map((r) => r.body)));
  check(
    String(outcome?.body ?? '').includes('Post hidden'),
    'with the resolution note, which is what the reporter actually wants to know',
    outcome?.body,
  );
}

// ===========================================================================
// 5. The inbox read model
// ===========================================================================
const page = await as(APPLICANT, `select * from public.my_notifications_page(10, null, false)`);
check(page.error === null, 'the inbox reads', page.error?.message ?? '');
check(page.rows.length > 0, 'and has the notifications written for this member');
check(
  page.rows.every((row) => row.unread_total >= 0),
  'the unread total is stated rather than left to the client to sum a page',
);
check(
  page.rows.every((row) => typeof row.body_bn === 'string'),
  'the Bangla half is a column, not something the client parses out of the body',
);

const unreadOnly = await as(APPLICANT, `select * from public.my_notifications_page(10, null, true)`);
check(
  unreadOnly.rows.every((row) => row.is_unread === true),
  'the unread filter is applied in SQL',
  JSON.stringify(unreadOnly.rows.map((r) => r.is_unread)),
);

// One member's inbox must not contain another's. This is the check that matters
// most in this file.
const outsiderInbox = await as(MUTED, `select * from public.my_notifications_page(50, null, false)`);
check(
  outsiderInbox.rows.every((row) => !String(row.body_en).includes('Notify Shop')),
  "one member's inbox does not contain another's decisions",
);

const anonInbox = await asSystem(`set role anon; select * from public.my_notifications_page(10, null, false);`);
check(anonInbox.error !== null, 'an anonymous caller has no inbox', anonInbox.error?.message ?? 'it answered');

const capped2 = await as(APPLICANT, `select count(*)::int as n from public.my_notifications_page(100000, null, false)`);
check(Number(capped2.rows[0]?.n) <= 200, 'the page size is capped rather than trusting the caller');

// ===========================================================================
// 6. The trigger follows the row, not the call site
// ===========================================================================
// A direct UPDATE — the path a bulk apply takes — notifies exactly like the RPC.
const directApplicant = '00000000-0000-4000-8000-000000000206';
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${directApplicant}', 'notifyapp3', 'Notify Applicant Three', 'member', 'active')
  on conflict do nothing;
`);
await submitApplication(directApplicant, 'Notify Shop Three', `NT3-${Date.now()}`);
const thirdId = await asSystem(
  `select id from public.mk_vendor_applications where shop_name = 'Notify Shop Three' limit 1`,
);
const thirdUpdate = await asSystem(`
  update public.mk_vendor_applications
     set status = 'rejected', review_note = 'Decided by a bulk operation rather than the single-row screen'
   where id = '${thirdId.rows[0]?.id}';
`);
if (thirdUpdate.error) console.log(`note  direct update: ${thirdUpdate.error.message}`);
const directInbox = await inbox(directApplicant);
const directNote = directInbox.find((row) => String(row.body_en).includes('Notify Shop Three'));
check(
  directNote !== undefined,
  'a decision made by a path nobody remembered still notifies, because it follows the row',
  JSON.stringify(directInbox.map((r) => r.body_en)),
);
check(
  String(directNote?.body_en ?? '').includes('bulk operation'),
  'and carries the reason the row was given, wherever the write came from',
  directNote?.body_en,
);

console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) {
  console.log(bad.map((label) => `  - ${label}`).join('\n'));
  process.exit(1);
}
