-- 0138: the audit and authority screens.
--
-- 0134 built the permission spine, 0135 built the trail and staff sessions, and
-- 0136 built the deck that points at them. What none of them built is a screen.
-- Every question an owner actually asks — *who can do this, why, and until when*;
-- *who is signed in as me*; *what did this account do before it was suspended* —
-- needs a reader that returns the answer in one shape, and doing that in four
-- separate console queries would put four slightly different definitions of "live
-- grant" in four files.
--
-- This migration is the reading side of the authority screens. It adds no
-- authority, changes no answer, and writes nothing to `audit_log`. Every function
-- here is `stable` and every one names the permission it needs.
--
-- The three screens:
--
--   Authority  the matrix — who holds what, and by which of the three routes
--              (role baseline, grant, or deny). Answers "why" as well as "may".
--   Sessions   who is signed in, from where, for how long, and which accounts
--              show two origins closer together than a person could travel.
--   Subject    one profile, everything that has been done to it: the rows that
--              explain a decision to the person the decision was about.
--
-- Reversal: drop the five functions added here.

set search_path = public, extensions, pg_temp;

-- ============================================================================
-- 1. The authority matrix, by person
-- ============================================================================
--
-- `permission_matrix()` (0134) answers "which roles hold this permission". This
-- answers the other direction — "this person, every permission, and where each
-- answer came from" — which is the shape a disputes conversation needs.
--
-- `via` is the important column. Three routes produce a `true`:
--
--   role   the baseline that came with the account's role
--   grant  a live, signed, scoped grant
--   owner  the wildcard: the owner holds everything
--
-- and two produce a `false`: an explicit deny, or simply nothing. A screen that
-- cannot distinguish "not granted" from "granted then denied" cannot explain
-- itself, and the difference is exactly what a member asks when their access
-- stops working.
create or replace function public.person_authority(p_uid text)
returns table (
  permission   text,
  label        text,
  subject_kind text,
  is_destructive boolean,
  effective    boolean,
  via          text,
  deny_scope   text,
  deny_reason  text,
  grant_scope  text,
  grant_expires_at timestamptz,
  grant_reason text,
  grant_by     text,
  role_rank    integer,
  grant_rank   integer
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_role bsdc_role;
begin
  -- Reading somebody's authority is itself an act of authority, and a person may
  -- always read their own.
  if p_uid is distinct from bsdc.current_uid() then
    perform bsdc.require_permission('people.read');
  end if;

  select p.role into v_role from public.profiles p where p.uid = p_uid;
  if v_role is null then
    raise exception 'No such account: %', p_uid using errcode = '23503';
  end if;

  return query
  with catalogue as (
    select c.permission, c.label, c.subject_kind, c.is_destructive, c.grant_rank
      from public.permission_catalogue c
  ),
  baseline as (
    select r.permission from public.role_permissions r where r.role = v_role
  ),
  live as (
    select g.permission, g.is_deny, g.scope, g.expires_at, g.reason, g.granted_by
      from public.permission_grants g
     where g.subject_uid = p_uid
       and g.revoked_at is null
       and (g.expires_at is null or g.expires_at > now())
  ),
  held as (
    select l.permission
      from live l
     where not l.is_deny and (l.scope is null or l.scope like 'person:%')
     group by l.permission
  ),
  denied as (
    select l.permission, l.scope, l.reason
      from live l
     where l.is_deny
     order by l.scope nulls first
  )
  select c.permission,
         c.label,
         c.subject_kind,
         c.is_destructive,
         -- Effective, in the same precedence the resolver uses: deny, then
         -- grant, then baseline, then the owner's wildcard. Written out rather
         -- than reusing `has_permission_scoped` because this function answers
         -- for *somebody else* and the resolver deliberately answers only for
         -- the caller.
         case
           when d.permission is not null then false
           when h.permission is not null then true
           when v_role = 'owner'::bsdc_role then true
           when b.permission is not null then true
           else false
         end,
         case
           when d.permission is not null then 'denied'
           when h.permission is not null then 'grant'
           when v_role = 'owner'::bsdc_role then 'owner'
           when b.permission is not null then 'role'
           else 'none'
         end,
         d.scope,
         d.reason,
         h2.scope,
         h2.expires_at,
         h2.reason,
         h2.granted_by,
         bsdc.role_rank(v_role),
         c.grant_rank
    from catalogue c
    left join baseline b on b.permission = c.permission
    left join held h on h.permission = c.permission
    left join denied d on d.permission = c.permission
    left join lateral (
      select l.scope, l.expires_at, l.reason, l.granted_by
        from live l
       where l.permission = c.permission and not l.is_deny
       order by l.expires_at nulls last
       limit 1
    ) h2 on true
   order by
     -- Denials first: they are the reason a tick is missing, so they are the
     -- reason somebody opened this screen.
     case when d.permission is not null then 0 else 1 end,
     case when c.is_destructive then 0 else 1 end,
     c.permission;
end;
$$;

revoke all on function public.person_authority(text) from public, anon;
grant execute on function public.person_authority(text) to authenticated, service_role;

-- A one-line answer to "what is this account", for the header of the screen.
create or replace function public.person_authority_summary(p_uid text)
returns table (
  uid            text,
  display_name   text,
  role           bsdc_role,
  status         text,
  effective_from integer,
  granted        integer,
  denied         integer,
  from_role      integer,
  sessions_live  integer,
  last_seen_at   timestamptz,
  last_audited_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  if p_uid is distinct from bsdc.current_uid() then
    perform bsdc.require_permission('people.read');
  end if;
  return query
  select p.uid,
         coalesce(p.display_name, p.username::text),
         p.role,
         p.status::text,
         (select count(*)::int from public.person_authority(p_uid) auth_row where auth_row.effective),
         (select count(*)::int from public.person_authority(p_uid) auth_row where auth_row.via = 'grant'),
         (select count(*)::int from public.person_authority(p_uid) auth_row where auth_row.via = 'denied'),
         (select count(*)::int from public.person_authority(p_uid) auth_row where auth_row.via = 'role'),
         (select count(*)::int from public.staff_sessions s where s.uid = p_uid and s.ended_at is null),
         (select max(s.last_seen_at) from public.staff_sessions s where s.uid = p_uid),
         (select max(a.created_at) from public.audit_log a where a.actor_uid = p_uid)
    from public.profiles p
   where p.uid = p_uid;
end;
$$;

revoke all on function public.person_authority_summary(text) from public, anon;
grant execute on function public.person_authority_summary(text) to authenticated, service_role;

-- ============================================================================
-- 2. The sessions screen
-- ============================================================================
--
-- `my_staff_sessions()` (0135) answers for the caller only. An owner needs the
-- other direction: every live session on the platform, and which of them look
-- wrong.
--
-- "Looks wrong" is deliberately narrow. The function flags three things and
-- nothing else, because a security screen that cries wolf is a security screen
-- nobody reads:
--
--   * two origins for one account inside ninety minutes, from different
--     countries — reported as a pair for a human to judge, never as a verdict;
--   * a session idle past the sweep threshold, which means somebody left a
--     console open on a shared machine;
--   * a session whose role has changed since sign-in, which explains a console
--     that is behaving oddly without accusing anybody of anything.
create or replace function public.admin_staff_sessions(
  p_limit integer default 100,
  p_only_flagged boolean default false
)
returns table (
  id            uuid,
  uid           text,
  display_name  text,
  role_now      bsdc_role,
  role_at_start bsdc_role,
  device_label  text,
  country       text,
  started_at    timestamptz,
  last_seen_at  timestamptz,
  idle_minutes  integer,
  is_flagged    boolean,
  flag_reason   text
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('people.read');
  return query
  with live as (
    select s.*, coalesce(p.display_name, p.username::text, s.uid) as name, p.role as current_role
      from public.staff_sessions s
      left join public.profiles p on p.uid = s.uid
     where s.ended_at is null
  ),
  pairs as (
    select a.uid, a.id as earlier_id, a.country as earlier_country,
           b.country as later_country
      from live a
      join live b
        on b.uid = a.uid
       and b.id <> a.id
       -- Ordered by timestamp *and* id, so two sessions seen in the same second
       -- are still paired exactly once. A plain `>` on the timestamp misses
       -- them entirely, which is not a rare case: two requests arriving in the
       -- same second is what a page reload looks like.
       and (b.last_seen_at, b.id) > (a.last_seen_at, a.id)
       and b.last_seen_at - a.last_seen_at < interval '90 minutes'
     where a.origin_hash <> '' and b.origin_hash <> ''
       and a.origin_hash <> b.origin_hash
       and a.country is distinct from b.country
  ),
  assessed as (
  select l.id,
         l.uid,
         l.name,
         l.current_role,
         l.role_at_start,
         l.device_label,
         l.country,
         l.started_at,
         l.last_seen_at,
         (extract(epoch from (now() - l.last_seen_at)) / 60)::int as idle_minutes,
         -- Flagged when any of the three conditions holds.
         (
           exists (select 1 from pairs pr where pr.uid = l.uid)
           or l.last_seen_at < now() - interval '72 hours'
           or l.role_at_start is distinct from l.current_role
         ) as is_flagged,
         case
           when exists (select 1 from pairs pr where pr.uid = l.uid)
             then 'two origins for one account within 90 minutes'
           when l.last_seen_at < now() - interval '72 hours'
             then 'idle past the sweep threshold'
           when l.role_at_start is distinct from l.current_role
             then format('role changed since sign-in (was %s, now %s)', l.role_at_start, l.current_role)
           else null
         end as flag_reason
    from live l
  )
  select a.id, a.uid, a.name, a.current_role, a.role_at_start,
         a.device_label, a.country, a.started_at, a.last_seen_at,
         (extract(epoch from (now() - a.last_seen_at)) / 60)::int as idle_minutes,
         a.is_flagged, a.flag_reason
    from assessed a
   -- The filter is applied here rather than left to the console, for the same
   -- reason the deck filters in SQL: a screen that returns everything and hides
   -- some of it in the browser is one dev-tools panel away from showing what it
   -- meant to hide. An earlier draft accepted this argument and ignored it,
   -- which is worse than not having it.
   where not p_only_flagged or a.is_flagged
   order by a.is_flagged desc, a.last_seen_at desc
   limit least(coalesce(p_limit, 100), 500);
end;
$$;

revoke all on function public.admin_staff_sessions(integer, boolean) from public, anon;
grant execute on function public.admin_staff_sessions(integer, boolean) to authenticated, service_role;

-- ============================================================================
-- 3. The subject screen: everything done to one account
-- ============================================================================
--
-- When somebody asks "why was my shop refused" or "why can I not post", the
-- answer is a list of rows about them. This is that list: audit rows whose
-- subject names the account or the rows that belong to it, in one call, newest
-- first, with the reason attached.
--
-- It is deliberately *not* a general search. A function that returns every audit
-- row mentioning a string would let anybody with `audit.read` enumerate the whole
-- trail one guess at a time, so the subject must be a uid that exists.
create or replace function public.person_timeline(
  p_uid   text,
  p_limit integer default 100
)
returns table (
  id         bigint,
  action     text,
  action_label text,
  subject    text,
  reason     text,
  has_diff   boolean,
  actor_uid  text,
  actor_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  if p_uid is distinct from bsdc.current_uid() then
    perform bsdc.require_permission('audit.read');
  end if;
  if not exists (select 1 from public.profiles p where p.uid = p_uid) then
    raise exception 'No such account: %', p_uid using errcode = '23503';
  end if;

  return query
  select a.id,
         a.action,
         case a.action
           when 'people.role'          then 'Role changed'
           when 'people.suspend'       then 'Account suspended'
           when 'people.restore'       then 'Account restored'
           when 'people.username.claim' then 'Handle claimed'
           when 'people.username.change' then 'Handle changed'
           when 'permission.grant'     then 'Permission granted'
           when 'permission.revoke'    then 'Permission revoked'
           when 'permission.deny'      then 'Permission denied'
           when 'staff.session.start'  then 'Console session started'
           when 'staff.session.end'    then 'Console session ended'
           when 'staff.session.revoke' then 'Console sessions revoked'
           when 'shop.approve'         then 'Shop approved'
           when 'shop.reject'          then 'Shop refused'
           when 'audit.missing'        then 'Unaudited change'
           else a.action
         end,
         a.subject,
         a.metadata ->> 'reason',
         a.diff is not null and a.diff <> '{}'::jsonb,
         a.actor_uid,
         coalesce(p.display_name, a.actor_uid, 'System'),
         a.created_at
    from public.audit_log a
    left join public.profiles p on p.uid = a.actor_uid
   where a.subject = 'person:' || p_uid
      or a.subject = p_uid
      -- Rows about things that belong to the account: a shop application, a
      -- campaign, a post. The subject is `<kind>:<id>`, so the membership test
      -- is on the id list rather than on a wildcard, which Postgres could not
      -- index anyway.
      or a.subject in (
        select 'shop:' || v.id::text from public.mk_vendors v where v.owner_uid = p_uid
        union all
        select 'application:' || a2.id::text from public.mk_vendor_applications a2 where a2.owner_uid = p_uid
      )
   order by a.id desc
   limit least(coalesce(p_limit, 100), 500);
end;
$$;

revoke all on function public.person_timeline(text, integer) from public, anon;
grant execute on function public.person_timeline(text, integer) to authenticated, service_role;

-- ============================================================================
-- 4. What the screens need to render themselves in either language
-- ============================================================================
--
-- The permission labels are already in the catalogue as English. A Bangla console
-- needs them in Bangla, and it needs the *reason* a permission is destructive in
-- words, because "is_destructive" is a column and a confirmation dialog is a
-- sentence.
create or replace function bsdc_permission_copy()
returns table (
  permission     text,
  label_bn       text,
  why_bn         text,
  why_en         text
)
language sql
immutable
as $$
  values
    ('ads.manage',        'বিজ্ঞাপন পরিচালনা',        'বিজ্ঞাপন তৈরি, সম্পাদনা ও বন্ধ করা যায়', 'Create, edit and pause advertising'),
    ('ads.review',        'বিজ্ঞাপন পর্যালোচনা',      'অন্যের বিজ্ঞাপন অনুমোদন বা প্রত্যাখ্যান করা যায়', 'Approve or refuse somebody else''s advertising'),
    ('advertising.review','বিজ্ঞাপন নীতি পর্যালোচনা',  'বিজ্ঞাপন নীতি প্রয়োগ করা যায়', 'Enforce the advertising policy'),
    ('audit.read',        'নিরীক্ষা পড়া',             'সবার কার্যক্রমের ইতিহাস পড়া যায়', 'Read every account''s activity history'),
    ('brand.manage',      'ব্র্যান্ড পরিচালনা',        'সাইটের চেহারা ও লোগো বদলানো যায়', 'Change the site''s appearance and logo'),
    ('certificates.issue','সনদ ইস্যু',                 'সনদ তৈরি ও বাতিল করা যায়', 'Issue and revoke certificates'),
    ('content.hide',      'কনটেন্ট লুকানো',           'পোস্ট সবার চোখ থেকে সরানো যায়', 'Remove a post from public view'),
    ('corporate.chat',    'কর্পোরেট চ্যাট',            'কর্মীদের সঙ্গে অভ্যন্তরীণ বার্তা', 'Internal messages with staff'),
    ('marketplace.review','মার্কেটপ্লেস পর্যালোচনা',   'দোকান ও ক্রয় অনুমোদন করা যায়', 'Approve shops and credit purchases'),
    ('marketplace.settings','মার্কেটপ্লেস সেটিংস',    'দোকানের নিয়ম ও দাম বদলানো যায়', 'Change marketplace rules and prices'),
    ('moderation.read',   'মডারেশন পড়া',              'রিপোর্ট ও অভিযোগ দেখা যায়', 'See reports and complaints'),
    ('moderation.resolve','মডারেশন নিষ্পত্তি',        'রিপোর্ট নিষ্পত্তি বা খারিজ করা যায়', 'Resolve or dismiss reports'),
    ('notices.publish',   'নোটিশ প্রকাশ',             'সবার কাছে নোটিশ প্রকাশ করা যায়', 'Publish notices to everybody'),
    ('owner.transfer',    'মালিকানা হস্তান্তর',       'প্ল্যাটফর্মের মালিকানা অন্যকে দেওয়া যায়', 'Hand the platform to another account'),
    ('people.read',       'মানুষ পড়া',                'সদস্যদের প্রোফাইল ও সেশন দেখা যায়', 'See member profiles and sessions'),
    ('people.role',       'ভূমিকা পরিবর্তন',          'কেউ কে কী করতে পারবে তা বদলানো যায়', 'Change what somebody is allowed to do'),
    ('people.suspend',    'অ্যাকাউন্ট স্থগিত',        'কাউকে সাইট থেকে সাময়িকভাবে বন্ধ করা যায়', 'Shut an account out of the site'),
    ('performance.read',  'কর্মক্ষমতা পড়া',           'সাইটের গতি ও ত্রুটি দেখা যায়', 'See site speed and errors'),
    ('plugins.read',      'প্লাগইন পড়া',              'কোন প্লাগইন চালু আছে তা দেখা যায়', 'See which plugins are running'),
    ('plugins.write',     'প্লাগইন পরিবর্তন',         'সাইটে কোড চালু বা বন্ধ করা যায়', 'Turn code on or off in the running site'),
    ('seo.manage',        'এসইও পরিচালনা',            'সার্চ ইঞ্জিনের জন্য শিরোনাম ও বর্ণনা বদলানো যায়', 'Change titles and descriptions search engines read'),
    ('settings.read',     'সেটিংস পড়া',              'সাইটের কনফিগারেশন দেখা যায়', 'See the site''s configuration'),
    ('settings.write',    'সেটিংস পরিবর্তন',         'সাইটের আচরণ বদলানো যায়', 'Change how the platform behaves'),
    ('shop.review',       'দোকান পর্যালোচনা',         'দোকানের আবেদন দেখা ও মন্তব্য করা যায়', 'See and comment on shop applications'),
    ('status.write',      'স্ট্যাটাস লেখা',           'সবার জন্য স্ট্যাটাস বিজ্ঞপ্তি দেওয়া যায়', 'Post a status update for everybody');
$$;

revoke all on function bsdc_permission_copy() from public, anon;
grant execute on function bsdc_permission_copy() to authenticated, service_role;
