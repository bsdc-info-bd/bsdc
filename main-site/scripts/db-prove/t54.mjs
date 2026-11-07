/** Proof of exact percentiles, private/finalized report receipts, and faithful reprints. */
import { makeDb } from './lib.mjs';

const db = await makeDb();
let passed = 0;
const failed = [];
const check = (ok, label, detail = '') => {
  if (ok) { passed += 1; console.log(`ok    ${label}`); }
  else { failed.push(label); console.log(`FAIL  ${label} ${detail}`); }
};
const owner = 'aaaaaaaa-1111-4111-8111-000000000001';
const other = 'bbbbbbbb-2222-4222-8222-000000000002';
const member = 'cccccccc-3333-4333-8333-000000000003';
await db.exec(`
  insert into public.profiles (uid, username, display_name, role, status) values
  ('${owner}', 'reportowner', 'Report owner', 'owner', 'active'),
  ('${other}', 'reportother', 'Other staff', 'admin', 'active'),
  ('${member}', 'reportmember', 'Member', 'member', 'active');
  insert into public.web_vitals (app, route, metric, value)
    select 'main-site', '/busy', 'LCP', 0 from generate_series(1, 8);
  insert into public.web_vitals (app, route, metric, value)
    select 'main-site', '/rare', 'LCP', 10000 from generate_series(1, 2);
  insert into public.web_vitals (app, route, metric, value) values
    ('bsdc-cert', '/other', 'LCP', 8000);
  insert into public.edge_timings (app, endpoint, status, duration_ms) values
    ('main-site', '/api', 200, 200), ('bsdc-cert', '/api', 500, 900);
`);
async function caller(uid, role, sql, params = []) {
  const claims = JSON.stringify({ sub: uid, role: 'authenticated', bsdc_role: role, staff: role !== 'member' });
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', $jwt$${claims}$jwt$, false);`);
  try { return { rows: (await db.query(sql, params)).rows, error: null }; }
  catch (error) { return { rows: [], error }; }
  finally { await db.exec('reset role'); }
}
async function anon(sql, params = []) {
  await db.exec(`set role anon; select set_config('request.jwt.claims', '{"role":"anon"}', false);`);
  try { return { rows: (await db.query(sql, params)).rows, error: null }; }
  catch (error) { return { rows: [], error }; }
  finally { await db.exec('reset role'); }
}
const own = (sql, params) => caller(owner, 'owner', sql, params);
const unpriv = (sql, params) => caller(member, 'member', sql, params);
const overall = await own(`select * from public.performance_vitals_overall(28, 'main-site')`);
check(overall.error === null && overall.rows[0]?.samples === 10, 'overall metrics count only the selected app', overall.error?.message);
check(Number(overall.rows[0]?.p75) === 0, 'p75 is computed from raw observations, not averaged route percentiles', JSON.stringify(overall.rows));
const edge = await own(`select * from public.performance_edge_for_app(7, 'bsdc-cert')`);
check(edge.rows[0]?.calls === 1 && Number(edge.rows[0]?.p95) === 900 && Number(edge.rows[0]?.error_rate) === 100,
  'edge timings and errors belong to the selected app', JSON.stringify(edge.rows));
const badRead = await unpriv(`select * from public.performance_vitals_overall(28, 'main-site')`);
check(badRead.error?.code === '42501', 'a member cannot read performance metrics', badRead.error?.message);
check((await unpriv(`select public.record_bundle_size('main-site', 1200, 'abc', 256000)`)).error?.code === '42501',
  'a member cannot forge a CI bundle record');
await db.exec(`set role service_role; select set_config('request.jwt.claims', '{"role":"service_role"}', false);`);
let ciBundle;
try { ciBundle = await db.query(`select (public.record_bundle_size('bsdc-cert', 1200, 'abc', 256000)).app as app`); }
catch (error) { ciBundle = { error, rows: [] }; }
await db.exec('reset role');
check(ciBundle.rows[0]?.app === 'bsdc-cert', 'the real service role can record an app bundle without a staff profile', ciBundle.error?.message);
const args = ['main-site', 28, 'Operations review', ['overall', 'edge']];
const startSql = 'select * from public.start_performance_report($1, $2, $3, $4)';
check((await unpriv(startSql, args)).error?.code === '42501', 'a member cannot allocate a report');
check((await anon(startSql, args)).error?.code === '42501', 'anonymous callers cannot allocate a report');
const start = await own(startSql, args);
const id = start.rows[0]?.receipt_id;
check(start.error === null && typeof id === 'string', 'authorized staff allocate a receipt', start.error?.message);
check((await anon('select * from public.verify_performance_report($1)', [id])).rows.length === 0,
  'pending receipts are not publicly verifiable');
const digest = 'abcdef01'.repeat(8);
check((await caller(other, 'admin', 'select public.finalize_performance_report($1, $2)', [id, digest])).error !== null,
  'a different staff member cannot finalize the receipt');
check((await own('select public.finalize_performance_report($1, $2)', [id, 'not-a-hash'])).error?.code === '22023',
  'malformed hashes are refused');
const finalized = await own('select public.finalize_performance_report($1, $2)', [id, digest]);
check(finalized.error === null && finalized.rows[0]?.finalize_performance_report === true,
  'the issuer finalizes with a SHA-256 fingerprint', finalized.error?.message);
check((await own('select public.finalize_performance_report($1, $2)', [id, digest])).error !== null,
  'a finalized receipt cannot be replaced');
const verified = await anon('select * from public.verify_performance_report($1)', [id]);
check(verified.error === null && verified.rows[0]?.sha256 === digest && verified.rows[0]?.app === 'main-site',
  'anyone with the receipt can retrieve its registered fingerprint', verified.error?.message);
check(!('created_by' in (verified.rows[0] ?? {})) && !('data' in (verified.rows[0] ?? {})),
  'the public result does not disclose the issuer or measurements');
const receiptPolicies = await db.query(`select count(*)::integer as n from pg_policy p
  join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'performance_report_receipts'`);
check(receiptPolicies.rows[0]?.n > 0, 'receipt table has an explicit deny policy as well as revoked grants');
check((await anon('select * from public.performance_report_receipts')).error?.code === '42501',
  'anonymous callers cannot enumerate the receipt table');
check((await own('select * from public.performance_report_receipts')).error?.code === '42501',
  'staff cannot bypass the receipt API with a direct table read');
const issued = await own(`select public.issue_certificate('course-completion', 'Ayesha Rahman', 'Course', null, current_date, null, 'The frozen original body.') as code`);
const code = issued.rows[0]?.code;
check(issued.error === null && typeof code === 'string', 'a certificate is issued for the print test', issued.error?.message);
const printed = await own('select * from public.certificate_for_print($1)', [code]);
check(printed.rows[0]?.body === 'The frozen original body.' && printed.rows[0]?.subject === 'Course',
  'reprinting retrieves the issued body, not only its subject', printed.error?.message);
check((await unpriv('select * from public.certificate_for_print($1)', [code])).error?.code === '42501',
  'a member cannot read the private certificate body');
check((await anon('select * from public.certificate_for_print($1)', [code])).error?.code === '42501',
  'anonymous callers cannot read the private certificate body');
console.log(`SUMMARY: ${passed} passed, ${failed.length} failed`);
await db.close();
if (failed.length) process.exitCode = 1;
