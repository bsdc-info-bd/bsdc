-- Changing a handle, which is not the same thing as claiming one.
--
-- `claim_username` has been the door to a handle since the first schema, and it
-- was written for the moment a member arrives: check the shape, check the
-- reserved list, check nobody else has it, write it. Used a second time by
-- somebody who already has a handle, it does exactly the same thing and leaves
-- three problems behind.
--
-- Every link anybody ever shared, every mention, every bookmark and every search
-- result points at the old address, and the old address stops existing. The site
-- already has a redirects table and an edge function that answers from it before
-- the application loads, so the old address can keep working; it simply was never
-- written to.
--
-- The handle a member lets go of becomes free immediately, and the next person to
-- take it inherits every one of those links. A handle that was somebody's for a
-- year should not be somebody else's tomorrow, so changing one waits.
--
-- And nobody could say who changed what, when. There is an audit log for a role
-- bootstrap and nothing for this.
--
-- The signature is unchanged, so every caller — onboarding, settings, the
-- repository behind them — gets all of it without asking. The first claim is
-- still immediate and free; only a change waits, and only because there is
-- something to wait for.

alter table public.profiles add column if not exists username_changed_at timestamptz;

create index if not exists profiles_username_changed_idx
  on public.profiles (username_changed_at)
  where username_changed_at is not null;

comment on column public.profiles.username_changed_at is
  'When this member last took or changed their handle. The first claim counts, so the next change waits.';

create or replace function public.claim_username(p_username citext)
returns public.profiles
language plpgsql
security definer
set search_path = public, bsdc
as $$
declare
  v_uid      text := bsdc.current_uid();
  v_row      public.profiles;
  v_old      citext;
  v_changed  timestamptz;
  v_cooldown interval := interval '30 days';
begin
  if v_uid is null then
    raise exception 'auth/required' using errcode = '28000';
  end if;

  if p_username !~ '^[a-z0-9_]{3,24}$' or p_username ~ '^_' or p_username ~ '_$' then
    raise exception 'profile/username-invalid' using errcode = '22023';
  end if;

  if exists (select 1 from public.reserved_usernames r where r.username = p_username) then
    raise exception 'profile/username-reserved' using errcode = '22023';
  end if;

  select p.username, p.username_changed_at
    into v_old, v_changed
    from public.profiles p
   where p.uid = v_uid;

  if not found then
    raise exception 'profile/not-found' using errcode = 'P0002';
  end if;

  -- Asking for the handle you already have is not a change. It is answered
  -- rather than refused, because a form that says "keep it" should not become an
  -- error.
  if v_old is not null and lower(v_old::text) = lower(p_username::text) then
    select * into v_row from public.profiles where uid = v_uid;
    return v_row;
  end if;

  if exists (
    select 1 from public.profiles p where p.username = p_username and p.uid <> v_uid
  ) then
    raise exception 'profile/username-taken' using errcode = '23505';
  end if;

  -- Only a change waits. A member arriving has nothing to move and nobody to
  -- misdirect, and making them wait thirty days for a handle they have never had
  -- would be a rule protecting nothing.
  if v_old is not null and v_changed is not null and v_changed > now() - v_cooldown then
    raise exception 'profile/username-cooldown' using errcode = '22023';
  end if;

  update public.profiles
     set username = p_username,
         username_changed_at = now(),
         updated_at = now()
   where uid = v_uid
  returning * into v_row;

  if not found then
    raise exception 'profile/not-found' using errcode = 'P0002';
  end if;

  -- A handle that is being taken up again is somebody's page now, not a redirect
  -- target. Done before the redirect below is written, so that a member who
  -- changes back and forth does not leave the two pointing at each other.
  delete from public.redirects
   where from_path = bsdc.normalise_path('/@' || p_username::text);

  if v_old is not null then
    insert into public.redirects (from_path, to_path, status, note, created_by)
    values (
      bsdc.normalise_path('/@' || v_old::text),
      bsdc.normalise_path('/@' || p_username::text),
      301,
      'handle changed by its owner',
      v_uid
    )
    on conflict (from_path) do update set
      to_path    = excluded.to_path,
      status     = 301,
      note       = excluded.note,
      is_enabled = true,
      created_by = excluded.created_by,
      updated_at = now();
  end if;

  insert into public.audit_log (actor_uid, action, subject, metadata)
  values (
    v_uid,
    case when v_old is null then 'people.username.claim' else 'people.username.change' end,
    v_uid,
    jsonb_build_object('from', v_old, 'to', p_username::text)
  );

  return v_row;
end;
$$;

comment on function public.claim_username(citext) is
  'Take or change a handle. A change waits thirty days, leaves a redirect behind it and is written to the audit log.';

-- When a member may next change their handle, so the settings page can say it
-- instead of letting them find out by pressing the button. Null means now.
create or replace function public.next_username_change()
returns timestamptz
language sql
stable
security definer
set search_path = public, bsdc
as $$
  select case
           -- No handle yet: nothing to wait for.
           when p.username is null then null
           when p.username_changed_at is null then null
           when p.username_changed_at + interval '30 days' > now()
             then p.username_changed_at + interval '30 days'
           -- The wait is over. Null means "now", which is easier for a page to
           -- read than a timestamp that has already passed.
           else null
         end
    from public.profiles p
   where p.uid = bsdc.current_uid();
$$;

revoke all on function public.next_username_change() from public;
grant execute on function public.next_username_change() to authenticated;

comment on function public.next_username_change() is
  'When this member may change their handle again. Null when they may do it now.';
