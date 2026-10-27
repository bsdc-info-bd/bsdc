-- Firebase role/staff claims are cached copies, never continuing authority
-- after database demotion. Preserve verified-email bootstrap, but an existing
-- inactive account must not regain authority through that bootstrap either.
create or replace function bsdc.actor_role()
returns bsdc_role
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select case
    when coalesce(me.uid, '') = '' then 'member'::bsdc_role
    when p.uid is not null and p.status <> 'active' then 'member'::bsdc_role
    when bsdc.role_rank(coalesce(bsdc.bootstrap_role(), 'member'::bsdc_role))
         > bsdc.role_rank(coalesce(p.role, 'member'::bsdc_role))
    then bsdc.bootstrap_role()
    else coalesce(p.role, 'member'::bsdc_role)
  end
  from (select bsdc.current_uid() as uid) me
  left join public.profiles p on p.uid = me.uid;
$$;

create or replace function bsdc.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select bsdc.role_rank(bsdc.actor_role()) >= bsdc.role_rank('moderator'::bsdc_role);
$$;

comment on function bsdc.is_staff() is
  'Current database or verified-email bootstrap authority only; cached staff claims cannot bypass demotion or inactive account status.';
comment on function bsdc.actor_role() is
  'Current active profile role or verified-email bootstrap rank; inactive accounts and absent subjects receive member authority. Firebase role claims do not override this decision.';
