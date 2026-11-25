/**
 * Proof for 0145: a brand theme is published by somebody who meant to publish it.
 *
 * The claim is narrow and worth proving four ways:
 *
 *   * editing and publishing are two rights, and the second names itself when it
 *     is missing;
 *   * nobody lost a power they had — every role that could activate a theme still
 *     can, which is the only thing that makes splitting a permission safe;
 *   * the audit row is a receipt: which theme replaced which, and every token that
 *     moved with its before and after, so a reader who was not here can tell what
 *     changed;
 *   * a theme that fails the contrast check cannot become live, even briefly, and
 *     the console is told why before it asks.
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

const OWNER = '00000000-0000-4000-8000-000000000801';
const DESIGNER = '00000000-0000-4000-8000-000000000802';
const MEMBER = '00000000-0000-4000-8000-000000000803';

await db.exec(`update public.admin_settings set value = 'true'::jsonb where key = 'ops.audit_trigger_disabled'`);
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
    ('${OWNER}',    'brandowner', 'Brand Owner',    'owner',  'active'),
    ('${DESIGNER}', 'branddes',   'Brand Designer', 'manager','active'),
    ('${MEMBER}',   'brandmem',   'Brand Member',   'member', 'active')
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
// 1. Publishing is a right of its own
// ===========================================================================
const catalogue = await rows(`
  select permission, label, subject_kind, is_destructive, grant_rank
    from public.permission_catalogue where permission = 'brand.publish'
`);
check(catalogue.length === 1, 'brand.publish exists in the catalogue, so it can be reviewed and granted', JSON.stringify(catalogue));
check(catalogue[0]?.is_destructive === true, 'and it is marked destructive, because a palette cannot be un-seen by visitors');
check(
  String(catalogue[0]?.label ?? '').length > 10,
  'the label says what it does rather than repeating the key',
  catalogue[0]?.label,
);

const translations = await rows(`
  select permission, label_bn, why_bn, why_en from bsdc_permission_copy() where permission = 'brand.publish'
`);
check(translations.length === 1, 'and it has a Bangla label, so the authority matrix does not show a raw key');
check(String(translations[0]?.label_bn ?? '').length > 3, 'the Bangla label is real text', translations[0]?.label_bn);

// The nineteen permissions that were already translated must survive the
// restatement: adding one row to an immutable `values` list is the kind of edit
// that silently drops the rest.
const copyCount = await rows(`select count(*)::integer as n from bsdc_permission_copy()`);
check(copyCount[0]?.n >= 26, 'restating the copy function kept every permission that was already translated', String(copyCount[0]?.n));

// ===========================================================================
// 2. Nobody lost a power they had
// ===========================================================================
const lostPower = await rows(`
  select r.role::text as role
    from public.role_permissions r
   where r.permission = 'brand.manage'
     and not exists (select 1 from public.role_permissions p
                      where p.role = r.role and p.permission = 'brand.publish')
`);
check(lostPower.length === 0, 'every role that could publish a theme still can', JSON.stringify(lostPower));

const orphan = await rows(`
  select r.role::text as role
    from public.role_permissions r
   where r.permission = 'brand.publish'
     and not exists (select 1 from public.role_permissions p
                      where p.role = r.role and p.permission = 'brand.manage')
`);
check(orphan.length === 0, 'and no role can publish without being able to edit, because publishing is the larger act', JSON.stringify(orphan));

// ===========================================================================
// 3. Editing without publishing is now expressible
// ===========================================================================
// This is the whole point of the split, so it is proved by taking the right away
// from one person and watching the save succeed while the publish is refused.
const tokens = JSON.stringify({
  surface: '#ffffff',
  text: '#111827',
  'text-muted': '#4b5563',
  primary: '#1d4ed8',
  'on-primary': '#ffffff',
  accent: '#b45309',
  'on-accent': '#ffffff',
});

const saved = await as(OWNER, `select public.save_brand_theme('draft-one', 'Draft One', $t$${tokens}$t$::jsonb) as row`);
check(saved.error === null, 'the owner can save a draft theme with brand.manage alone', saved.error?.message);

// A designer holds brand.manage but not brand.publish, and can prepare a palette
// without being able to ship it.
//
// The role matters: `admin` and `owner` hold both from their baseline, so an admin
// is not the person this proves anything about. A manager has neither by default,
// and is given `brand.manage` as an individual grant — which is exactly how a
// designer gets the ability to prepare a theme on a platform where no role below
// admin owns the palette.
await asSystem(`
  insert into public.permission_grants (subject_uid, permission, reason, granted_by)
  values ('${DESIGNER}', 'brand.manage', 'Preparing the next palette', '${OWNER}')
  on conflict do nothing;
`);
const designerSave = await as(DESIGNER, `select public.save_brand_theme('draft-two', 'Draft Two', $t$${tokens}$t$::jsonb) as row`);
check(designerSave.error === null, 'an editor with brand.manage can save a draft', designerSave.error?.message);

const designerPublish = await as(DESIGNER, `select public.activate_brand_theme('draft-two') as row`);
check(designerPublish.error !== null, 'but the same person cannot put it in front of visitors', designerPublish.error?.message ?? 'published');
check(
  String(designerPublish.error?.message ?? '').toLowerCase().includes('brand.publish'),
  'and the refusal names the permission that is missing, so the fix is obvious',
  designerPublish.error?.message,
);

const stillDraft = await rows(`select is_active from public.brand_themes where key = 'draft-two'`);
check(stillDraft[0]?.is_active === false, 'and nothing became live on the way to being refused');

// ===========================================================================
// 4. Publishing writes a receipt, not a count
// ===========================================================================
const published = await as(OWNER, `select public.activate_brand_theme('draft-one') as row`);
check(published.error === null, 'the owner can publish', published.error?.message);

const live = await rows(`select key, is_active from public.brand_themes where is_active`);
check(live.length === 1 && live[0]?.key === 'draft-one', 'and exactly one theme is live afterwards', JSON.stringify(live));

const auditRow = await rows(`
  select action, subject, metadata
    from public.audit_log
   where action = 'brand.publish' and subject = 'theme:draft-one'
   order by id desc limit 1
`);
check(auditRow.length === 1, 'publishing writes an audit row under its own action, distinguishable from a save', JSON.stringify(auditRow[0]?.action));
check(auditRow[0]?.metadata?.tokens_changed !== undefined, 'the row says how many tokens moved', JSON.stringify(auditRow[0]?.metadata));
check(
  Array.isArray(auditRow[0]?.metadata?.diff),
  'and carries the diff itself, so a reader who was not here can see what changed',
  JSON.stringify(auditRow[0]?.metadata?.diff),
);

// Publish a second theme that differs in one token, and check the receipt names
// that token and only that token.
const changed = JSON.stringify({ ...JSON.parse(tokens), primary: '#7c3aed', 'on-primary': '#ffffff' });
await as(OWNER, `select public.save_brand_theme('draft-three', 'Draft Three', $t$${changed}$t$::jsonb) as row`);
await as(OWNER, `select public.activate_brand_theme('draft-three') as row`);

const secondAudit = await rows(`
  select metadata from public.audit_log
   where action = 'brand.publish' and subject = 'theme:draft-three'
   order by id desc limit 1
`);
const diff = secondAudit[0]?.metadata?.diff ?? [];
check(secondAudit[0]?.metadata?.replaced === 'draft-one', 'the receipt names the theme it replaced', String(secondAudit[0]?.metadata?.replaced));
check(diff.length === 1, 'the diff lists only the token that moved, not every token in the theme', JSON.stringify(diff));
check(diff[0]?.token === 'primary', 'and it names that token', String(diff[0]?.token));
check(
  diff[0]?.before === '#1d4ed8' && diff[0]?.after === '#7c3aed',
  'with its before and after, which is what makes the row a receipt rather than a note',
  JSON.stringify(diff[0]),
);

// Publishing what is already live is a no-op, and says so rather than writing a
// row that looks like a change.
await as(OWNER, `select public.activate_brand_theme('draft-three') as row`);
const noopAudit = await rows(`
  select metadata from public.audit_log
   where action = 'brand.publish' and subject = 'theme:draft-three'
   order by id desc limit 1
`);
check(
  noopAudit[0]?.metadata?.result === 'already live',
  'publishing the live theme again is recorded as a no-op, not as a second publish',
  JSON.stringify(noopAudit[0]?.metadata),
);

const missing = await as(OWNER, `select public.activate_brand_theme('does-not-exist') as row`);
check(missing.error !== null, 'publishing a theme that does not exist is refused');
check(String(missing.error?.message ?? '').includes('does-not-exist'), 'and the refusal names the key that was asked for', missing.error?.message);

// ===========================================================================
// 5. A theme that fails contrast cannot become live
// ===========================================================================
// Written straight into the table, bypassing the save path, because that is the
// path a restore or a hand-run statement takes.
await asSystem(`
  insert into public.brand_themes (key, name, tokens)
  values ('unreadable', 'Unreadable', $t$${JSON.stringify({ ...JSON.parse(tokens), text: '#fefefe' })}$t$::jsonb)
`);
const unreadable = await as(OWNER, `select public.activate_brand_theme('unreadable') as row`);
check(unreadable.error !== null, 'a theme whose body text is unreadable is refused at publish, not only at save', unreadable.error?.message ?? 'published');
check(
  String(unreadable.error?.message ?? '').includes('contrast') ||
    String(unreadable.error?.message ?? '').includes('Contrast'),
  'and the refusal says the problem is contrast rather than permission',
  unreadable.error?.message,
);

const liveAfterRefusal = await rows(`select key from public.brand_themes where is_active`);
check(
  liveAfterRefusal[0]?.key === 'draft-three',
  'and the theme that was live is still live, so a refused publish changes nothing',
  JSON.stringify(liveAfterRefusal),
);

// ===========================================================================
// 6. The console is told before it asks
// ===========================================================================
const readiness = await as(OWNER, `select * from public.brand_publish_readiness('unreadable')`);
check(readiness.error === null, 'readiness answers for a theme that would be refused', readiness.error?.message);
check(
  Array.isArray(readiness.rows[0]?.problems) && readiness.rows[0].problems.length > 0,
  'and lists the failing pairs in words the editor can act on',
  JSON.stringify(readiness.rows[0]?.problems),
);
check(
  String(readiness.rows[0]?.problems?.[0] ?? '').includes(':1'),
  'each problem quotes the ratio it measured',
  JSON.stringify(readiness.rows[0]?.problems),
);

const ready = await as(OWNER, `select * from public.brand_publish_readiness('draft-one')`);
check(ready.rows[0]?.problems?.length === 0, 'a theme that passes has an empty problem list', JSON.stringify(ready.rows[0]?.problems));
check(ready.rows[0]?.can_publish === true, 'and readiness says the actor may publish it');
check(ready.rows[0]?.tokens_changed > 0, 'and how many tokens publishing it would change', String(ready.rows[0]?.tokens_changed));

const designerReadiness = await as(DESIGNER, `select * from public.brand_publish_readiness('draft-two')`);
check(
  designerReadiness.rows[0]?.can_publish === false,
  'an editor without brand.publish is told so before the button is pressed, so the refusal is not a surprise',
  JSON.stringify(designerReadiness.rows[0]?.can_publish),
);

// ===========================================================================
// 7. The diff is usable on its own
// ===========================================================================
const directDiff = await as(OWNER, `select * from public.brand_theme_diff('draft-one', 'draft-three')`);
check(directDiff.error === null, 'the diff can be read between any two named themes', directDiff.error?.message);
check(directDiff.rows.length === 1, 'and returns only the tokens that differ', JSON.stringify(directDiff.rows.map((r) => r.token)));
check(directDiff.rows[0]?.change === 'changed', 'marked as changed rather than added or removed', String(directDiff.rows[0]?.change));
check(
  String(directDiff.rows[0]?.contrast ?? '').includes(':1'),
  'with the contrast of the pair it belongs to, so a reader does not go and look it up',
  String(directDiff.rows[0]?.contrast),
);

const unknownTheme = await as(OWNER, `select * from public.brand_theme_diff('draft-one', 'nope')`);
check(unknownTheme.error !== null, 'diffing against a theme that does not exist is refused', unknownTheme.error?.message);

// A token present in one theme and not the other is reported as added or removed,
// not as a change from empty.
const addedDiff = await asSystem(`
  select * from bsdc.brand_token_diff('{"a":"#000000"}'::jsonb, '{"a":"#000000","b":"#ffffff"}'::jsonb)
`);
check(addedDiff.rows.length === 1 && addedDiff.rows[0]?.change === 'added', 'a token only in the new theme is reported as added', JSON.stringify(addedDiff.rows));
check(addedDiff.rows[0]?.before === '', 'with an empty before, rather than a change from nothing');

const removedDiff = await asSystem(`
  select * from bsdc.brand_token_diff('{"a":"#000000","b":"#ffffff"}'::jsonb, '{"a":"#000000"}'::jsonb)
`);
check(removedDiff.rows[0]?.change === 'removed', 'and a token that disappeared is reported as removed', JSON.stringify(removedDiff.rows));

// ===========================================================================
// 8. It is still staff work, in both directions
// ===========================================================================
const memberPublish = await as(MEMBER, `select public.activate_brand_theme('draft-one') as row`);
check(memberPublish.error !== null, 'a member cannot publish a theme', memberPublish.error?.message ?? 'published');
check(String(memberPublish.error?.code ?? '') === '42501', 'and is refused for lack of permission rather than for lack of a theme', memberPublish.error?.code);

const memberReadiness = await as(MEMBER, `select * from public.brand_publish_readiness('draft-one')`);
check(memberReadiness.error !== null, 'and cannot read the publish readiness either, because it describes the palette before it is public');

const memberDiff = await as(MEMBER, `select * from public.brand_theme_diff('draft-one', 'draft-three')`);
check(memberDiff.error !== null, 'nor the diff between two themes');

const anonPublish = await asSystem(`select public.activate_brand_theme('draft-one') as row`);
check(anonPublish.error !== null, 'and nobody at all can publish without a session');

console.log(`\n${pass} passed, ${bad.length} failed`);
if (bad.length > 0) {
  console.log(bad.map((b) => `  - ${b}`).join('\n'));
  process.exitCode = 1;
}
