-- Corporate sign-in must not turn an old Firebase role claim into a new
-- database promotion. Current, active database authority decides permissions;
-- a verified bootstrap administrator is the only self-provisioning exception.
set search_path = public, bsdc, extensions, pg_temp;

create or replace function public.provision_staff(p_display_name text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_email text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'email', '');
  v_name text := btrim(coalesce(p_display_name, ''));
  v_row public.profiles;
  v_bootstrap bsdc_role;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_row from public.profiles p where p.uid = v_uid;
  if found then
    if v_row.status <> 'active' then
      raise exception 'account/suspended' using errcode = '42501';
    end if;
    -- The profile is the source of authority. In particular, an old token
    -- cannot undo an administrator's later demotion.
    return v_row;
  end if;

  if v_name = '' then v_name := split_part(v_email, '@', 1); end if;
  if v_name = '' then v_name := 'Staff'; end if;
  v_bootstrap := bsdc.bootstrap_role();

  -- Firebase's signed role is a cached copy, not authorization to recreate a
  -- deleted staff profile. Verified bootstrap addresses remain able to get
  -- their first owner row; others need a profile granted by an authorized owner.
  insert into public.profiles (uid, display_name, role, status, language, onboarding_complete)
  values (v_uid, left(v_name, 60), coalesce(v_bootstrap, 'member'::bsdc_role), 'active', 'bn', true)
  on conflict (uid) do nothing
  returning * into v_row;

  if found then
    insert into public.audit_log (actor_uid, action, subject, metadata)
    values (v_uid, 'staff.provisioned', v_uid,
      jsonb_build_object('role', v_row.role, 'source',
        case when v_bootstrap is null then 'member' else 'verified_bootstrap' end));
  else
    -- Concurrent sign-ins can both reach the insert; read the winner rather
    -- than failing or changing its role.
    select * into v_row from public.profiles p where p.uid = v_uid;
  end if;

  if v_row.uid is null or v_row.status <> 'active' then
    raise exception 'account/suspended' using errcode = '42501';
  end if;
  return v_row;
end;
$$;

revoke all on function public.provision_staff(text) from public, anon;
grant execute on function public.provision_staff(text) to authenticated;

comment on function public.provision_staff(text) is
  'Creates only the caller profile; current database authority or a verified bootstrap email decides staff access, never a stale Firebase role claim.';

-- The bootstrap rank is denied for an inactive profile by actor_role(). The
-- explicit claim operation must not change an inactive profile either.
create or replace function public.claim_bootstrap_role()
returns text
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_rank bsdc_role := bsdc.bootstrap_role();
  v_existing public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if v_rank is null then
    raise exception 'This account is not a bootstrap administrator' using errcode = '42501';
  end if;

  select * into v_existing from public.profiles where uid = v_uid for update;
  if not found then
    raise exception 'No such member' using errcode = 'P0002';
  end if;
  if v_existing.status <> 'active' then
    raise exception 'account/suspended' using errcode = '42501';
  end if;
  if bsdc.role_rank(v_existing.role) >= bsdc.role_rank(v_rank) then
    return v_existing.role::text;
  end if;

  update public.profiles set role = v_rank where uid = v_uid;
  perform bsdc.audit('people.role.bootstrap', v_uid,
    jsonb_build_object('role', v_rank::text, 'source', 'bootstrap_admins'));
  return v_rank::text;
end;
$$;

revoke all on function public.claim_bootstrap_role() from public, anon;
grant execute on function public.claim_bootstrap_role() to authenticated, service_role;
