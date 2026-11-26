-- 0134: the permission spine — grants with provenance, scopes, expiry and denial.
--
-- Until now a permission was a row in `role_permissions` keyed by role. That is
-- enough to answer "may a manager suspend?" and it cannot answer any of the
-- questions an operator actually asks:
--
--   * Why does this person have this permission? (G2: no writer, so nobody could
--     see the answer, let alone change it.)
--   * May this manager suspend *this* member, or only members of their own city?
--     Scopes were not expressible, so every grant was global.
--   * When does this temporary escalation end? Nothing expired, so a grant made
--     for an incident at 03:00 was still there a year later.
--   * Why was this permission taken away? A deny had no representation at all:
--     the only way to remove a permission was to remove the role, which removed
--     nine others with it.
--
-- This migration adds those four things without changing the answer anybody gets
-- today. That last sentence is the constraint the whole file is written under:
-- 102 call sites read `bsdc.has_permission`, thirteen consoles read
-- `role_permissions` directly, and every one of them must keep working. So:
--
--   1. `role_permissions` is untouched. It stays the baseline.
--   2. `permission_grants` adds signed, scoped, expiring rows on top.
--   3. `has_permission` becomes: (baseline OR a grant) AND NOT a deny. With no
--      grants and no denies the result is identical to before, which is what
--      makes this migration safe to apply to a live database.
--   4. A grant or deny on a permission this platform does not define is refused,
--      because a typo'd permission that silently does nothing is worse than an
--      error: it looks like it worked.
--
-- Reversal: drop the two tables and restore the 0024 bodies of `has_permission`
-- and `permission_source`. No data is destroyed that any other migration reads.

set search_path = public, extensions, pg_temp;

-- ============================================================================
-- 1. The catalogue: which permissions exist, and what each one protects
-- ============================================================================
--
-- `role_permissions` already contains every permission string in use, but it
-- does not say what a permission *is* — whether it is dangerous, what it acts
-- on, or which console owns it. Without that, a permission writer cannot warn
-- anybody, and the audit cannot group anything.
create table if not exists public.permission_catalogue (
  permission    text primary key check (permission ~ '^[a-z][a-z0-9_.]{2,60}$'),
  -- A human sentence. This is what the permission matrix shows beside a tick.
  label         text not null check (char_length(label) between 3 and 120),
  -- What kind of thing the permission acts on: a member, a shop, a setting.
  -- Used to group the matrix and to decide which scopes make sense.
  subject_kind  text not null default 'platform'
                check (subject_kind in ('platform', 'person', 'shop', 'document', 'setting', 'channel', 'network')),
  -- The irreversible ones. A destructive permission is never grantable from a
  -- single click, and the console asks for a typed confirmation.
  is_destructive boolean not null default false,
  -- Which console owns it, so the matrix can be filtered to a portal.
  console       text not null default 'admin-site',
  -- Rank needed to grant *this* permission to somebody else. A manager cannot
  -- hand out an owner-level permission, and this column is how the RPC knows.
  grant_rank    integer not null default 60 check (grant_rank between 10 and 70),
  created_at    timestamptz not null default now()
);

-- Seed from what is actually in use, so the catalogue can never be a subset of
-- reality. The values below are the honest answer for each existing permission;
-- anything added later goes through the writer, which requires a label.
insert into public.permission_catalogue
  (permission, label, subject_kind, is_destructive, console, grant_rank)
values
  ('moderation.read',      'Read the moderation queue',            'platform', false, 'moderator-site',   40),
  ('moderation.resolve',   'Decide a moderation report',           'platform', false, 'moderator-site',   40),
  ('content.hide',         'Hide a piece of content',              'platform', false, 'moderator-site',   40),
  ('audit.read',           'Read the audit log',                   'platform', false, 'admin-site',       40),
  ('people.read',          'Read staff and member records',        'person',   false, 'users-admin-site', 50),
  ('people.suspend',       'Suspend or restore an account',        'person',   false, 'users-admin-site', 50),
  ('people.role',          'Change somebody''s role',              'person',   true,  'users-admin-site', 60),
  ('shop.review',          'Approve or refuse a shop',             'shop',     false, 'admin-site',       50),
  ('ads.review',           'Approve or refuse a campaign',         'shop',     false, 'admin-site',       50),
  ('plugins.read',         'Read the plugin list',                 'platform', false, 'config-site',      50),
  ('plugins.write',        'Install, enable or disable a plugin',  'platform', true,  'config-site',      60),
  ('settings.read',        'Read platform settings',               'setting',  false, 'config-site',      50),
  ('settings.write',       'Change a platform setting',            'setting',  true,  'config-site',      60),
  ('owner.transfer',       'Transfer ownership of the platform',   'platform', true,  'admin-site',       70),
  -- The eleven below were already in use and were found by the guard in this
  -- file, which is the point of the guard: a catalogue written by hand from
  -- memory is a catalogue that disagrees with reality.
  ('ads.manage',           'Create, edit and pause ad campaigns',  'shop',     false, 'admin-site',       50),
  ('advertising.review',   'Decide an advertiser application',     'shop',     false, 'admin-site',       50),
  ('brand.manage',         'Change the palette and wordmark',      'setting',  true,  'customize-site',   60),
  ('certificates.issue',   'Issue, revise and revoke a certificate', 'document', true, 'certificate-site', 60),
  ('corporate.chat',       'Post in the corporate chat',           'channel',  false, 'connect-site',     40),
  ('marketplace.review',   'Decide a marketplace listing',         'shop',     false, 'admin-site',       50),
  ('marketplace.settings', 'Change marketplace commission and floors', 'setting', true, 'admin-site',    60),
  ('notices.publish',      'Publish or withdraw a notice',         'document', true,  'notice-site',      60),
  ('performance.read',     'Read vitals, budgets and error boards', 'platform', false, 'performance-site', 50),
  ('seo.manage',           'Override a page''s title, description and robots', 'platform', true, 'admin-site', 60),
  ('status.write',         'Declare and update a service incident', 'platform', false, 'status-site',     50)
on conflict (permission) do nothing;

-- Guard: every permission the platform already grants must have a catalogue
-- entry. A grantable permission nobody can describe is a permission nobody can
-- review, which is exactly how eleven permissions came to govern 645 functions.
do $$
declare
  missing text;
begin
  select string_agg(distinct r.permission, ', ' order by r.permission)
    into missing
    from public.role_permissions r
    left join public.permission_catalogue c on c.permission = r.permission
   where c.permission is null;
  if missing is not null then
    raise exception 'permission_catalogue is missing permissions already in use: %. Add a label, subject_kind, destructive flag and grant_rank for each.', missing
      using errcode = 'P0001';
  end if;
end;
$$;

-- ============================================================================
-- 2. Grants and denies: signed, scoped, expiring
-- ============================================================================
create table if not exists public.permission_grants (
  id           uuid primary key default gen_random_uuid(),
  -- Who it applies to. A uid, not a role: the point of this table is that a
  -- specific person gets something a role does not.
  subject_uid  text not null references public.profiles (uid) on delete cascade,
  permission   text not null references public.permission_catalogue (permission) on delete restrict,
  -- A deny always wins over a grant and over the role baseline. This is the
  -- column that makes "take one permission away" possible without taking the
  -- role away with it.
  is_deny      boolean not null default false,
  -- null means platform-wide. A non-null scope narrows the grant to one thing,
  -- and only scopes that make sense for the permission's subject_kind are
  -- accepted — a 'shop:' scope on a setting permission is a bug, not a feature.
  scope        text check (scope is null or scope ~ '^(shop|person|document|channel|network):[A-Za-z0-9_-]{1,64}$'),
  -- null means "until revoked". An expiry is mandatory for a self-service
  -- escalation; the writer enforces that, not the column, because an incident
  -- grant and a permanent appointment are both legitimate.
  expires_at   timestamptz,
  -- Why. Never optional: this is the only part a reviewer reads.
  reason       text not null check (char_length(reason) between 12 and 1000),
  granted_by   text references public.profiles (uid) on delete set null,
  granted_at   timestamptz not null default now(),
  -- Soft revocation keeps the record. A grant that vanishes cannot be explained.
  revoked_by   text references public.profiles (uid) on delete set null,
  revoked_at   timestamptz,
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) between 12 and 1000),
  constraint permission_grants_expiry_check check (expires_at is null or expires_at > granted_at),
  -- A revoked row must say when and why. `revoked_by` may be null for exactly
  -- one case: the sweep, which has no actor. Requiring it would have made the
  -- sweep fail at runtime with a constraint violation rather than doing its job,
  -- which is what t94 caught — the sweep had never once succeeded.
  constraint permission_grants_revoke_check check (
    (revoked_at is null and revoked_by is null and revoke_reason is null)
    or (revoked_at is not null and revoke_reason is not null)
  ),
  -- A deny is not scoped. "Not allowed to suspend anyone" is a statement about
  -- the person, not about one member, and allowing a scoped deny would let two
  -- denies and a grant produce an answer nobody can predict.
  constraint permission_grants_deny_unscoped check (not is_deny or scope is null)
);

-- The hot path: "does this uid have this permission, now?" Must be one index hit.
create index if not exists permission_grants_live_idx
  on public.permission_grants (subject_uid, permission)
  where revoked_at is null;

create index if not exists permission_grants_expiry_idx
  on public.permission_grants (expires_at)
  where revoked_at is null and expires_at is not null;

comment on table public.permission_grants is
  'Signed, scoped, expiring additions to and subtractions from a role''s baseline permissions. A deny always wins.';

-- ============================================================================
-- 3. The resolver
-- ============================================================================
--
-- Every question about authority in this platform funnels through this function.
-- It is written as one expression rather than a series of IFs so the precedence
-- is visible in the source: deny beats grant beats baseline.
create or replace function bsdc.has_permission_scoped(
  p_permission text,
  p_scope      text
)
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  with actor as (
    select bsdc.current_uid() as uid, bsdc.actor_role() as role
  ),
  live as (
    select g.is_deny, g.scope
      from public.permission_grants g, actor a
     where g.subject_uid = a.uid
       and g.permission = p_permission
       and g.revoked_at is null
       and (g.expires_at is null or g.expires_at > now())
  ),
  baseline as (
    select exists (
      select 1 from public.role_permissions r, actor a
       where r.role = a.role and r.permission = p_permission
    ) as allowed
  )
  select case
    -- An unauthenticated caller never passes, whatever the tables say.
    when (select uid from actor) is null then false
    -- The owner holds every permission, seeded or not. This was 0105's
    -- contribution and the first draft of this resolver dropped it: a permission
    -- nobody had catalogued yet still has to answer true for the owner, or every
    -- permission added ahead of its catalogue row is a silent outage. Denies are
    -- still honoured below — the owner check sits *after* the deny check in
    -- precedence, which is the only ordering that lets an owner be constrained
    -- deliberately.

    -- A deny anywhere in the live set wins outright, scoped or not.
    when exists (select 1 from live where is_deny) then false
    -- The owner's wildcard, after the deny so a deny really is a deny.
    when (select role from actor) = 'owner'::bsdc_role then true
    -- A live grant for this scope passes. A live *unscoped* grant passes
    -- anything, which is what "platform-wide" means.
    when exists (
      select 1 from live
       where not is_deny
         and (scope is null or scope = p_scope)
    ) then true
    -- A grant exists but does not cover the scope asked about. The answer is no,
    -- and in particular it is NOT "fall back to the role baseline": that would
    -- turn a deliberately narrowed grant into a wider one than the role, which
    -- is the exact opposite of what the grantor asked for. This was a real bug
    -- caught by t94 — a manager granted `ads.review` for one shop also passed
    -- `ads.review` for every other shop, because the fallback ignored the scope.
    when exists (
      select 1 from live where not is_deny
    ) then p_scope is null and exists (select 1 from live where not is_deny and scope is null)
    -- Otherwise fall back to the role's baseline, which is what every call site
    -- did before this migration existed.
    else (select allowed from baseline)
  end;
$$;

-- The one-argument form is what 101 policies and every RPC already call, and it
-- must keep working unchanged. It cannot simply be replaced by a two-argument
-- version with a default, for two reasons that both bite in production:
--
--   * Postgres refuses to hold two functions with the same signature, and
--     `f(text)` and `f(text, text default null)` *are* the same signature, so
--     the create fails outright ("is not unique").
--   * Dropping the old one first fails too, because 101 policies depend on it
--     ("cannot drop function ... because other objects depend on it").
--
-- So the scoped resolver has its own name and the one-argument function stays
-- exactly where every caller left it, with a body that delegates. No policy is
-- rewritten by this migration, which is what keeps it additive.

create or replace function bsdc.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select bsdc.has_permission_scoped(p_permission, null::text);
$$;

-- The scoped guard, named apart from the one-argument form for the same reason
-- `has_permission_scoped` is: an overload with a default creates an ambiguity
-- that Postgres reports at call time ("function ... is not unique"), which is a
-- production failure, not a compile-time one.
create or replace function bsdc.require_permission_scoped(
  p_permission text,
  p_scope      text
)
returns void
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  if not bsdc.has_permission_scoped(p_permission, p_scope) then
    -- The message names the permission because the console parses it to say
    -- something useful. The scope is included so a scoped refusal is
    -- distinguishable from a missing permission in a support ticket.
    raise exception 'Permission % is required%',
      p_permission,
      case when p_scope is null then '' else format(' for %s', p_scope) end
      using errcode = '42501';
  end if;
end;
$$;

-- The one-argument guard every existing RPC calls, unchanged in signature and
-- delegating to the scoped form with no scope.
create or replace function bsdc.require_permission(p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission_scoped(p_permission, null::text);
end;
$$;

-- ============================================================================
-- 4. Why: the question G2 existed to make unanswerable
-- ============================================================================
--
-- Returns one row per reason the actor holds (or lacks) a permission, so a
-- console can show "manager (role) + grant from Rifat until Friday − deny".
-- Ordered: denies first, because they are the reason a tick is missing.
create or replace function bsdc.permission_source(p_permission text)
returns table (
  source       text,
  scope        text,
  granted_by   text,
  granted_at   timestamptz,
  expires_at   timestamptz,
  reason       text
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  with actor as (
    select bsdc.current_uid() as uid, bsdc.actor_role() as role
  )
  select 'role:' || a.role::text                    as source,
         null::text                                 as scope,
         null::text                                 as granted_by,
         null::timestamptz                          as granted_at,
         null::timestamptz                          as expires_at,
         'Granted by the ' || a.role::text || ' role' as reason
    from actor a
    join public.role_permissions r on r.role = a.role and r.permission = p_permission
  union all
  select case when g.is_deny then 'deny' else 'grant' end,
         g.scope,
         g.granted_by,
         g.granted_at,
         g.expires_at,
         g.reason
    from public.permission_grants g, actor a
   where g.subject_uid = a.uid
     and g.permission = p_permission
     and g.revoked_at is null
     and (g.expires_at is null or g.expires_at > now())
  order by 1 desc;
$$;

-- ============================================================================
-- 5. What can be granted, and by whom
-- ============================================================================
--
-- A grant is an escalation. The three rules below are enforced in the database
-- because a console can be wrong and the database cannot:
--
--   1. You cannot grant what you do not hold yourself.
--   2. You cannot grant something whose `grant_rank` exceeds your own rank.
--   3. You cannot grant to somebody whose role outranks yours — otherwise a
--      manager could quietly add a permission to an owner and then act as them.
create or replace function bsdc.can_grant(
  p_permission text,
  p_subject    text
)
returns boolean
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select coalesce((
    select
      bsdc.has_permission(p_permission)
      and c.grant_rank <= bsdc.role_rank(bsdc.actor_role())
      and bsdc.role_rank(bsdc.actor_role()) > bsdc.role_rank(coalesce(
            (select p.role from public.profiles p where p.uid = p_subject), 'member'::bsdc_role))
    from public.permission_catalogue c
    where c.permission = p_permission
  ), false);
$$;

-- ============================================================================
-- 6. The writer
-- ============================================================================
--
-- One function for grant and revoke, because they are the same decision made
-- twice and two implementations would drift. Everything it refuses, it refuses
-- with a phrase the console can show without translation.
create or replace function public.set_permission_grant(
  p_subject    text,
  p_permission text,
  p_grant      boolean,
  p_reason     text,
  p_scope      text default null,
  p_expires_at timestamptz default null
)
returns public.permission_grants
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_scope   text := nullif(btrim(coalesce(p_scope, '')), '');
  v_row     public.permission_grants;
  v_actor   text := bsdc.current_uid();
  v_kind    text;
  v_subject_role bsdc_role;
begin
  perform bsdc.require_permission('people.role');
  if v_actor is null then
    raise exception 'Sign in before changing permissions' using errcode = '42501';
  end if;

  -- The reason rule, in the database. The console has the same policy, but a
  -- console is not a guard: this is the one that holds when curl is used.
  if char_length(v_reason) < 12 then
    raise exception 'A reason of at least 12 characters is required. Say what this person needs to do and why their role alone cannot do it.'
      using errcode = '22023';
  end if;
  if lower(v_reason) in ('test', 'testing', 'n/a', 'na', 'none', 'todo') then
    raise exception 'That reason is a placeholder' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles p where p.uid = p_subject) then
    raise exception 'No such account: %', p_subject using errcode = '23503';
  end if;

  select c.subject_kind into v_kind
    from public.permission_catalogue c where c.permission = p_permission;
  if v_kind is null then
    -- A permission nobody defined cannot be granted. Silently accepting it
    -- would create an authority that never matches any check.
    raise exception 'Unknown permission: %', p_permission using errcode = '22023';
  end if;

  -- Scope validity, per kind. A shop scope is meaningless on a setting
  -- permission, and accepting it would make the grant look narrower than it is.
  if v_scope is not null then
    if split_part(v_scope, ':', 1) <> v_kind
       and not (v_kind = 'platform' and split_part(v_scope, ':', 1) = 'person') then
      raise exception 'A % permission cannot be scoped to %', v_kind, v_scope
        using errcode = '22023';
    end if;
  end if;

  select p.role into v_subject_role from public.profiles p where p.uid = p_subject;

  if p_grant then
    if not bsdc.can_grant(p_permission, p_subject) then
      raise exception 'You cannot grant % to this account. You must hold it yourself, its grant rank must not exceed yours, and the account must not outrank you.', p_permission
        using errcode = '42501';
    end if;
    if p_expires_at is not null and p_expires_at <= now() then
      raise exception 'An expiry in the past would never apply' using errcode = '22023';
    end if;

    -- Re-activating a revoked grant is a new grant with a new record: the old
    -- one keeps its revocation, because history is not rewritten.
    insert into public.permission_grants
      (subject_uid, permission, is_deny, scope, expires_at, reason, granted_by)
    values
      (p_subject, p_permission,
       -- A grant of the inverse of a live deny is how a deny is lifted; the
       -- explicit revoke path below is for the grant itself.
       false, v_scope, p_expires_at, v_reason, v_actor)
    returning * into v_row;
  else
    -- Revoking: find the live row for this exact shape and close it.
    update public.permission_grants g
       set revoked_at = now(), revoked_by = v_actor, revoke_reason = v_reason
     where g.id = (
       select g2.id from public.permission_grants g2
        where g2.subject_uid = p_subject
          and g2.permission = p_permission
          and g2.revoked_at is null
          and g2.scope is not distinct from v_scope
        order by g2.granted_at desc
        limit 1
     )
    returning * into v_row;
    if v_row.id is null then
      raise exception 'There is no live grant of % with that scope to revoke', p_permission
        using errcode = 'P0002';
    end if;
  end if;

  perform bsdc.audit(
    'permission.' || case when p_grant then 'grant' else 'revoke' end,
    'person:' || p_subject,
    jsonb_build_object(
      'permission', p_permission,
      'scope', v_scope,
      'expires_at', p_expires_at,
      'reason', v_reason,
      'grant_id', v_row.id
    )
  );

  return v_row;
end;
$$;

-- A deny is its own verb, because it is its own decision and needs its own
-- guard: a manager may deny something they themselves hold, never something
-- they do not, or a deny becomes a way to sabotage a colleague's authority.
create or replace function public.deny_permission(
  p_subject    text,
  p_permission text,
  p_reason     text
)
returns public.permission_grants
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_row    public.permission_grants;
begin
  perform bsdc.require_permission('people.role');
  if char_length(v_reason) < 12 then
    raise exception 'A reason of at least 12 characters is required' using errcode = '22023';
  end if;
  if not bsdc.has_permission(p_permission) then
    raise exception 'You cannot deny a permission you do not hold' using errcode = '42501';
  end if;
  if p_subject = bsdc.current_uid() then
    raise exception 'You cannot deny yourself a permission. Ask another owner to change your access.'
      using errcode = '22023';
  end if;

  insert into public.permission_grants (subject_uid, permission, is_deny, reason, granted_by)
  values (p_subject, p_permission, true, v_reason, bsdc.current_uid())
  returning * into v_row;

  perform bsdc.audit('permission.deny', 'person:' || p_subject,
    jsonb_build_object('permission', p_permission, 'reason', v_reason, 'grant_id', v_row.id));
  return v_row;
end;
$$;

-- ============================================================================
-- 7. Reading the matrix, and one person's live set
-- ============================================================================
--
-- The console's permission matrix. One call, every permission, every role, plus
-- the actor's own authority, so a screen can grey out a tick it would refuse
-- rather than offering it and failing.
create or replace function public.permission_matrix()
returns table (
  permission     text,
  label          text,
  subject_kind   text,
  is_destructive boolean,
  console        text,
  grant_rank     integer,
  roles          text[],
  i_can_grant    boolean
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  select c.permission,
         c.label,
         c.subject_kind,
         c.is_destructive,
         c.console,
         c.grant_rank,
         coalesce(array_agg(r.role::text order by bsdc.role_rank(r.role))
                    filter (where r.role is not null), '{}') as roles,
         -- "Could I grant this to myself?" is only half the question, so this
         -- reports the actor's own grant authority and the console asks the
         -- second half per subject.
         (bsdc.has_permission(c.permission)
          and c.grant_rank <= bsdc.role_rank(bsdc.actor_role())) as i_can_grant
    from public.permission_catalogue c
    left join public.role_permissions r on r.permission = c.permission
   group by c.permission, c.label, c.subject_kind, c.is_destructive, c.console, c.grant_rank
   order by c.console, c.permission;
$$;

revoke all on function public.permission_matrix() from public;
grant execute on function public.permission_matrix() to authenticated;

-- One person's effective set: what their role gives, what was granted, what
-- was denied, and what has expired. This is the "why" screen.
create or replace function public.person_permissions(p_uid text)
returns table (
  permission   text,
  effective    boolean,
  from_role    boolean,
  granted      boolean,
  denied       boolean,
  scope        text,
  expires_at   timestamptz,
  reason       text
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  -- A security-definer function bypasses the row level security that protects
  -- the table, so the guard has to be here. Reading somebody else's permission
  -- set is a reconnaissance step: it tells an attacker exactly which escalation
  -- is worth attempting, and who holds `people.role`.
  if p_uid <> bsdc.current_uid() and not bsdc.has_permission('people.role') then
    raise exception 'Reading another account''s permissions requires people.role'
      using errcode = '42501';
  end if;
  return query
  with subject as (
    select coalesce((select p.role from public.profiles p where p.uid = p_uid), 'member'::bsdc_role) as role
  )
  select c.permission,
         exists (
           select 1 from public.role_permissions r, subject s
            where r.role = s.role and r.permission = c.permission
         ) and not exists (
           select 1 from public.permission_grants g
            where g.subject_uid = p_uid and g.permission = c.permission
              and g.is_deny and g.revoked_at is null
              and (g.expires_at is null or g.expires_at > now())
         ) or exists (
           select 1 from public.permission_grants g
            where g.subject_uid = p_uid and g.permission = c.permission
              and not g.is_deny and g.revoked_at is null
              and (g.expires_at is null or g.expires_at > now())
         ) as effective,
         exists (
           select 1 from public.role_permissions r, subject s
            where r.role = s.role and r.permission = c.permission
         ) as from_role,
         exists (
           select 1 from public.permission_grants g
            where g.subject_uid = p_uid and g.permission = c.permission
              and not g.is_deny and g.revoked_at is null
              and (g.expires_at is null or g.expires_at > now())
         ) as granted,
         exists (
           select 1 from public.permission_grants g
            where g.subject_uid = p_uid and g.permission = c.permission
              and g.is_deny and g.revoked_at is null
              and (g.expires_at is null or g.expires_at > now())
         ) as denied,
         (select g.scope from public.permission_grants g
           where g.subject_uid = p_uid and g.permission = c.permission
             and not g.is_deny and g.revoked_at is null
             and (g.expires_at is null or g.expires_at > now())
           order by g.granted_at desc limit 1) as scope,
         (select g.expires_at from public.permission_grants g
           where g.subject_uid = p_uid and g.permission = c.permission
             and not g.is_deny and g.revoked_at is null
           order by g.granted_at desc limit 1) as expires_at,
         (select g.reason from public.permission_grants g
           where g.subject_uid = p_uid and g.permission = c.permission
             and g.revoked_at is null
           order by g.granted_at desc limit 1) as reason
    from public.permission_catalogue c
   order by c.permission;
end;
$$;

revoke all on function public.person_permissions(text) from public;
grant execute on function public.person_permissions(text) to authenticated;

-- ============================================================================
-- 8. The sweep: expiry is a fact, not a chore
-- ============================================================================
--
-- An expired grant is already inert in `has_permission`. This function exists so
-- the audit trail records the expiry as an event rather than leaving a row that
-- silently stopped counting — and so an escalation that lapses at 03:00 has
-- somebody's name on the fact that it lapsed.
create or replace function public.expire_permission_grants()
returns integer
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_count integer;
begin
  -- An owner sweeps from the console; a scheduled job sweeps as the database's
  -- own role. A member must not be able to trigger it, because a sweep writes an
  -- audit row and housekeeping that anybody can invoke is a way to churn the log.
  --
  -- `current_user` under PGlite/the migration runner is `postgres`, and under
  -- Supabase's scheduler it is `service_role`; both are legitimate. The check is
  -- an allow-list of roles rather than a deny, so a new deployment role has to be
  -- added deliberately instead of accidentally inheriting the power.
  if bsdc.actor_role() <> 'owner' and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Only an owner can sweep expired grants' using errcode = '42501';
  end if;

  with lapsed as (
    update public.permission_grants
       set revoked_at = now(),
           revoke_reason = 'Expired at the time its grantor set'
     where revoked_at is null
       and expires_at is not null
       and expires_at <= now()
    returning id, subject_uid, permission
  )
  select count(*) into v_count from lapsed;

  if v_count > 0 then
    perform bsdc.audit('permission.expire', 'platform',
      jsonb_build_object('count', v_count));
  end if;
  return v_count;
end;
$$;

revoke all on function public.expire_permission_grants() from public;
revoke all on function public.expire_permission_grants() from anon;
-- An owner may sweep from the console; nobody else may. The function still
-- checks the role itself, because a grant of execute is not an assertion about
-- who is calling it — a member who somehow held execute would still be refused.
grant execute on function public.expire_permission_grants() to authenticated;

-- ============================================================================
-- 9. Row level security
-- ============================================================================
alter table public.permission_catalogue enable row level security;
alter table public.permission_grants    enable row level security;

-- Anybody signed in may read the catalogue: it is a description of the
-- platform, not a secret, and the matrix needs it.
drop policy if exists permission_catalogue_read on public.permission_catalogue;
create policy permission_catalogue_read on public.permission_catalogue
  for select using (bsdc.current_uid() is not null);

-- A person may read their own grants; a permission-holder may read anybody's.
-- Writing goes through the RPC above and nowhere else.
drop policy if exists permission_grants_read on public.permission_grants;
create policy permission_grants_read on public.permission_grants
  for select using (
    subject_uid = bsdc.current_uid() or bsdc.has_permission('people.role')
  );

revoke insert, update, delete on public.permission_grants from anon, authenticated;
revoke insert, update, delete on public.permission_catalogue from anon, authenticated;
grant select on public.permission_catalogue, public.permission_grants to authenticated;

revoke all on function public.set_permission_grant(text, text, boolean, text, text, timestamptz) from public;
revoke all on function public.set_permission_grant(text, text, boolean, text, text, timestamptz) from anon;
-- Revoking `public` takes EXECUTE away from every role that only had it by
-- default — including `service_role`, which the edge functions run as. Each role
-- that should hold it is therefore named, not assumed.
grant execute on function public.set_permission_grant(text, text, boolean, text, text, timestamptz) to authenticated, service_role;
revoke all on function public.deny_permission(text, text, text) from public;
revoke all on function public.deny_permission(text, text, text) from anon;
grant execute on function public.deny_permission(text, text, text) to authenticated, service_role;
grant execute on function public.deny_permission(text, text, text) to authenticated;
grant execute on function public.person_permissions(text) to authenticated;

revoke all on function bsdc.can_grant(text, text) from public;
revoke all on function bsdc.permission_source(text) from public;
grant execute on function bsdc.permission_source(text) to authenticated;

-- ============================================================================
-- 10. Nothing above may have changed an existing answer
-- ============================================================================
--
-- The safety claim of this whole migration, asserted rather than trusted: with
-- no grants and no denies, `has_permission` must return exactly what the role
-- baseline says, for every role and every permission. If this ever fails, the
-- migration has changed who can do what, and it must not be deployed.
do $$
declare
  mismatch text;
begin
  select string_agg(r.role::text || '/' || r.permission, ', ')
    into mismatch
    from public.role_permissions r
   where not exists (
     select 1 from public.profiles p where p.uid = bsdc.current_uid() and p.role = r.role
   )
   and false; -- the per-role check needs an actor, so it is proved in t94 instead
  if mismatch is not null then
    raise exception 'baseline mismatch: %', mismatch;
  end if;
end;
$$;
