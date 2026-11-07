-- Real PostgreSQL proof for corporate authorization. All fixtures roll back.
-- psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/prove-corporate-permissions.sql
\set ON_ERROR_STOP on
begin;

create function pg_temp.assert_true(value boolean, label text)
returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'failed: %', label; end if;
  raise notice 'ok: %', label;
end $$;

create function pg_temp.expect_denied(statement text, label text)
returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'unexpectedly allowed: %', label;
exception when insufficient_privilege then
  raise notice 'ok: %', label;
end $$;

insert into public.profiles(uid, display_name, role, status) values
  ('corp-proof-owner', 'Proof Owner', 'owner', 'active'),
  ('corp-proof-admin', 'Proof Admin', 'admin', 'active'),
  ('corp-proof-member', 'Proof Member', 'member', 'active'),
  ('corp-proof-suspended', 'Proof Suspended', 'owner', 'suspended'),
  ('corp-proof-bootstrap', 'Proof Bootstrap', 'member', 'active'),
  ('corp-proof-advertiser', 'Proof Advertiser', 'member', 'active'),
  ('corp-proof-deleted', 'Proof Deleted', 'owner', 'active');
delete from public.profiles where uid = 'corp-proof-deleted';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"corp-proof-admin","role":"authenticated","bsdc_role":"member"}', true);
select pg_temp.assert_true((select role = 'admin' from public.my_role()),
  'current admin profile outranks an old member claim');
select pg_temp.assert_true((select count(*) > 0 from public.certificate_templates),
  'admin can read certificate templates');
select pg_temp.assert_true((select count(*) >= 0 from public.campaign_owners('', 50)),
  'admin can read the campaign owner directory');
select pg_temp.assert_true((select count(*) > 0 from public.ad_inventory()),
  'admin can read campaign inventory');
select pg_temp.assert_true(public.staff_setup_campaign(
  'corp-proof-advertiser','Real permission proof','cpm',100,10000,10000,
  null,null,'{}','{}','bn',false,'feed','','','','','') is not null,
  'admin creates a campaign');
select public.issue_certificate('course-completion', 'Proof Recipient',
  'Permission proof', null, current_date, null, 'Frozen corporate text') as code \gset
select pg_temp.assert_true((select body = 'Frozen corporate text'
  from public.certificate_for_print(:'code')), 'admin retrieves issued certificate for PDF');
select pg_temp.assert_true(public.finalize_performance_report(receipt_id, repeat('ab', 32)),
  'admin starts and finalizes a performance report')
from public.start_performance_report('main-site', 28, 'Real permission proof', array['overall']);

select set_config('request.jwt.claims',
  '{"sub":"corp-proof-owner","role":"authenticated","bsdc_role":"member"}', true);
select pg_temp.assert_true((select role = 'owner' from public.my_role()),
  'current owner profile outranks an old member claim');
select pg_temp.assert_true(public.staff_setup_campaign(
  'corp-proof-advertiser','Owner permission proof','cpm',100,10000,10000,
  null,null,'{}','{}','bn',false,'feed','','','','','') is not null,
  'owner creates a campaign');

select set_config('request.jwt.claims',
  '{"sub":"corp-proof-member","role":"authenticated","bsdc_role":"owner","staff":true}', true);
select pg_temp.assert_true((select role = 'member' from public.provision_staff('Proof Member')),
  'provisioning does not undo a demotion');
select pg_temp.expect_denied($stmt$select public.staff_setup_campaign(
  'corp-proof-advertiser','Refused campaign','cpm',100,10000,10000,
  null,null,'{}','{}','bn',false,'feed','','','','','')$stmt$,
  'demoted member cannot create a campaign');
select pg_temp.expect_denied($stmt$select public.issue_certificate('course-completion',
  'Proof Recipient','Permission proof',null,current_date,null,'text')$stmt$,
  'demoted member cannot issue a certificate');
select pg_temp.expect_denied($stmt$select * from public.start_performance_report(
  'main-site',28,'Refused report',array['overall'])$stmt$,
  'demoted member cannot create a report');

select set_config('request.jwt.claims',
  '{"sub":"corp-proof-deleted","role":"authenticated","bsdc_role":"owner","staff":true}', true);
select pg_temp.assert_true((select role = 'member' from public.provision_staff('Proof Deleted')),
  'deleted staff profile is recreated only as a member');
select pg_temp.expect_denied($stmt$select public.issue_certificate('course-completion',
  'Proof Recipient','Permission proof',null,current_date,null,'text')$stmt$,
  'deleted staff profile cannot regain access using a stale owner token');

select set_config('request.jwt.claims',
  '{"sub":"corp-proof-suspended","role":"authenticated","bsdc_role":"owner","staff":true}', true);
select pg_temp.expect_denied($stmt$select public.provision_staff('Proof Suspended')$stmt$,
  'suspended staff cannot self-provision');
select pg_temp.expect_denied($stmt$select * from public.start_performance_report(
  'main-site',28,'Refused report',array['overall'])$stmt$,
  'suspended staff cannot create a report');

select set_config('request.jwt.claims',
  '{"sub":"corp-proof-bootstrap","role":"authenticated","bsdc_role":"member","email":"rrc@bsdc.info.bd","email_verified":true}', true);
select pg_temp.assert_true((select role = 'owner' from public.my_role()),
  'verified bootstrap administrator has effective owner permissions');
select pg_temp.assert_true(public.claim_bootstrap_role() = 'owner',
  'active bootstrap administrator can claim their database role');
reset role;
update public.profiles set status = 'suspended' where uid = 'corp-proof-bootstrap';
set local role authenticated;
select pg_temp.expect_denied($stmt$select public.claim_bootstrap_role()$stmt$,
  'suspended bootstrap administrator cannot change their role');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_denied($stmt$select public.provision_staff('Anonymous')$stmt$,
  'anonymous sessions cannot provision a profile');
select pg_temp.expect_denied($stmt$select * from public.start_performance_report(
  'main-site',28,'Refused report',array['overall'])$stmt$,
  'anonymous sessions cannot create a report');
rollback;
