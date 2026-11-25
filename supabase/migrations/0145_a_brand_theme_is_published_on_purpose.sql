-- ============================================================================
-- 0145 — a brand theme is published by somebody who meant to publish it
-- ============================================================================
--
-- §8.7 of the plan, as database work. The console half — a draft beside the live
-- theme, a contrast ratio under every pair — is `admin-site`; this is what makes
-- those pixels binding rather than decorative.
--
-- Today `activate_brand_theme` is a single permission, `brand.manage`. So one
-- person can change the palette and put it in front of every visitor in the same
-- afternoon, and the audit row says only *that* a theme was activated — not which
-- tokens moved, from what, to what. Those are the two things this migration fixes:
--
--   * **`brand.publish`** is a separate permission from `brand.manage`. Editing a
--     theme stays at `brand.manage`; putting one in front of visitors needs the
--     second right. The plan asks for this because a palette is the one setting
--     whose mistakes are visible to every visitor at once and cannot be undone by
--     the person who is annoyed by them.
--   * **the audit row carries the diff**, token by token, so the question "who made
--     the buttons unreadable" is answered by reading one row rather than by
--     reconstructing history from a series of `brand.save` counts.
--
-- Everything is additive: `activate_brand_theme(text)` keeps its signature and its
-- return type, because 0032's console and the tests that call it must keep working.
-- The diff arrives as a new function, not as a changed return value.

-- ---------------------------------------------------------------------------
-- 1. The permission
-- ---------------------------------------------------------------------------
-- In the catalogue first: `0198`-style guards elsewhere assert that every grantable
-- permission has a label, and a permission that appears in a function before it
-- appears here is one nobody can review.
insert into public.permission_catalogue
  (permission, label, subject_kind, is_destructive, console, grant_rank)
values
  ('brand.publish', 'Put a brand theme in front of every visitor', 'setting', true, 'customize-site', 60)
on conflict (permission) do nothing;

-- The roles that could already activate a theme keep being able to. This is the
-- part that makes the split safe: nobody loses a power they had, and the new
-- permission starts from exactly the set that used to hold `brand.manage`.
--
-- The consequence is deliberate, and it is the whole design: `brand.manage` on its
-- own now means "may edit a theme, may not publish one". An admin who holds both
-- from their role can still do both. A designer given `brand.manage` as an
-- individual grant — which is how a non-admin gets it, since no role baseline below
-- admin includes it — can prepare a palette without being able to ship it. That is
-- the two-person arrangement the plan asks for, expressed with grants that already
-- exist rather than with a new table.
insert into public.role_permissions (role, permission)
select r.role, 'brand.publish'
  from public.role_permissions r
 where r.permission = 'brand.manage'
on conflict (role, permission) do nothing;

-- The permission's Bangla label, which is a `values` list inside a function
-- (`bsdc_permission_copy`, 0138) rather than a table. A permission missing from it
-- renders as its own key in the authority matrix, which reads as a bug rather than
-- as a missing translation, so the function is restated with one row added.
--
-- Restated in full, and identical otherwise: the function is `immutable` and
-- returns a fixed list, so `create or replace` is the only way to add to it, and a
-- partial restatement would silently delete nineteen permissions' translations.
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
    ('brand.publish',     'ব্র্যান্ড প্রকাশ',          'সাইটের চেহারা সব দর্শকের জন্য বদলে দেওয়া যায়', 'Put a theme in front of every visitor'),
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

-- ---------------------------------------------------------------------------
-- 2. What publishing a theme would change
-- ---------------------------------------------------------------------------
-- The diff, computed the same way for the audit row and for the console. A token
-- that was added, removed or changed is one entry; a token that was not touched is
-- not mentioned, because a list of forty unchanged colours is a list nobody reads.
create or replace function bsdc.brand_token_diff(
  p_before jsonb,
  p_after  jsonb
)
returns table (
  token  text,
  before text,
  after  text,
  change text
)
language sql
immutable
set search_path = public, bsdc, extensions, pg_temp
as $$
  with keys as (
    select key from jsonb_object_keys(coalesce(p_before, '{}'::jsonb)) as key
    union
    select key from jsonb_object_keys(coalesce(p_after, '{}'::jsonb)) as key
  )
  select k.key,
         coalesce(p_before ->> k.key, ''),
         coalesce(p_after  ->> k.key, ''),
         case
           when p_before ? k.key and not p_after ? k.key then 'removed'
           when not p_before ? k.key and p_after ? k.key then 'added'
           else 'changed'
         end
    from keys k
   where coalesce(p_before ->> k.key, '') <> coalesce(p_after ->> k.key, '')
   order by k.key;
$$;

comment on function bsdc.brand_token_diff(jsonb, jsonb) is
  'The tokens that differ between two themes, in key order. Unchanged tokens are not listed.';

revoke all on function bsdc.brand_token_diff(jsonb, jsonb) from public, anon;
grant execute on function bsdc.brand_token_diff(jsonb, jsonb) to authenticated, service_role;

-- The diff as the console shows it, with the contrast of each pair that involves a
-- changed token. A count in the audit log is a number; this is the answer.
create or replace function public.brand_theme_diff(p_before text, p_after text)
returns table (
  token    text,
  before   text,
  after    text,
  change   text,
  contrast text
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_before jsonb;
  v_after  jsonb;
begin
  perform bsdc.require_permission('brand.manage');

  if btrim(coalesce(p_before, '')) <> '' then
    select tokens into v_before from public.brand_themes where key = lower(btrim(p_before));
    if v_before is null then
      raise exception 'No theme called %', p_before using errcode = 'P0002';
    end if;
  else
    v_before := '{}'::jsonb;
  end if;

  select tokens into v_after from public.brand_themes where key = lower(btrim(p_after));
  if v_after is null then
    raise exception 'No theme called %', p_after using errcode = 'P0002';
  end if;

  -- The token pairs `bsdc.check_theme_tokens` enforces, in the same order and
  -- with the same minimums. They are `text/surface`, `text-muted/surface`,
  -- `primary/on-primary` and `accent/on-accent` — the names 0032 validates, not
  -- the ones a designer would invent. The pair is walked from the *changed* token,
  -- whichever side of it the token sits on, so changing either half reports the
  -- contrast of the pair it belongs to.
  return query
    select d.token, d.before, d.after, d.change,
           (
             select string_agg(
                      format('%s on %s %s:1', p.fg, p.bg,
                             round(public.brand_contrast(
                               coalesce(v_after ->> p.fg, d.after),
                               coalesce(v_after ->> p.bg, d.after)), 2)),
                      '; ' order by p.fg)
               from (values ('text', 'surface'), ('text-muted', 'surface'),
                            ('on-primary', 'primary'), ('on-accent', 'accent')) as p(fg, bg)
              where d.token in (p.fg, p.bg)
           )
      from bsdc.brand_token_diff(v_before, v_after) d;
end;
$$;

revoke all on function public.brand_theme_diff(text, text) from public, anon;
grant execute on function public.brand_theme_diff(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Publishing
-- ---------------------------------------------------------------------------
-- Same signature, same return type, one more permission check and one richer audit
-- row. Refusals come before the write, so a theme that fails the contrast check
-- never becomes the live theme even for a moment.
create or replace function public.activate_brand_theme(p_key text)
returns public.brand_themes
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_row    public.brand_themes;
  v_live   public.brand_themes;
  v_changed integer;
begin
  -- Two rights, checked separately so the refusal names the one that is missing.
  -- "You need brand.publish" is actionable; "not permitted" is a support ticket.
  perform bsdc.require_permission('brand.manage');
  perform bsdc.require_permission('brand.publish');

  select * into v_row from public.brand_themes where key = lower(btrim(p_key));
  if not found then
    raise exception 'No theme called %', p_key using errcode = 'P0002';
  end if;

  -- The contrast check runs on publish, not only on save, because a theme can reach
  -- this function without having been saved by `save_brand_theme` — a restore, a
  -- backfill, a hand-run insert. Publishing is the moment the palette becomes what
  -- visitors see, so it is the moment the guarantee has to hold.
  perform bsdc.check_theme_tokens(v_row.tokens);

  select * into v_live from public.brand_themes where is_active and key <> v_row.key limit 1;

  if v_row.is_active then
    -- Publishing what is already live is a no-op, and saying so is better than
    -- writing an audit row that looks like a change.
    perform bsdc.audit('brand.publish', 'theme', v_row.key,
      jsonb_build_object('result', 'already live'));
    return v_row;
  end if;

  update public.brand_themes set is_active = false where is_active and key <> v_row.key;
  update public.brand_themes set is_active = true where key = v_row.key returning * into v_row;

  select count(*) into v_changed
    from bsdc.brand_token_diff(coalesce(v_live.tokens, '{}'::jsonb), v_row.tokens);

  -- The audit row is the receipt: which theme, which theme it replaced, how many
  -- tokens moved, and the pairs whose contrast changed. A reader who was not here
  -- can reconstruct the decision from this row alone.
  perform bsdc.audit('brand.publish', 'theme', v_row.key,
    jsonb_build_object(
      'replaced', coalesce(v_live.key, ''),
      'tokens_changed', v_changed,
      'diff', coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'token', d.token, 'before', d.before, 'after', d.after, 'change', d.change)
                order by d.token)
           from bsdc.brand_token_diff(coalesce(v_live.tokens, '{}'::jsonb), v_row.tokens) d),
        '[]'::jsonb)
    ));

  return v_row;
end;
$$;

revoke all on function public.activate_brand_theme(text) from public, anon;
grant execute on function public.activate_brand_theme(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. What the console needs to block the button before it is pressed
-- ---------------------------------------------------------------------------
-- The same answer `activate_brand_theme` would give, without the write: the theme,
-- every pair that fails AA, and whether this actor may publish. A console that
-- disabled a button from its own copy of the contrast arithmetic would eventually
-- disagree with the database, and the disagreement would be found by a visitor.
create or replace function public.brand_publish_readiness(p_key text)
returns table (
  key          text,
  name         text,
  is_active    boolean,
  can_publish  boolean,
  problems     text[],
  tokens_changed integer
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
-- The output column `key` shadows `brand_themes.key`, and so does `name`. Without
-- this the body's unqualified references raise "column reference is ambiguous" the
-- first time it runs. A pragma in the header is a syntax error at the `#`; it
-- belongs here, before `declare`.
#variable_conflict use_column
declare
  v_row  public.brand_themes;
  v_live public.brand_themes;
  v_pairs record;
  v_problems text[] := '{}';
begin
  perform bsdc.require_permission('brand.manage');

  select * into v_row from public.brand_themes where key = lower(btrim(p_key));
  if not found then
    raise exception 'No theme called %', p_key using errcode = 'P0002';
  end if;
  select * into v_live from public.brand_themes where is_active limit 1;

  -- The pairs `check_theme_tokens` enforces, restated as sentences rather than as a
  -- raised exception, because a refusal is useful only if it says what to change.
  for v_pairs in
    select * from (values
      ('text', 'surface', 4.5),
      ('text-muted', 'surface', 4.5),
      ('on-primary', 'primary', 4.5),
      ('on-accent', 'accent', 4.5)
    ) as t(fg, bg, minimum)
  loop
    if v_row.tokens ? v_pairs.fg and v_row.tokens ? v_pairs.bg then
      if public.brand_contrast(v_row.tokens ->> v_pairs.fg, v_row.tokens ->> v_pairs.bg) < v_pairs.minimum then
        v_problems := v_problems || format(
          '%s on %s is %s:1; it needs %s:1',
          v_pairs.fg, v_pairs.bg,
          round(public.brand_contrast(v_row.tokens ->> v_pairs.fg, v_row.tokens ->> v_pairs.bg), 2),
          v_pairs.minimum);
      end if;
    end if;
  end loop;

  return query
    select v_row.key, v_row.name, v_row.is_active,
           bsdc.has_permission('brand.publish'),
           v_problems,
           (select count(*)::integer
              from bsdc.brand_token_diff(coalesce(v_live.tokens, '{}'::jsonb), v_row.tokens));
end;
$$;

revoke all on function public.brand_publish_readiness(text) from public, anon;
grant execute on function public.brand_publish_readiness(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The split did not take anything away
-- ---------------------------------------------------------------------------
-- The safety claim, asserted rather than trusted: every role that could activate a
-- theme before this migration can still activate one, because it now holds both
-- permissions. If this fails, somebody has lost a power they had, and the migration
-- must not be deployed.
do $$
declare
  missing text;
begin
  select string_agg(r.role::text, ', ')
    into missing
    from public.role_permissions r
   where r.permission = 'brand.manage'
     and not exists (
       select 1 from public.role_permissions p
        where p.role = r.role and p.permission = 'brand.publish'
     );
  if missing is not null then
    raise exception 'roles % can edit a theme but would lose the ability to publish one', missing;
  end if;
end;
$$;

-- And the reverse, which is the point of the split: a role may not publish without
-- being able to edit, because publishing is the larger act.
do $$
declare
  orphan text;
begin
  select string_agg(r.role::text, ', ')
    into orphan
    from public.role_permissions r
   where r.permission = 'brand.publish'
     and not exists (
       select 1 from public.role_permissions p
        where p.role = r.role and p.permission = 'brand.manage'
     );
  if orphan is not null then
    raise exception 'roles % can publish a theme without being able to edit one', orphan;
  end if;
end;
$$;
