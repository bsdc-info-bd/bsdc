-- ============================================================================
-- 0146 — a person's record, an appeal nobody judges alone, and a ladder that
--        says what comes next
-- ============================================================================
--
-- §10.1 and §10.2 of the plan, as database work. Three features, one subject:
-- what has happened to a person, what they can do about it, and what happens if
-- it happens again.
--
-- The design principle running through all three is that **the console must not
-- be the only guard** and **a decision must carry the reason it was made**. So
-- every rule here is enforced where the row is written, and every read returns
-- enough that a screen cannot invent a different answer.

-- ---------------------------------------------------------------------------
-- 1. The person timeline
-- ---------------------------------------------------------------------------
-- The question an escalation asks is "what did they do, what was done about it,
-- and what is open right now". Answering it from six consoles is what makes an
-- escalation take an hour, so it is answered here in one read.
--
-- The hard part is not the union — it is that the sources disagree about what
-- "when" means:
--
--   * a report has `created_at`, exact;
--   * a moderation action has `created_at`, exact;
--   * a certificate has `issued_at`, exact;
--   * a standing entry has `created_at`, exact and already backdated when a
--     reconciler writes it;
--   * a role change is only in the audit log, which has `created_at`.
--
-- All five carry a real clock, so none of them needs a precision flag. That is a
-- fact about this schema rather than a general truth, and it is asserted below
-- rather than assumed: the day a source arrives with only a date, this function
-- must not silently pretend the event happened at midnight.
create or replace function public.person_timeline_full(p_uid text, p_limit integer default 200)
returns table (
  occurred_at timestamptz,
  kind        text,
  summary     text,
  detail      text,
  reference   text
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
-- `kind` is an output column and `kind` is also a column in `notifications`, which
-- joins below. Without this the reference is ambiguous the first time it runs.
#variable_conflict use_column
declare
  v_uid text := btrim(coalesce(p_uid, ''));
begin
  perform bsdc.require_permission('people.read');
  if v_uid = '' then
    raise exception 'A timeline needs a person to be about' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'A timeline page holds between 1 and 1000 events' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.uid = v_uid) then
    raise exception 'No person with uid %', v_uid using errcode = 'P0002';
  end if;

  return query
  with events as (
    -- Reports *about* them, and reports *they filed*. Both matter: a person who
    -- reports twelve people in an afternoon is a fact about them.
    select r.created_at as occurred_at,
           case when r.reporter_uid = v_uid then 'report.filed' else 'report.about' end as kind,
           r.reason as summary,
           left(coalesce(r.details, ''), 300) as detail,
           r.id::text as reference
      from public.reports r
     where r.reporter_uid = v_uid
        or (r.subject_type = 'person' and r.subject_id = v_uid)

    union all

    -- What we did to them. `subject_id` is a text column, so a person subject is
    -- one whose type is 'person'; anything else is content and is not this list.
    select m.created_at,
           'moderation.' || m.action,
           m.reason,
           left(coalesce(m.reason, ''), 300),
           m.id::text
      from public.moderation_actions m
     where m.subject_type = 'person' and m.subject_id = v_uid

    union all

    -- Standing, which is the ledger and therefore the reason a score moved.
    select s.created_at,
           'standing.' || s.rule_key,
           coalesce(rl.label, s.rule_key),
           format('%s%s points%s', case when s.points >= 0 then '+' else '' end, s.points,
                  case when s.expires_at is null then '' else
                    format(', expires %s', to_char(s.expires_at, 'YYYY-MM-DD')) end),
           s.id::text
      from public.standing_entries s
      left join public.standing_rules rl on rl.key = s.rule_key
     where s.uid = v_uid

    union all

    -- Certificates they hold, because an escalation about identity often turns on
    -- one.
    select c.issued_at,
           case when c.revoked_at is null then 'certificate.issued' else 'certificate.revoked' end,
           format('%s (%s)', c.course_title, c.code),
           c.recipient_name,
           c.id::text
      from public.certificates c
     where c.uid = v_uid

    union all

    -- Role changes live only in the audit log. The subject is stored as
    -- 'person:<uid>' by the authority writer, so that prefix is the match.
    select a.created_at,
           'role.changed',
           coalesce(a.metadata ->> 'to', 'role changed'),
           coalesce(a.metadata ->> 'reason', ''),
           a.subject
      from public.audit_log a
     where a.action in ('people.role', 'role.change')
       and a.subject = 'person:' || v_uid

    union all

    -- Their own cases, as the case row rather than as every event inside it: a
    -- closed case with forty notes is one line in a timeline, and the notes are
    -- behind `admin_case`.
    select c.created_at,
           'case.opened',
           coalesce(c.outcome_message_key, 'A case'),
           format('%s%s', c.status,
                  case when c.outcome is null then '' else format(', %s', c.outcome) end),
           c.id::text
      from public.cases c
     where c.subject_uid = v_uid

    union all

    -- Appeals they filed: the thing that exists only because of §10.
    select ap.created_at,
           'appeal.filed',
           ap.grounds_summary,
           ap.status,
           ap.id::text
      from public.appeals ap
     where ap.appellant_uid = v_uid
  )
  select e.occurred_at, e.kind, e.summary, e.detail, e.reference
    from events e
   order by e.occurred_at desc, e.reference desc
   limit p_limit;
end;
$$;

revoke all on function public.person_timeline_full(text, integer) from public, anon;
grant execute on function public.person_timeline_full(text, integer) to authenticated, service_role;

-- The open-items strip: the part of the record that says what needs somebody
-- today. Counted rather than listed, because the list is the timeline and the
-- count is what belongs on a card.
create or replace function public.person_open_items(p_uid text)
returns table (
  open_reports   integer,
  open_cases     integer,
  open_appeals   integer,
  active_standing integer,
  is_suspended   boolean,
  last_action_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
-- Every output column below is also a column in some table this reads, and
-- `is_suspended` collides with nothing today but will the day a column is named
-- that. The pragma costs nothing and prevents the class of bug entirely.
#variable_conflict use_column
declare
  v_uid text := btrim(coalesce(p_uid, ''));
begin
  perform bsdc.require_permission('people.read');
  if not exists (select 1 from public.profiles p where p.uid = v_uid) then
    raise exception 'No person with uid %', v_uid using errcode = 'P0002';
  end if;

  return query
  select
    (select count(*)::integer from public.reports r
      where r.status = 'open'
        and (r.reporter_uid = v_uid or (r.subject_type = 'person' and r.subject_id = v_uid))),
    (select count(*)::integer from public.cases c
      where c.subject_uid = v_uid and c.status <> 'closed'),
    (select count(*)::integer from public.appeals ap
      where ap.appellant_uid = v_uid and ap.status in ('open', 'under_review')),
    (select coalesce(sum(s.points), 0)::integer from public.standing_entries s
      where s.uid = v_uid
        and s.revoked_at is null
        and (s.expires_at is null or s.expires_at > now())),
    coalesce((select p.status = 'suspended' from public.profiles p where p.uid = v_uid), false),
    (select max(m.created_at) from public.moderation_actions m
      where m.subject_type = 'person' and m.subject_id = v_uid);
end;
$$;

revoke all on function public.person_open_items(text) from public, anon;
grant execute on function public.person_open_items(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. A notice that is not a repeat
-- ---------------------------------------------------------------------------
-- `notifications` carries a unique index over (uid, actor, kind, post, comment,
-- conversation, subject_key) so that a like, a reply or a follow collapses into one
-- line with a newer timestamp rather than ringing the bell every time. That is right
-- for those events and wrong for two in this migration: a second ladder step is a
-- more serious decision than the first and must not overwrite its message, and an
-- appeal decision is never a repeat of an earlier one.
--
-- The mechanism already exists. 0139 added `subject_key` to the index for exactly
-- this reason, and the two writers below use it with the decision's own id. No
-- schema change is needed here — the first draft of this migration added a second
-- column doing the same job, which `t100` caught by failing ten checks about
-- receipts that had nothing to do with it.

-- ---------------------------------------------------------------------------
-- 3. The warning ladder
-- ---------------------------------------------------------------------------
-- A policy row per severity names the step, and the member-facing message names
-- the next one. The reason the *next* step is in the message is written in the
-- plan and is worth repeating: a member who can see the next step argues with a
-- decision, and a member who cannot argues with the system.
-- The ladder writes to the standing ledger, so each rung must name a rule the
-- ledger already knows. Seeding them here rather than letting `apply_warning_ladder`
-- invent a key is the same discipline 0143 applied to its own rules: a penalty that
-- appears in a ledger without a catalogue row is a penalty nobody can review.
insert into public.standing_rules (key, label, default_points, expires_after_days, manual_only) values
  ('ladder.low',      'A note about a guideline',      -3,   30, true),
  ('ladder.normal',   'A formal warning',             -10,   90, true),
  ('ladder.high',     'A restriction on posting',     -25,  180, true),
  ('ladder.critical', 'A suspension pending review',  -50, null, true)
on conflict (key) do nothing;

create table if not exists public.warning_policy (
  severity      text primary key check (severity in ('critical', 'high', 'normal', 'low')),
  -- The ladder is a sequence of named rungs, so the table says which rung a
  -- severity reaches rather than storing a number nobody can interpret later.
  rung          text not null check (rung in ('nudge', 'warning', 'restriction', 'suspension_review')),
  -- Points written to the standing ledger when this rung is taken. Non-negative:
  -- a ladder never rewards, and a negative here would make a warning a gift.
  points        integer not null check (points >= 0),
  -- Which ledger rule this rung writes. Null only when points is zero, because a
  -- rung that takes no standing has nothing to name.
  rule_key      text references public.standing_rules (key) on delete restrict,
  -- How long the effect lasts. Null means until it is lifted by hand, which is
  -- only legitimate for the top rung.
  duration_days integer check (duration_days is null or duration_days between 1 and 3650),
  -- The sentence the member reads, and the sentence that names what comes next.
  message_en    text not null check (char_length(btrim(message_en)) between 12 and 400),
  message_bn    text not null check (char_length(btrim(message_bn)) between 6 and 400),
  updated_at    timestamptz not null default now(),
  -- Only the top rung may be indefinite, and only it may be indefinite for the
  -- reason that a suspension review is a decision a person has to take.
  constraint warning_policy_indefinite_only_at_top
    check (duration_days is not null or rung = 'suspension_review'),
  -- Points without a rule would be a ledger entry nothing can explain, and a rule
  -- without points is a reference that does nothing.
  constraint warning_policy_rule_matches_points
    check ((points = 0 and rule_key is null) or (points > 0 and rule_key is not null))
);

insert into public.warning_policy (severity, rung, points, rule_key, duration_days, message_en, message_bn)
values
  ('low',      'nudge',             0,   null,          30,
   'A note has been added to your account. Nothing has been restricted; please read the community guidelines.',
   'আপনার অ্যাকাউন্টে একটি নোট যোগ করা হয়েছে। কোনো কিছু সীমিত করা হয়নি; অনুগ্রহ করে কমিউনিটি নির্দেশিকা পড়ুন।'),
  ('normal',   'warning',          10,   'ladder.normal',  90,
   'This is a formal warning. The next step for a repeated issue is a restriction on posting.',
   'এটি একটি আনুষ্ঠানিক সতর্কতা। একই বিষয় আবার ঘটলে পরবর্তী পদক্ষেপ হবে পোস্ট করার অনুমতি সীমিত করা।'),
  ('high',     'restriction',      25,   'ladder.high',   180,
   'Posting has been restricted for a period. The next step for a repeated issue is a suspension review.',
   'একটি নির্দিষ্ট সময়ের জন্য পোস্ট করা সীমিত করা হয়েছে। একই বিষয় আবার ঘটলে পরবর্তী পদক্ষেপ হবে স্থগিতাদেশ পর্যালোচনা।'),
  ('critical', 'suspension_review', 50, 'ladder.critical', null,
   'Your account has been suspended pending review. A person will review this decision, and you may appeal it.',
   'পর্যালোচনার জন্য আপনার অ্যাকাউন্ট স্থগিত করা হয়েছে। একজন ব্যক্তি এই সিদ্ধান্ত পর্যালোচনা করবেন, এবং আপনি এর বিরুদ্ধে আপিল করতে পারেন।')
on conflict (severity) do nothing;

alter table public.warning_policy enable row level security;

-- Readable by anybody, including signed-out visitors: these rows are the sentences
-- a member is shown, and a member reading the guidelines before posting is the
-- case this feature exists for. Writes go through the migration, not a policy.
drop policy if exists warning_policy_read on public.warning_policy;
create policy warning_policy_read on public.warning_policy
  for select using (true);

revoke all on public.warning_policy from anon, authenticated;
grant select on public.warning_policy to anon, authenticated;

-- What the ladder says for a severity, and what comes after it. The "next rung"
-- is derived from the ordering rather than stored, because a stored copy is the
-- thing that goes stale when somebody reorders the ladder.
create or replace function public.warning_ladder(p_severity text default null)
returns table (
  severity      text,
  rung          text,
  points        integer,
  rule_key      text,
  duration_days integer,
  message_en    text,
  message_bn    text,
  next_rung     text
)
language sql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
  with ranked as (
    select w.*,
           lead(w.rung) over (
             order by case w.rung
                        when 'nudge' then 1
                        when 'warning' then 2
                        when 'restriction' then 3
                        else 4
                      end
           ) as next_rung
      from public.warning_policy w
  )
  select r.severity, r.rung, r.points, r.rule_key, r.duration_days, r.message_en, r.message_bn, r.next_rung
    from ranked r
   where p_severity is null or r.severity = p_severity
   order by case r.rung
              when 'nudge' then 1
              when 'warning' then 2
              when 'restriction' then 3
              else 4
            end;
$$;

revoke all on function public.warning_ladder(text) from public, anon;
grant execute on function public.warning_ladder(text) to authenticated, service_role;

-- Taking a rung. This is the write that a moderator's "warn" button becomes, and
-- it does three things at once so that no caller can do two of them: it records
-- the moderation action, writes the standing entry, and notifies the member with
-- the message for that rung and the name of the next one.
create or replace function public.apply_warning_ladder(
  p_uid      text,
  p_severity text,
  p_reason   text,
  p_case_id  uuid default null
)
returns public.moderation_actions
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_actor  text := bsdc.current_uid();
  v_uid    text := btrim(coalesce(p_uid, ''));
  v_policy public.warning_policy;
  v_next   text;
  v_action public.moderation_actions;
  v_body   text;
  v_expires timestamptz;
begin
  perform bsdc.require_permission('moderation.resolve');

  if v_uid = '' or not exists (select 1 from public.profiles p where p.uid = v_uid) then
    raise exception 'No person with uid %', v_uid using errcode = 'P0002';
  end if;
  if p_severity is null or p_severity not in ('critical', 'high', 'normal', 'low') then
    raise exception 'A rung is one of critical, high, normal or low, not %', p_severity
      using errcode = '22023';
  end if;
  -- Twelve characters, the same floor the rest of the platform uses for a reason.
  -- A ladder step is an action against a person and the sentence they read is
  -- built from this, so "spam" is not enough.
  if char_length(btrim(coalesce(p_reason, ''))) < 12 then
    raise exception 'A ladder step needs a reason of at least twelve characters, because the member reads it'
      using errcode = '22023';
  end if;
  -- Nobody steps their own ladder, and nobody steps another moderator's without
  -- the rank that means "trusted with staff actions".
  if v_uid = v_actor then
    raise exception 'You cannot apply a warning to yourself' using errcode = '22023';
  end if;

  select * into v_policy from public.warning_policy where severity = p_severity;
  if not found then
    raise exception 'No warning policy for severity %', p_severity using errcode = 'P0002';
  end if;

  select w.next_rung into v_next from public.warning_ladder(p_severity) w limit 1;

  v_expires := case when v_policy.duration_days is null then null
                    else now() + make_interval(days => v_policy.duration_days) end;

  insert into public.moderation_actions
    (actor_uid, report_id, subject_type, subject_id, action, reason)
  values (
    v_actor,
    null,
    'person',
    v_uid,
    case v_policy.rung
      when 'nudge' then 'warn'
      when 'warning' then 'warn'
      when 'restriction' then 'hide_content'
      else 'suspend_account'
    end,
    btrim(p_reason)
  )
  returning * into v_action;

  -- The standing entry only when the rung carries points. A nudge that writes a
  -- zero-point row would put a line in the ledger that changed nothing, and a
  -- ledger full of no-ops is a ledger nobody reconciles.
  if v_policy.points > 0 then
    insert into public.standing_entries (uid, rule_key, points, reason, expires_at, created_by)
    values (v_uid, v_policy.rule_key, -v_policy.points, btrim(p_reason), v_expires, v_actor);
  end if;

  -- The message names the next rung, in the member's own languages. It is built
  -- from the policy row rather than from a template in the caller, so the console
  -- cannot send a sentence the ladder does not say.
  v_body := case when v_next is null
                   then v_policy.message_en
                   else format('%s The next step would be: %s.', v_policy.message_en, v_next)
                 end;

  -- `bsdc.notify` upserts on (uid, actor, kind, post, comment, conversation) so a
  -- repeated event collapses into one line with a newer timestamp. That is right
  -- for a like or a reply and wrong here: a second ladder step is a second, more
  -- serious decision, and collapsing it would overwrite the first warning's text
  -- and tell the member nothing new happened. Naming the action as the conversation
  -- gives each step its own line.
  insert into public.notifications (uid, actor_uid, kind, body, subject_key)
  values (v_uid, v_actor, 'moderation', left(v_body, 280), 'ladder:' || v_action.id::text)
  -- The same upsert `bsdc.notify` would do, narrowed to this one decision: a re-run
  -- of the same step refreshes its line instead of adding a second, and a second
  -- step gets its own line because its action id is different.
  on conflict (uid, actor_uid, kind,
               coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(conversation_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(subject_key, ''))
  do update set created_at = now(), read_at = null, body = excluded.body;

  perform bsdc.audit('moderation.ladder', 'person', v_uid,
    jsonb_build_object(
      'severity', p_severity,
      'rung', v_policy.rung,
      'points', v_policy.points,
      'next_rung', v_next,
      'case_id', p_case_id
    ));

  -- The case, when the caller has one, gets the event so the case timeline shows
  -- the same step the member was sent.
  if p_case_id is not null then
    insert into public.case_events (case_id, actor_uid, kind, body)
    values (p_case_id, v_actor, 'note',
            format('Ladder step taken: %s (%s), %s points.', v_policy.rung, p_severity, v_policy.points));
  end if;

  return v_action;
end;
$$;

revoke all on function public.apply_warning_ladder(text, text, text, uuid) from public, anon;
grant execute on function public.apply_warning_ladder(text, text, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Appeals
-- ---------------------------------------------------------------------------
-- An appeal is a request that a decision be looked at again by somebody other
-- than the person who made it. The whole feature turns on that clause, so it is a
-- check in the writer and a check in the decider, and a test that fires both.
create table if not exists public.appeals (
  id              uuid primary key default gen_random_uuid(),
  -- Who is appealing. Not nullable: an appeal is always somebody's.
  appellant_uid   text not null references public.profiles (uid) on delete cascade,
  -- What is being appealed. Exactly one of these is set, and the check below is
  -- what makes "exactly" true rather than intended.
  action_id       uuid references public.moderation_actions (id) on delete restrict,
  standing_id     bigint references public.standing_entries (id) on delete restrict,
  case_id         uuid references public.cases (id) on delete restrict,
  -- The decider of the original action, copied at the moment of filing so that a
  -- later change to the action's actor cannot launder the conflict. This is the
  -- column the "nobody judges their own decision" rule reads.
  original_actor  text not null,
  -- What the member says, in their words. A summary is stored separately because
  -- the list view shows it and the detail view shows the whole thing.
  grounds         text not null check (char_length(btrim(grounds)) between 20 and 4000),
  grounds_summary text not null check (char_length(btrim(grounds_summary)) between 10 and 200),
  status          text not null default 'open'
                    check (status in ('open', 'under_review', 'upheld', 'rejected', 'withdrawn')),
  -- Who is looking at it. Set by the first reviewer to take it, and this is the
  -- second place the conflict rule is enforced.
  reviewer_uid    text references public.profiles (uid) on delete set null,
  reviewed_at     timestamptz,
  -- The outcome, which for an upheld appeal must say what was changed. A rejected
  -- appeal must say why, and the member reads it.
  outcome         text check (outcome is null or char_length(btrim(outcome)) between 12 and 1000),
  -- A member gets one appeal per decision. This is the constraint that makes that
  -- true even under a double-submit.
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint appeals_exactly_one_subject
    check ((case when action_id is not null then 1 else 0 end)
         + (case when standing_id is not null then 1 else 0 end)
         + (case when case_id is not null then 1 else 0 end) = 1),
  -- A decided appeal must carry an outcome; an undecided one must not.
  constraint appeals_decided_has_outcome
    check (
      (status in ('upheld', 'rejected') and outcome is not null and reviewed_at is not null)
      or (status in ('open', 'under_review', 'withdrawn'))
    ),
  -- An appeal cannot be withdrawn and decided: withdrawing is what happens
  -- instead of a decision.
  constraint appeals_withdrawn_has_no_reviewer
    check (status <> 'withdrawn' or reviewer_uid is null)
);

comment on table public.appeals is
  'A member asking that a decision be looked at again by somebody who did not make it.';

drop trigger if exists appeals_touch on public.appeals;
create trigger appeals_touch before update on public.appeals
  for each row execute function bsdc.touch_updated_at();

-- One appeal per subject per person, whichever subject it is about. Three partial
-- indexes rather than one composite, because the subject columns are nullable and
-- a composite unique would treat every NULL as distinct.
create unique index if not exists appeals_one_per_action
  on public.appeals (appellant_uid, action_id) where action_id is not null;
create unique index if not exists appeals_one_per_standing
  on public.appeals (appellant_uid, standing_id) where standing_id is not null;
create unique index if not exists appeals_one_per_case
  on public.appeals (appellant_uid, case_id) where case_id is not null;

create index if not exists appeals_queue_idx
  on public.appeals (status, created_at) where status in ('open', 'under_review');

alter table public.appeals enable row level security;

-- A member sees their own appeals. Staff with the review permission see all of
-- them; staff without it see none, which is the right default for a table of
-- complaints about staff decisions.
drop policy if exists appeals_own_read on public.appeals;
create policy appeals_own_read on public.appeals
  for select using (appellant_uid = bsdc.current_uid());

drop policy if exists appeals_staff_read on public.appeals;
create policy appeals_staff_read on public.appeals
  for select using (bsdc.has_permission('moderation.resolve'));

revoke all on public.appeals from anon;
revoke all on public.appeals from authenticated;
grant select on public.appeals to authenticated;

-- Filing. The writer resolves which subject was meant, copies the original
-- decider, and refuses the four things that make an appeal meaningless.
create or replace function public.file_appeal(
  p_action_id  uuid default null,
  p_standing_id bigint default null,
  p_case_id    uuid default null,
  p_grounds    text default '',
  p_summary    text default ''
)
returns public.appeals
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid     text := bsdc.current_uid();
  v_actor   text;
  v_subject text;
  v_row     public.appeals;
  v_count   integer;
  v_age     interval;
begin
  if v_uid is null then
    raise exception 'Sign in to appeal a decision' using errcode = '42501';
  end if;

  -- Exactly one subject, checked here as well as by the constraint so the refusal
  -- names the mistake rather than quoting a constraint.
  v_count := (case when p_action_id is not null then 1 else 0 end)
           + (case when p_standing_id is not null then 1 else 0 end)
           + (case when p_case_id is not null then 1 else 0 end);
  if v_count <> 1 then
    raise exception 'An appeal is about exactly one decision: an action, a standing entry, or a case'
      using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_grounds, ''))) < 20 then
    raise exception 'Say what you are appealing in at least twenty characters, so a reviewer knows what to look at'
      using errcode = '22023';
  end if;

  if p_action_id is not null then
    select m.actor_uid into v_actor from public.moderation_actions m where m.id = p_action_id;
    if v_actor is null then
      raise exception 'No such moderation action' using errcode = 'P0002';
    end if;
    v_subject := 'action';
    -- Only the person the action was taken against may appeal it.
    if not exists (select 1 from public.moderation_actions m
                    where m.id = p_action_id and m.subject_type = 'person' and m.subject_id = v_uid) then
      raise exception 'That action was not taken against you' using errcode = '42501';
    end if;
  elsif p_standing_id is not null then
    select s.uid into v_actor from public.standing_entries s where s.id = p_standing_id;
    if v_actor is null then
      raise exception 'No such standing entry' using errcode = 'P0002';
    end if;
    if v_actor <> v_uid then
      raise exception 'That standing entry is not yours' using errcode = '42501';
    end if;
    -- A standing entry has no single decider once decay and reconciliation have
    -- touched it, so the original actor is whoever wrote it.
    select s.created_by into v_actor from public.standing_entries s where s.id = p_standing_id;
    v_subject := 'standing';
  else
    select c.subject_uid into v_actor from public.cases c where c.id = p_case_id;
    if v_actor is null then
      raise exception 'No such case' using errcode = 'P0002';
    end if;
    if v_actor <> v_uid then
      raise exception 'That case is not about you' using errcode = '42501';
    end if;
    select c.closed_by into v_actor from public.cases c where c.id = p_case_id;
    v_subject := 'case';
  end if;

  -- The window. Thirty days from the decision, which is long enough to notice and
  -- short enough that the evidence still exists.
  v_age := null;
  if p_action_id is not null then
    select now() - m.created_at into v_age from public.moderation_actions m where m.id = p_action_id;
  elsif p_case_id is not null then
    select now() - coalesce(c.closed_at, c.created_at) into v_age from public.cases c where c.id = p_case_id;
  end if;
  if v_age is not null and v_age > interval '30 days' then
    raise exception 'An appeal must be filed within thirty days of the decision' using errcode = '22023';
  end if;

  insert into public.appeals
    (appellant_uid, action_id, standing_id, case_id, original_actor, grounds, grounds_summary)
  values (
    v_uid, p_action_id, p_standing_id, p_case_id,
    coalesce(v_actor, ''),
    btrim(p_grounds),
    -- The summary default comes from the grounds rather than being required, so a
    -- caller cannot file an appeal whose list line says nothing. A summary shorter
    -- than the column's floor is extended from the grounds instead of being
    -- refused: the column demands ten characters and the caller's mistake is
    -- trivial, so this is where the refusal would be unhelpful.
    left(
      case
        when char_length(btrim(coalesce(p_summary, ''))) >= 10 then btrim(p_summary)
        else btrim(btrim(coalesce(p_summary, '')) || ' ' || left(btrim(p_grounds), 160))
      end, 200)
  )
  returning * into v_row;

  perform bsdc.audit('appeal.file', 'appeal', v_row.id::text,
    jsonb_build_object('subject', v_subject, 'original_actor', v_row.original_actor));

  return v_row;
exception
  -- The unique indexes are the real guard against a double-submit; this turns the
  -- constraint into a sentence a member can act on.
  when unique_violation then
    raise exception 'You have already appealed this decision' using errcode = '22023';
end;
$$;

revoke all on function public.file_appeal(uuid, bigint, uuid, text, text) from public, anon;
grant execute on function public.file_appeal(uuid, bigint, uuid, text, text) to authenticated, service_role;

-- Taking it for review. The conflict rule is enforced here, at the moment a
-- person becomes the reviewer, rather than only at the decision — because a
-- reviewer who cannot decide has taken work they cannot finish.
create or replace function public.claim_appeal(p_appeal_id uuid)
returns public.appeals
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_actor text := bsdc.current_uid();
  v_row   public.appeals;
begin
  perform bsdc.require_permission('moderation.resolve');

  select * into v_row from public.appeals where id = p_appeal_id for update;
  if not found then
    raise exception 'No such appeal' using errcode = 'P0002';
  end if;
  if v_row.status <> 'open' then
    raise exception 'That appeal is %, so it cannot be taken for review', v_row.status
      using errcode = '22023';
  end if;
  if v_row.reviewer_uid is not null and v_row.reviewer_uid <> v_actor then
    raise exception 'Somebody else is already reviewing this appeal' using errcode = '22023';
  end if;
  -- The clause the whole table exists for.
  if v_actor = v_row.original_actor then
    raise exception 'You made the decision being appealed; somebody else has to review it'
      using errcode = '42501';
  end if;
  -- Nor the appellant, which is the same rule from the other side and the one a
  -- careless join would miss.
  if v_actor = v_row.appellant_uid then
    raise exception 'You cannot review your own appeal' using errcode = '42501';
  end if;

  update public.appeals
     set reviewer_uid = v_actor, status = 'under_review'
   where id = p_appeal_id
  returning * into v_row;

  perform bsdc.audit('appeal.claim', 'appeal', v_row.id::text, '{}'::jsonb);
  return v_row;
end;
$$;

revoke all on function public.claim_appeal(uuid) from public, anon;
grant execute on function public.claim_appeal(uuid) to authenticated, service_role;

-- Deciding. Upheld means the decision is undone as far as it can be, and a
-- rejection must carry a reason the member reads. Both notify.
create or replace function public.decide_appeal(
  p_appeal_id uuid,
  p_upheld    boolean,
  p_outcome   text
)
returns public.appeals
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_actor text := bsdc.current_uid();
  v_row   public.appeals;
  v_body  text;
begin
  perform bsdc.require_permission('moderation.resolve');

  if char_length(btrim(coalesce(p_outcome, ''))) < 12 then
    raise exception 'An appeal decision needs an explanation of at least twelve characters, because the member reads it'
      using errcode = '22023';
  end if;

  select * into v_row from public.appeals where id = p_appeal_id for update;
  if not found then
    raise exception 'No such appeal' using errcode = 'P0002';
  end if;
  if v_row.status not in ('open', 'under_review') then
    raise exception 'That appeal has already been %', v_row.status using errcode = '22023';
  end if;
  if v_actor = v_row.original_actor then
    raise exception 'You made the decision being appealed; somebody else has to decide the appeal'
      using errcode = '42501';
  end if;
  if v_actor = v_row.appellant_uid then
    raise exception 'You cannot decide your own appeal' using errcode = '42501';
  end if;

  update public.appeals
     set status = case when p_upheld then 'upheld' else 'rejected' end,
         outcome = btrim(p_outcome),
         reviewer_uid = v_actor,
         reviewed_at = now()
   where id = p_appeal_id
  returning * into v_row;

  -- Undoing the action, as far as it can be undone. A suspension is lifted; a
  -- hidden piece of content is restored by the caller, because restoring the
  -- wrong thing is worse than leaving it hidden until somebody looks.
  if p_upheld and v_row.action_id is not null then
    insert into public.moderation_actions
      (actor_uid, subject_type, subject_id, action, reason)
    select v_actor, m.subject_type, m.subject_id,
           case m.action
             when 'suspend_account' then 'restore_account'
             when 'ban_account' then 'restore_account'
             when 'hide_content' then 'restore_content'
             else 'dismiss'
           end,
           format('Appeal upheld: %s', left(btrim(p_outcome), 400))
      from public.moderation_actions m
     where m.id = v_row.action_id;
  end if;

  v_body := case when p_upheld
    then format('Your appeal was upheld. %s', btrim(p_outcome))
    else format('Your appeal was not upheld. %s', btrim(p_outcome))
  end;

  -- Same reasoning as the ladder: an upheld appeal and a rejected one are two
  -- different messages, and an appeal decision is never a repeat of an earlier one.
  insert into public.notifications (uid, actor_uid, kind, body, subject_key)
  values (v_row.appellant_uid, v_actor, 'moderation', left(v_body, 280), 'appeal:' || v_row.id::text)
  on conflict (uid, actor_uid, kind,
               coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(conversation_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(subject_key, ''))
  do update set created_at = now(), read_at = null, body = excluded.body;

  perform bsdc.audit('appeal.decide', 'appeal', v_row.id::text,
    jsonb_build_object('upheld', p_upheld, 'original_actor', v_row.original_actor));

  return v_row;
end;
$$;

revoke all on function public.decide_appeal(uuid, boolean, text) from public, anon;
grant execute on function public.decide_appeal(uuid, boolean, text) to authenticated, service_role;

-- Withdrawing, which is the member's alternative to waiting.
create or replace function public.withdraw_appeal(p_appeal_id uuid, p_reason text default '')
returns public.appeals
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_row public.appeals;
begin
  select * into v_row from public.appeals where id = p_appeal_id for update;
  if not found then
    raise exception 'No such appeal' using errcode = 'P0002';
  end if;
  if v_row.appellant_uid <> v_uid then
    raise exception 'That appeal is not yours' using errcode = '42501';
  end if;
  if v_row.status not in ('open', 'under_review') then
    raise exception 'That appeal has already been %', v_row.status using errcode = '22023';
  end if;

  update public.appeals
     set status = 'withdrawn',
         outcome = null,
         reviewer_uid = null
   where id = p_appeal_id
  returning * into v_row;

  perform bsdc.audit('appeal.withdraw', 'appeal', v_row.id::text,
    jsonb_build_object('reason', left(btrim(coalesce(p_reason, '')), 400)));
  return v_row;
end;
$$;

revoke all on function public.withdraw_appeal(uuid, text) from public, anon;
grant execute on function public.withdraw_appeal(uuid, text) to authenticated, service_role;

-- The review queue, with the clock 0144 already provides. `appeals` is one of the
-- four queues the SLA table was seeded for, so the target is data.
create or replace function public.appeals_queue(p_limit integer default 100)
returns table (
  id            uuid,
  appellant_uid text,
  appellant     text,
  summary       text,
  subject       text,
  status        text,
  severity      text,
  age_minutes   integer,
  respond_within integer,
  respond_state text,
  original_actor text,
  reviewer_uid  text,
  created_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
#variable_conflict use_column
begin
  perform bsdc.require_permission('moderation.resolve');
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'A page holds between 1 and 500 appeals' using errcode = '22023';
  end if;

  return query
  select a.id, a.appellant_uid,
         coalesce(p.display_name, a.appellant_uid),
         a.grounds_summary,
         case when a.action_id is not null then 'action'
              when a.standing_id is not null then 'standing'
              else 'case' end,
         a.status,
         sla.severity,
         sla.age_minutes,
         sla.respond_within,
         sla.respond_state,
         a.original_actor,
         a.reviewer_uid,
         a.created_at
    from public.appeals a
    left join public.profiles p on p.uid = a.appellant_uid
    cross join lateral (
      select * from public.sla_status('appeals',
        case when a.status = 'under_review' then 'high' else 'normal' end,
        a.created_at)
    ) sla
   where a.status in ('open', 'under_review')
   order by
     -- Breached first, then by age. The same order the approvals queue uses, so a
     -- moderator moving between the two screens reads them the same way.
     case sla.respond_state when 'breached' then 0 when 'watching' then 1 else 2 end,
     a.created_at
   limit p_limit;
end;
$$;

revoke all on function public.appeals_queue(integer) from public, anon;
grant execute on function public.appeals_queue(integer) to authenticated, service_role;

-- The member's own view of their appeals, which is a different question from the
-- queue and therefore a different function: a member must not need the reviewer's
-- permission to see what they filed.
create or replace function public.my_appeals(p_limit integer default 50)
returns table (
  id          uuid,
  subject     text,
  status      text,
  summary     text,
  outcome     text,
  created_at  timestamptz,
  reviewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
begin
  if v_uid is null then
    raise exception 'Sign in to see your appeals' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'A page holds between 1 and 200 appeals' using errcode = '22023';
  end if;

  return query
  select a.id,
         case when a.action_id is not null then 'action'
              when a.standing_id is not null then 'standing'
              else 'case' end,
         a.status, a.grounds_summary, a.outcome, a.created_at, a.reviewed_at
    from public.appeals a
   where a.appellant_uid = v_uid
   order by a.created_at desc
   limit p_limit;
end;
$$;

revoke all on function public.my_appeals(integer) from public, anon;
grant execute on function public.my_appeals(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Repeat offenders, by signal and never by name
-- ---------------------------------------------------------------------------
-- Two accounts are the same operator when they share something only an operator
-- has: a device hash from a console session, or a payment instrument. They are not
-- the same person because they chose a similar display name, and the plan is
-- explicit about this because a name-based suggestion is how an innocent member
-- with a common name gets suspended.
--
-- The signal set is deliberately short. Every signal added here is a claim that
-- two accounts sharing it are one operator, and a weak signal turns this from a
-- lead into an accusation.
create or replace function public.person_signals(p_uid text)
returns table (
  signal     text,
  value_hash text,
  shared_with integer,
  first_seen timestamptz,
  last_seen  timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := btrim(coalesce(p_uid, ''));
begin
  perform bsdc.require_permission('people.read');
  if not exists (select 1 from public.profiles p where p.uid = v_uid) then
    raise exception 'No person with uid %', v_uid using errcode = 'P0002';
  end if;

  return query
  -- Device hashes this person's staff sessions used, and how many other accounts
  -- used the same one. A shared console in an office legitimately produces this,
  -- which is why the caller is told the count and the window rather than an
  -- accusation.
  select 'device'::text, s.device_hash,
         (select count(distinct o.uid)::integer from public.staff_sessions o
           where o.device_hash = s.device_hash and o.uid <> v_uid),
         min(s.started_at), max(s.last_seen_at)
    from public.staff_sessions s
   where s.uid = v_uid
   group by s.device_hash

  union all

  -- Payment instruments. When the marketplace grows one, it will be added here and
  -- nowhere else; until then this branch contributes no rows and costs nothing.
  select 'instrument'::text, null::text, 0, null::timestamptz, null::timestamptz
   where false;
end;
$$;

revoke all on function public.person_signals(text) from public, anon;
grant execute on function public.person_signals(text) to authenticated, service_role;

-- Reporter reliability: how often a reporter's reports were upheld. Derived on
-- read and never stored, because a stored score is a score somebody will argue
-- with in a support ticket and nobody will be able to explain.
create or replace function public.reporter_reliability(p_uid text)
returns table (
  filed     integer,
  upheld    integer,
  dismissed integer,
  open      integer,
  upheld_rate numeric
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid text := btrim(coalesce(p_uid, ''));
begin
  perform bsdc.require_permission('moderation.read');
  if not exists (select 1 from public.profiles p where p.uid = v_uid) then
    raise exception 'No person with uid %', v_uid using errcode = 'P0002';
  end if;

  return query
  select count(*)::integer,
         count(*) filter (where r.status = 'actioned')::integer,
         count(*) filter (where r.status = 'dismissed')::integer,
         count(*) filter (where r.status in ('open', 'reviewing'))::integer,
         -- Null rather than zero when nothing has been decided, because a rate
         -- over no decisions is not 0% and a screen that shows it as 0% libels
         -- every new reporter.
         case when count(*) filter (where r.status in ('actioned', 'dismissed')) = 0 then null
              else round(
                (count(*) filter (where r.status = 'actioned'))::numeric
                / (count(*) filter (where r.status in ('actioned', 'dismissed')))::numeric, 3)
         end
    from public.reports r
   where r.reporter_uid = v_uid;
end;
$$;

revoke all on function public.reporter_reliability(text) from public, anon;
grant execute on function public.reporter_reliability(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The shift console
-- ---------------------------------------------------------------------------
-- The roster stops being a projection of `staff_records.shift` and becomes shifts
-- with a start, an end and a handover note. §10.3 calls context lost at the
-- changeover the single most expensive failure in a 24-hour operation, and the
-- handover note is the answer to it.
create table if not exists public.shifts (
  id            uuid primary key default gen_random_uuid(),
  shift_name    text not null check (shift_name in ('general', 'morning', 'evening', 'night')),
  -- A local calendar day plus the shift name identifies one shift. Date rather
  -- than timestamptz because the roster is read by people in Dhaka and the shift
  -- does not move because a server is in UTC.
  on_date       date not null,
  lead_uid      text references public.profiles (uid) on delete set null,
  -- The handover note: what is open, what the next shift needs to know. Written at
  -- the end of the shift, carried to the next one.
  handover      text not null default '' check (char_length(handover) <= 2000),
  handover_at   timestamptz,
  handover_by   text references public.profiles (uid) on delete set null,
  -- Coverage is recorded rather than computed from assignments, because a shift
  -- can be covered by somebody who was not rostered on it.
  opened_at     timestamptz,
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  unique (on_date, shift_name)
);

create index if not exists shifts_open_idx on public.shifts (on_date, shift_name)
  where closed_at is null;

alter table public.shifts enable row level security;

drop policy if exists shifts_staff_read on public.shifts;
create policy shifts_staff_read on public.shifts
  for select using (bsdc.is_staff());

revoke all on public.shifts from anon;
revoke all on public.shifts from authenticated;
grant select on public.shifts to authenticated;

-- Assigning somebody to a shift. Two people per shift is the minimum that makes a
-- 24-hour operation survivable, so the writer warns rather than refuses: a shift
-- with one person is a real situation at 04:00 and must remain expressible.
create or replace function public.assign_shift(
  p_shift_name text,
  p_on_date    date,
  p_uid        text,
  p_role       text default 'cover'
)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_shift uuid;
begin
  perform bsdc.require_permission('people.read');
  if p_shift_name not in ('general', 'morning', 'evening', 'night') then
    raise exception 'A shift is general, morning, evening or night, not %', p_shift_name
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.uid = p_uid) then
    raise exception 'No person with uid %', p_uid using errcode = 'P0002';
  end if;

  insert into public.shifts (shift_name, on_date)
  values (p_shift_name, p_on_date)
  on conflict (on_date, shift_name) do nothing;

  select id into v_shift from public.shifts where on_date = p_on_date and shift_name = p_shift_name;

  insert into public.shift_assignments (shift_id, uid, role)
  values (v_shift, p_uid, p_role)
  on conflict (shift_id, uid) do update set role = excluded.role;

  perform bsdc.audit('shift.assign', 'shift', v_shift::text,
    jsonb_build_object('uid', p_uid, 'date', p_on_date, 'shift', p_shift_name, 'role', p_role));
  return v_shift;
end;
$$;

create table if not exists public.shift_assignments (
  shift_id  uuid not null references public.shifts (id) on delete cascade,
  uid       text not null references public.profiles (uid) on delete cascade,
  role      text not null default 'cover' check (role in ('lead', 'cover', 'on_call')),
  created_at timestamptz not null default now(),
  primary key (shift_id, uid)
);

alter table public.shift_assignments enable row level security;

drop policy if exists shift_assignments_staff_read on public.shift_assignments;
create policy shift_assignments_staff_read on public.shift_assignments
  for select using (bsdc.is_staff());

revoke all on public.shift_assignments from anon;
revoke all on public.shift_assignments from authenticated;
grant select on public.shift_assignments to authenticated;

revoke all on function public.assign_shift(text, date, text, text) from public, anon;
grant execute on function public.assign_shift(text, date, text, text) to authenticated, service_role;

-- Writing the handover, which is the thing the next shift reads first.
create or replace function public.write_handover(p_shift_id uuid, p_note text)
returns public.shifts
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_actor text := bsdc.current_uid();
  v_row   public.shifts;
begin
  perform bsdc.require_permission('moderation.read');

  if char_length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'A handover note needs at least ten characters; the next shift reads it first'
      using errcode = '22023';
  end if;

  select * into v_row from public.shifts where id = p_shift_id for update;
  if not found then
    raise exception 'No such shift' using errcode = 'P0002';
  end if;

  update public.shifts
     set handover = btrim(p_note), handover_at = now(), handover_by = v_actor
   where id = p_shift_id
  returning * into v_row;

  perform bsdc.audit('shift.handover', 'shift', v_row.id::text, '{}'::jsonb);
  return v_row;
end;
$$;

revoke all on function public.write_handover(uuid, text) from public, anon;
grant execute on function public.write_handover(uuid, text) to authenticated, service_role;

-- The shift board: today's shifts, who is on them, how much is open, and the
-- handover from the shift that just ended. One read, because a shift console that
-- needs four is a shift console nobody opens.
create or replace function public.shift_board(p_date date default null)
returns table (
  shift_id      uuid,
  shift_name    text,
  on_date       date,
  headcount     integer,
  open_reports  integer,
  breached      integer,
  handover      text,
  handover_at   timestamptz,
  previous_handover text
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  v_date date := coalesce(p_date, current_date);
begin
  perform bsdc.require_permission('moderation.read');

  return query
  select s.id, s.shift_name, s.on_date,
         (select count(*)::integer from public.shift_assignments a where a.shift_id = s.id),
         (select count(*)::integer from public.reports r where r.status in ('open', 'reviewing')),
         (select count(*)::integer from public.reports r
           where r.status in ('open', 'reviewing')
             and now() - r.created_at > interval '24 hours'),
         s.handover, s.handover_at,
         -- The most recent handover from an earlier shift, which is the note the
         -- person opening this one needs.
         (select p.handover
            from public.shifts p
           where (p.on_date, case p.shift_name
                               when 'general' then 1 when 'morning' then 2
                               when 'evening' then 3 else 4 end)
               < (s.on_date, case s.shift_name
                               when 'general' then 1 when 'morning' then 2
                               when 'evening' then 3 else 4 end)
             and p.handover <> ''
           order by p.on_date desc,
                    case p.shift_name when 'general' then 1 when 'morning' then 2
                                      when 'evening' then 3 else 4 end desc
           limit 1)
    from public.shifts s
   where s.on_date = v_date
   order by case s.shift_name when 'general' then 1 when 'morning' then 2
                              when 'evening' then 3 else 4 end;
end;
$$;

revoke all on function public.shift_board(date) from public, anon;
grant execute on function public.shift_board(date) to authenticated, service_role;
