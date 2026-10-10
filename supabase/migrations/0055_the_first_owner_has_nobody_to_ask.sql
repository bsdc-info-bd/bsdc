-- ---------------------------------------------------------------------------
-- The first owner has nobody to ask.
--
-- Report: signing in with the platform's own administrator account and opening
-- /admin answers "You do not have permission for this page. Permissions come
-- from your role. Ask an owner if you believe this is wrong." — and there is no
-- owner to ask, because every path that creates one already requires one.
--
-- The loop, precisely:
--
--   * The panel asks the database: `public.my_permissions()` lists the
--     permissions of `bsdc.actor_role()`.
--   * `bsdc.actor_role()` reads `public.profiles.role`, and every row starts at
--     'member'.
--   * The only writer of that column is `public.set_user_role()`, which begins
--     with `bsdc.require_permission('people.role')` — a permission held by
--     manager and above, and refuses to grant a rank at or above the caller's.
--   * The browser-side claim path cannot help either: `POST /api/auth/claims`
--     mints an elevated claim only for a uid listed in `BSDC_OWNER_UIDS`, a
--     Cloudflare secret that only an owner could have arranged to contain
--     anybody.
--
-- So a fresh deployment has a panel with no door. This migration cuts the loop
-- at the only place that is safe to cut it: an email address that Firebase has
-- already verified. Identity is not asserted by the browser here — it is read
-- out of the signed token the request arrived with.
--
--   bsdc.bootstrap_admins   the addresses that are an administrator by birth,
--                           and the rank each one carries. Not readable by the
--                           roles that connect to PostgREST: the list is not a
--                           public document, and no policy needs it.
--   bsdc.bootstrap_role()   the rank the signed-in token's own email earns, or
--                           NULL. Reads the token and that table, nothing else.
--   bsdc.actor_role()       the higher of the rank on the profile row and the
--                           bootstrap rank. A bootstrap owner is an owner even
--                           before their row says so; a demoted row can never
--                           outrank the bootstrap list, and the list is short
--                           enough to read.
--   bsdc.is_staff()         the signed `staff` claim, or a bootstrap rank of
--                           moderator and above. Deliberately does NOT read
--                           `public.profiles`: `profiles`' own policies call
--                           `is_staff()`, and a function that reads a table
--                           whose policies call it recurses until Postgres
--                           stops it. `bootstrap_role()` reads no such table,
--                           so it is safe here.
--   public.my_role()        what the database thinks of the caller, in one
--                           call: the effective rank, whether that makes them
--                           staff, and whether the bootstrap list is what said
--                           so. The browser reads this to stop trusting a
--                           Firebase claim that predates the rank.
--   public.claim_bootstrap_role()
--                           writes the rank the token already earned onto the
--                           member's own profile row, so the people list, the
--                           audit trail and every later read agree with what
--                           the caller can already do. Idempotent, and it
--                           refuses anybody the bootstrap list does not name.
--
-- Seeded with rrc@bsdc.info.bd, the address the owner named as the platform's
-- main administrator. Adding another is one row; removing one is one delete.
-- Neither requires a deployment, and neither can be done from a browser.
--
-- What this does NOT do: it does not read an email address out of a table a
-- member can write, it does not accept an email from a request body, and it
-- does not treat an unverified address as anybody. An address that has not
-- been proved — no `email_verified` in the token and no federated provider
-- behind it — earns nothing at all. Signing up with somebody's address is not
-- the same as receiving their mail.
-- ---------------------------------------------------------------------------

create table if not exists bsdc.bootstrap_admins (
  email      citext primary key,
  role       bsdc_role not null default 'owner',
  note       text not null default '',
  created_at timestamptz not null default now()
);

-- The list is read through security-definer functions only. Neither PostgREST
-- role may see it: it is not a directory of who administers the platform.
revoke all on bsdc.bootstrap_admins from public;
revoke all on bsdc.bootstrap_admins from anon, authenticated;
grant select, insert, update, delete on bsdc.bootstrap_admins to service_role;

insert into bsdc.bootstrap_admins (email, role, note)
values ('rrc@bsdc.info.bd', 'owner', 'Main administrator of BSDC, named by the owner.')
on conflict (email) do update
  set role = excluded.role,
      note = case when excluded.note = '' then bsdc.bootstrap_admins.note else excluded.note end;

-- ---------------------------------------------------------------------------
-- The rank a signed token's own email earns.
--
-- `email` and `email_verified` are claims Firebase signs, so a browser cannot
-- choose them. A federated sign-in (Google, GitHub, Yahoo) proves the address
-- at the provider, which is why those count as verified too: a member who
-- signed in with Google yesterday and opens the panel today has an
-- `email_verified` of false in some tokens, and turning them away would put
-- the door back where it was.
-- ---------------------------------------------------------------------------
create or replace function bsdc.bootstrap_role()
returns bsdc_role
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  with claims as (
    select coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb as c
  )
  select b.role
  from claims, bsdc.bootstrap_admins b
  where lower(coalesce(claims.c ->> 'email', '')) = lower(b.email::text)
    and coalesce(claims.c ->> 'email', '') <> ''
    and (
      coalesce((claims.c ->> 'email_verified')::boolean, false)
      or coalesce(claims.c -> 'firebase' ->> 'sign_in_provider', '')
         in ('google.com', 'github.com', 'yahoo.com', 'apple.com', 'twitter.com', 'facebook.com')
    )
  limit 1;
$$;

revoke all on function bsdc.bootstrap_role() from public;
grant execute on function bsdc.bootstrap_role() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Authority: the higher of the row and the bootstrap list.
--
-- Keeps its name, its return type and its definer search_path, so the
-- fifty-odd functions and policies that already call it are unchanged. A
-- member with no row at all is still 'member' — unless the list names them,
-- which is exactly the case this migration exists for.
-- ---------------------------------------------------------------------------
create or replace function bsdc.actor_role()
returns bsdc_role
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select case
    when bsdc.role_rank(coalesce(bsdc.bootstrap_role(), 'member'::bsdc_role))
         > bsdc.role_rank(coalesce(p.role, 'member'::bsdc_role))
    then bsdc.bootstrap_role()
    else coalesce(p.role, 'member'::bsdc_role)
  end
  from (select bsdc.current_uid() as uid) me
  left join public.profiles p on p.uid = me.uid;
$$;

-- ---------------------------------------------------------------------------
-- Staff: the signed claim, or a bootstrap rank that earns it.
--
-- Reads the token and the bootstrap list, never `public.profiles` — see the
-- header. This is what lets a bootstrap administrator pass the policies that
-- say `bsdc.is_staff()` before any claim has been minted for them.
-- ---------------------------------------------------------------------------
create or replace function bsdc.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select coalesce(
           (current_setting('request.jwt.claims', true)::jsonb ->> 'staff')::boolean,
           false
         )
      or bsdc.role_rank(coalesce(bsdc.bootstrap_role(), 'member'::bsdc_role))
         >= bsdc.role_rank('moderator'::bsdc_role);
$$;

-- ---------------------------------------------------------------------------
-- One call that tells the browser what the database decided.
--
-- `role` is the effective rank; `staff` follows it; `bootstrap` says whether
-- the list is what granted it, which is the browser's cue to repair its own
-- claims and its profile row. Granted to a signed-in member and to nobody
-- else: an anonymous caller has no rank to ask about.
-- ---------------------------------------------------------------------------
create or replace function public.my_role()
returns table (role text, staff boolean, bootstrap boolean)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    bsdc.actor_role()::text,
    bsdc.role_rank(bsdc.actor_role()) >= bsdc.role_rank('moderator'::bsdc_role),
    bsdc.bootstrap_role() is not null
      and bsdc.role_rank(coalesce(bsdc.bootstrap_role(), 'member'::bsdc_role))
          > bsdc.role_rank(coalesce((
              select p.role from public.profiles p where p.uid = bsdc.current_uid()
            ), 'member'::bsdc_role));
$$;

revoke all on function public.my_role() from public;
grant execute on function public.my_role() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Write the earned rank onto the caller's own row.
--
-- Authority already exists the moment the token arrives; this only makes the
-- stored row agree with it, so `admin_people()`, the audit trail and a later
-- read by a service that does not go through `actor_role()` all tell the same
-- story. It refuses anybody the list does not name, refuses to lower a rank,
-- and audits itself.
-- ---------------------------------------------------------------------------
create or replace function public.claim_bootstrap_role()
returns text
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid      text := bsdc.current_uid();
  v_rank     bsdc_role := bsdc.bootstrap_role();
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

  if bsdc.role_rank(v_existing.role) >= bsdc.role_rank(v_rank) then
    return v_existing.role::text;
  end if;

  update public.profiles set role = v_rank where uid = v_uid;

  perform bsdc.audit('people.role.bootstrap', v_uid,
    jsonb_build_object('role', v_rank::text, 'source', 'bootstrap_admins'));

  return v_rank::text;
end;
$$;

revoke all on function public.claim_bootstrap_role() from public;
grant execute on function public.claim_bootstrap_role() to authenticated, service_role;

comment on table bsdc.bootstrap_admins is
  'Addresses that administer the platform by birth. Read through bsdc.bootstrap_role() only; not exposed to PostgREST roles.';
comment on function bsdc.actor_role() is
  'The higher of the rank on the member''s profile row and the rank their verified email earns in bsdc.bootstrap_admins.';
comment on function bsdc.is_staff() is
  'The signed staff claim, or a bootstrap rank of moderator and above. Never reads public.profiles: profiles'' policies call this function.';
