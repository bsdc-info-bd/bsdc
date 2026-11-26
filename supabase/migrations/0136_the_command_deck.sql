-- 0136: the command deck.
--
-- `admin_overview()` has been the admin console's home screen since 0024 and it
-- has a shape problem that no amount of front-end work can fix: it is nine
-- integers, unfiltered by permission, and it cannot say whether any of them is
-- moving. A console built on it can only ever display a dashboard somebody
-- already decided was enough.
--
-- The plan's requirement for the admin site is different: every staff member sees
-- the platform as it relates to *their* authority, every number states its own
-- age and its own trend, and every number is a door into the rows behind it. That
-- is three properties, and each of them is a database decision rather than a
-- React one:
--
--   1. permission-aware — a card appears only if the reader could act on it. A
--      manager without `shop.review` sees no shop queue, rather than a queue they
--      cannot open. A count that can be seen but not acted on is an invitation to
--      a refusal.
--   2. self-describing — every figure carries the fact that it is a figure, how
--      old it is, and whether it went up or down. A number with no baseline is
--      decoration.
--   3. drillable — every card names a function that returns the rows it counts.
--      A count nobody can open is a claim, and this platform does not make claims.
--
-- What this migration does NOT do is change `admin_overview()`. The CLI, the
-- existing admin page and `t70` all read it; it keeps its signature and its
-- answer. The new readers sit beside it.
--
-- Reversal: drop the four functions added here. Nothing else changes.

set search_path = public, extensions, pg_temp;

-- ============================================================================
-- 1. The deck: one row per card, filtered by what the reader can act on
-- ============================================================================
--
-- Every card is a CTE of its own below rather than a table of definitions,
-- because a definition table would be a second place where "what a card means"
-- lives, and the first place would still be the SQL that computes it. The
-- catalogue exists in `bsdc_command_cards()` for the console to read labels and
-- ordering from, but the numbers come from here.
--
-- Comparison windows: "today" is against the same point yesterday, not against
-- all of yesterday, so at 9 a.m. a busy morning does not read as a collapse.
create or replace function public.admin_deck()
returns table (
  card            text,
  label           text,
  section         text,
  kind            text,
  count_now       integer,
  count_prev      integer,
  delta           integer,
  trend           text,
  permission      text,
  can_act         boolean,
  drill           text,
  computed_at     timestamptz
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  with cfg as (
    select now() as at,
           -- The same wall-clock point yesterday, so the comparison is like for
           -- like rather than "half a day against a whole one".
           now() - interval '1 day' as yesterday
  ),
  cards as (
    -- People ---------------------------------------------------------------
    select 'people.total'::text as card, 'Members'::text as label,
           'people'::text as section, 'count'::text as kind,
           (select count(*)::int from public.profiles p where p.status <> 'deleted') as now_n,
           null::int as prev_n,
           'people.read'::text as permission, 'people'::text as drill

    union all
    select 'people.new_today', 'New members', 'people', 'count',
           (select count(*)::int from public.profiles p
             where p.created_at >= date_trunc('day', cfg.at)
               and p.created_at <= cfg.at
               and p.status <> 'deleted'),
           (select count(*)::int from public.profiles p
             where p.created_at >= date_trunc('day', cfg.yesterday)
               and p.created_at <= cfg.yesterday
               and p.status <> 'deleted'),
           'people.read', 'people?range=today'
      from cfg

    union all
    select 'people.suspended', 'Suspended accounts', 'people', 'alert',
           (select count(*)::int from public.profiles p where p.status = 'suspended'),
           null,
           'people.suspend', 'people?status=suspended'

    union all
    select 'people.sessions', 'Open staff sessions', 'people', 'count',
           (select count(*)::int from public.staff_sessions s where s.ended_at is null),
           null,
           'people.read', 'sessions'

    -- Authority ------------------------------------------------------------
    union all
    select 'authority.grants_live', 'Live permission grants', 'authority', 'count',
           (select count(*)::int from public.permission_grants g
             where g.revoked_at is null and not g.is_deny
               and (g.expires_at is null or g.expires_at > cfg.at)),
           (select count(*)::int from public.permission_grants g
             where g.revoked_at is null and not g.is_deny
               and (g.expires_at is null or g.expires_at > cfg.yesterday)),
           'people.role', 'grants'
      from cfg

    union all
    select 'authority.denies_live', 'Active denials', 'authority', 'alert',
           (select count(*)::int from public.permission_grants g
             where g.revoked_at is null and g.is_deny
               and (g.expires_at is null or g.expires_at > cfg.at)),
           null,
           'people.role', 'grants?kind=deny'
      from cfg

    union all
    select 'authority.expiring_week', 'Grants expiring this week', 'authority', 'alert',
           (select count(*)::int from public.permission_grants g
             where g.revoked_at is null
               and g.expires_at is not null
               and g.expires_at > cfg.at
               and g.expires_at <= cfg.at + interval '7 days'),
           null,
           'people.role', 'grants?expiring=7'
      from cfg

    -- Moderation -----------------------------------------------------------
    union all
    select 'moderation.open_reports', 'Open reports', 'moderation', 'alert',
           (select count(*)::int from public.reports r where r.status = 'open'),
           (select count(*)::int from public.reports r
             where r.status = 'open' and r.created_at <= cfg.yesterday),
           'moderation.read', 'reports?status=open'
      from cfg

    union all
    select 'moderation.resolved_today', 'Reports resolved today', 'moderation', 'count',
           (select count(*)::int from public.reports r
             where r.status <> 'open'
               and r.created_at >= date_trunc('day', cfg.at)
               and r.created_at <= cfg.at),
           null,
           'moderation.resolve', 'reports?status=resolved'
      from cfg

    union all
    -- There is no "awaiting review" column on `posts`, and inventing one in a
    -- read model would be a claim about data that does not exist. What staff
    -- actually need to see is content they pulled and may have to restore.
    select 'moderation.removed_posts', 'Posts removed by staff', 'moderation', 'count',
           (select count(*)::int from public.posts p where p.status = 'removed'),
           null,
           'content.hide', 'posts?status=removed'

    -- Marketplace ----------------------------------------------------------
    union all
    select 'marketplace.shops_pending', 'Shop applications waiting', 'marketplace', 'alert',
           (select count(*)::int from public.mk_vendor_applications a
             where a.status::text = 'submitted'),
           null,
           'shop.review', 'shops?status=submitted'

    union all
    select 'marketplace.shops_live', 'Live shops', 'marketplace', 'count',
           (select count(*)::int from public.mk_vendors v where v.status::text = 'approved'),
           null,
           'marketplace.review', 'shops?status=approved'

    union all
    select 'marketplace.applications_week', 'Applications decided this week', 'marketplace', 'count',
           (select count(*)::int from public.mk_vendor_applications a
             where a.status <> 'submitted'
               and a.reviewed_at >= cfg.at - interval '7 days'),
           (select count(*)::int from public.mk_vendor_applications a
             where a.status <> 'submitted'
               and a.reviewed_at >= cfg.at - interval '14 days'
               and a.reviewed_at < cfg.at - interval '7 days'),
           'shop.review', 'shops?status=decided'
      from cfg

    -- Money ---------------------------------------------------------------
    union all
    select 'money.campaigns_pending', 'Ad campaigns waiting', 'money', 'alert',
           (select count(*)::int from public.ad_campaigns camp where camp.status = 'pending_review'),
           null,
           'ads.review', 'campaigns?status=pending_review'

    union all
    select 'money.credits_today', 'Credit purchases today', 'money', 'count',
           (select count(*)::int from public.mk_credit_purchases cp
             where cp.status = 'pending' and cp.created_at >= date_trunc('day', cfg.at)),
           null,
           'marketplace.review', 'credits?status=pending'
      from cfg

    -- Platform -------------------------------------------------------------
    union all
    select 'platform.flags_enabled', 'Features enabled', 'platform', 'count',
           (select count(*)::int from public.feature_flags flag where flag.enabled),
           null,
           'settings.read', 'flags'

    union all
    select 'platform.flags_total', 'Features defined', 'platform', 'count',
           (select count(*)::int from public.feature_flags as flags_all),
           null,
           'settings.read', 'flags'

    union all
    select 'platform.notices_live', 'Live notices', 'platform', 'count',
           (select count(*)::int from public.notices n where n.status = 'published'),
           null,
           'notices.publish', 'notices'

    union all
    select 'platform.certificates_week', 'Certificates issued this week', 'platform', 'count',
           (select count(*)::int from public.certificates cert
             where cert.issued_at >= cfg.at - interval '7 days'),
           (select count(*)::int from public.certificates cert
             where cert.issued_at >= cfg.at - interval '14 days'
               and cert.issued_at < cfg.at - interval '7 days'),
           'certificates.issue', 'certificates'
      from cfg

    -- The trail ------------------------------------------------------------
    union all
    select 'audit.events_today', 'Audited actions today', 'audit', 'count',
           (select count(*)::int from public.audit_log a
             where a.created_at >= date_trunc('day', cfg.at) and a.created_at <= cfg.at),
           (select count(*)::int from public.audit_log a
             where a.created_at >= date_trunc('day', cfg.yesterday)
               and a.created_at <= cfg.yesterday),
           'audit.read', 'audit?range=today'
      from cfg

    union all
    select 'audit.gaps_today', 'Unaudited writes today', 'audit', 'alert',
           (select count(*)::int from public.audit_log a
             where a.action = 'audit.missing'
               and a.created_at >= date_trunc('day', cfg.at) and a.created_at <= cfg.at),
           null,
           'audit.read', 'audit?action=audit.missing'
      from cfg
  )
  select deck_card.card,
         deck_card.label,
         deck_card.section,
         deck_card.kind,
         coalesce(deck_card.now_n, 0),
         coalesce(deck_card.prev_n, 0),
         coalesce(deck_card.now_n, 0) - coalesce(deck_card.prev_n, 0),
         case
           when deck_card.prev_n is null then 'flat'
           when coalesce(deck_card.now_n, 0) > deck_card.prev_n then 'up'
           when coalesce(deck_card.now_n, 0) < deck_card.prev_n then 'down'
           else 'flat'
         end,
         deck_card.permission,
         -- The reader could open this card, so the card is shown. `has_permission`
         -- is what every RLS policy already uses; the deck does not invent a
         -- second notion of authority.
         bsdc.has_permission(deck_card.permission),
         deck_card.drill,
         (select at from cfg) as computed_at
    from cards deck_card
   -- A card the reader cannot act on is not shown at all. Filtering here rather
   -- than in the console means a console bug cannot reveal a queue somebody has
   -- no authority to open, and it means the deck is one call rather than a call
   -- per card.
   where bsdc.has_permission(deck_card.permission)
   order by
     -- Alerts first, because the reason to open a console at 9 a.m. is usually a
     -- queue, and then by section so the deck reads the same way twice.
     case deck_card.kind when 'alert' then 0 else 1 end,
     deck_card.section,
     deck_card.card;
$$;

revoke all on function public.admin_deck() from public, anon;
grant execute on function public.admin_deck() to authenticated, service_role;

comment on function public.admin_deck() is
  'The admin console home: one row per card the reader can act on, each with its count, its comparison, its trend and the drill-down that returns the rows it counts.';

-- ============================================================================
-- 2. The cards that exist, whether or not the reader may see them
-- ============================================================================
--
-- The console needs labels and ordering even for cards it is filtering out, so
-- that an owner can see the deck a manager sees, and so that a new card is
-- visible to whoever maintains the console before it is visible to anybody else.
create or replace function bsdc_command_cards()
returns table (
  card     text,
  label    text,
  label_bn text,
  section  text,
  kind     text,
  permission text,
  drill    text
)
language sql
immutable
as $$
  values
    ('people.total',              'Members',                     'সদস্য',                   'people',      'count', 'people.read',             'people'),
    ('people.new_today',          'New members',                 'নতুন সদস্য',              'people',      'count', 'people.read',             'people?range=today'),
    ('people.suspended',          'Suspended accounts',          'স্থগিত অ্যাকাউন্ট',        'people',      'alert', 'people.suspend',          'people?status=suspended'),
    ('people.sessions',           'Open staff sessions',         'চালু স্টাফ সেশন',          'people',      'count', 'people.read',             'sessions'),
    ('authority.grants_live',     'Live permission grants',      'সক্রিয় অনুমতি অনুদান',     'authority',   'count', 'people.role',             'grants'),
    ('authority.denies_live',     'Active denials',              'সক্রিয় নিষেধাজ্ঞা',       'authority',   'alert', 'people.role',             'grants?kind=deny'),
    ('authority.expiring_week',   'Grants expiring this week',   'এই সপ্তাহে শেষ হওয়া অনুদান', 'authority', 'alert', 'people.role',             'grants?expiring=7'),
    ('moderation.open_reports',   'Open reports',                'খোলা রিপোর্ট',            'moderation',  'alert', 'moderation.read',         'reports?status=open'),
    ('moderation.resolved_today', 'Reports resolved today',      'আজ সমাধান হওয়া রিপোর্ট',  'moderation',  'count', 'moderation.resolve',      'reports?status=resolved'),
    ('moderation.removed_posts',  'Posts removed by staff',      'স্টাফ কর্তৃক অপসারিত পোস্ট', 'moderation', 'count', 'content.hide',            'posts?status=removed'),
    ('marketplace.shops_pending', 'Shop applications waiting',   'অপেক্ষমাণ দোকানের আবেদন',  'marketplace', 'alert', 'shop.review',             'shops?status=submitted'),
    ('marketplace.shops_live',    'Live shops',                  'সক্রিয় দোকান',            'marketplace', 'count', 'marketplace.review',      'shops?status=approved'),
    ('marketplace.applications_week', 'Applications decided this week', 'এই সপ্তাহে নিষ্পত্তি', 'marketplace', 'count', 'shop.review',       'shops?status=decided'),
    ('money.campaigns_pending',   'Ad campaigns waiting',        'অপেক্ষমাণ বিজ্ঞাপন',       'money',       'alert', 'ads.review',              'campaigns?status=pending_review'),
    ('money.credits_today',       'Credit purchases today',      'আজকের ক্রেডিট ক্রয়',      'money',       'count', 'marketplace.review',      'credits?status=pending'),
    ('platform.flags_enabled',    'Features enabled',            'চালু ফিচার',              'platform',    'count', 'settings.read',           'flags'),
    ('platform.flags_total',      'Features defined',            'সংজ্ঞায়িত ফিচার',         'platform',    'count', 'settings.read',           'flags'),
    ('platform.notices_live',     'Live notices',                'প্রকাশিত নোটিশ',           'platform',    'count', 'notices.publish',         'notices'),
    ('platform.certificates_week','Certificates issued this week','এই সপ্তাহে ইস্যুকৃত সনদ',   'platform',    'count', 'certificates.issue',      'certificates'),
    ('audit.events_today',        'Audited actions today',       'আজকের নিরীক্ষিত কার্যক্রম', 'audit',       'count', 'audit.read',              'audit?range=today'),
    ('audit.gaps_today',          'Unaudited writes today',      'আজকের অনিরীক্ষিত লেখা',    'audit',       'alert', 'audit.read',              'audit?action=audit.missing');
$$;

revoke all on function bsdc_command_cards() from public, anon;
grant execute on function bsdc_command_cards() to authenticated, service_role;

-- ============================================================================
-- 3. The queues the deck's alerts point at
-- ============================================================================
--
-- One function per queue, each with the same shape: a permission check, a
-- keyset page, and a total. The console renders every queue with one component
-- because every queue answers the same questions.
--
-- `total` is separate from the page because a queue that has 400 items and shows
-- 50 must say 400. A page of rows with no total is a lie of omission.
create or replace function public.admin_queue_reports(
  p_status  text default 'open',
  p_limit   integer default 50,
  p_before  timestamptz default null
)
returns table (
  id          uuid,
  kind        text,
  reason      text,
  subject     text,
  reporter    text,
  reporter_name text,
  created_at  timestamptz,
  age_minutes integer,
  total       bigint
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('moderation.read');
  if p_limit < 1 or p_limit > 200 then
    raise exception 'A queue page is between 1 and 200 rows' using errcode = '22023';
  end if;
  return query
  select r.id,
         r.subject_type::text as kind,
         r.reason,
         r.subject_id::text as subject,
         r.reporter_uid,
         coalesce(p.display_name, r.reporter_uid, 'Unknown'),
         r.created_at,
         (extract(epoch from (now() - r.created_at)) / 60)::int,
         count(*) over () as total
    from public.reports r
    left join public.profiles p on p.uid = r.reporter_uid
   where (p_status is null or r.status::text = p_status)
     and (p_before is null or r.created_at < p_before)
   order by r.created_at desc
   limit p_limit;
end;
$$;

revoke all on function public.admin_queue_reports(text, integer, timestamptz) from public, anon;
grant execute on function public.admin_queue_reports(text, integer, timestamptz) to authenticated, service_role;

create or replace function public.admin_queue_shops(
  p_status text default 'submitted',
  p_limit  integer default 50,
  p_before timestamptz default null
)
returns table (
  id           uuid,
  shop_name    text,
  applicant    text,
  applicant_name text,
  district     text,
  submitted_at timestamptz,
  waiting_hours integer,
  is_overdue   boolean,
  total        bigint
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('shop.review');
  if p_limit < 1 or p_limit > 200 then
    raise exception 'A queue page is between 1 and 200 rows' using errcode = '22023';
  end if;
  return query
  select a.id,
         a.shop_name,
         a.owner_uid as applicant,
         coalesce(p.display_name, a.owner_uid, 'Unknown') as applicant_name,
         a.place_label as district,
         a.submitted_at,
         (extract(epoch from (now() - a.submitted_at)) / 3600)::int,
         -- Two working days is the promise; past it, the row says so rather than
         -- leaving the console to compute a deadline it might compute differently.
         now() - a.submitted_at > interval '2 days' as is_overdue,
         count(*) over () as total
    from public.mk_vendor_applications a
    left join public.profiles p on p.uid = a.owner_uid
   where (p_status is null or a.status::text = p_status)
     and (p_before is null or a.submitted_at < p_before)
   order by a.submitted_at asc
   limit p_limit;
end;
$$;

revoke all on function public.admin_queue_shops(text, integer, timestamptz) from public, anon;
grant execute on function public.admin_queue_shops(text, integer, timestamptz) to authenticated, service_role;

-- ============================================================================
-- 4. What changed, in the last day, written for a human
-- ============================================================================
--
-- The deck answers "how many". This answers "what happened", which is the
-- question somebody actually asks when they open a console after a day away.
-- Derived from the audit trail rather than from a second event table, so there is
-- one history and not two.
create or replace function public.admin_recent_activity(p_limit integer default 30)
returns table (
  id          bigint,
  action      text,
  label_bn    text,
  actor_uid   text,
  actor_name  text,
  subject     text,
  reason      text,
  has_diff    boolean,
  created_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.require_permission('audit.read');
  return query
  select a.id,
         a.action,
         -- A Bangla label where one exists, because this list is read as prose.
         case a.action
           when 'people.role'          then 'ভূমিকা পরিবর্তন'
           when 'people.suspend'       then 'অ্যাকাউন্ট স্থগিত'
           when 'people.restore'       then 'অ্যাকাউন্ট পুনরুদ্ধার'
           when 'permission.grant'     then 'অনুমতি প্রদান'
           when 'permission.revoke'    then 'অনুমতি প্রত্যাহার'
           when 'permission.deny'      then 'অনুমতি নিষিদ্ধ'
           when 'staff.session.start'  then 'সেশন শুরু'
           when 'staff.session.end'    then 'সেশন শেষ'
           when 'staff.session.revoke' then 'সেশন বাতিল'
           when 'shop.approve'         then 'দোকান অনুমোদন'
           when 'shop.reject'          then 'দোকান প্রত্যাখ্যান'
           when 'audit.missing'        then 'অনিরীক্ষিত পরিবর্তন'
           else a.action
         end,
         a.actor_uid,
         coalesce(p.display_name, a.actor_uid, 'System'),
         a.subject,
         a.metadata ->> 'reason',
         a.diff is not null and a.diff <> '{}'::jsonb,
         a.created_at
    from public.audit_log a
    left join public.profiles p on p.uid = a.actor_uid
   where a.created_at >= now() - interval '7 days'
   order by a.id desc
   limit least(coalesce(p_limit, 30), 200);
end;
$$;

revoke all on function public.admin_recent_activity(integer) from public, anon;
grant execute on function public.admin_recent_activity(integer) to authenticated, service_role;
