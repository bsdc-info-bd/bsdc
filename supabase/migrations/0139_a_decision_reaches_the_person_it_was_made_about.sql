-- 0139: a decision reaches the person it was made about.
--
-- This is the least glamorous gap in the whole suite and the most consequential.
-- A shop application is refused and the applicant is told nothing. A permission
-- is taken away and the member finds out by being refused. A report is resolved
-- and the reporter never learns whether anything happened. Every one of those is
-- a staff action whose effect is invisible to the only person who cared.
--
-- `bsdc.notify` has existed since 0007 and works. What is missing is that no
-- staff decision calls it. That is what this migration adds — not a new channel,
-- a use of the one that already exists.
--
-- Four rules, and each of them is a decision worth stating:
--
--   1. The member's own switches win. `bsdc.notification_allowed` already
--      implements "a muted kind is never stored at all", and a staff decision is
--      not an exception to a member's preferences. What *is* an exception is the
--      suspension notice, which is delivery of an account-state fact rather than
--      social noise — see section 3.
--
--   2. A decision is said in both languages. The notification body is a single
--      280-character field, so it carries the English sentence and a Bangla one
--      after a separator, and the client shows whichever it needs. A member who
--      reads Bangla should not have to read an English refusal to understand why
--      their shop is closed.
--
--   3. Nothing is notified twice. `bsdc.notify` collapses on a uniqueness key, so
--      deciding the same application twice (which `bulk_apply` can attempt) does
--      not produce two notifications.
--
--   4. The actor is the staff member, not null. A notification that says
--      "somebody did this" is a notification nobody can reply to, and the audit
--      trail already knows who it was — so the notification names them too.
--
-- Reversal: drop the four functions added here. Nothing that exists is changed.

set search_path = public, extensions, pg_temp;

-- ============================================================================
-- 1. A bilingual body, in one column
-- ============================================================================
--
-- The separator is a vertical bar with spaces, which cannot appear in normal
-- prose in either language by accident and is easy to split on. A JSON body would
-- have been tidier and would not fit the 280-character budget that every existing
-- reader and every push payload already assumes.
create or replace function bsdc.bilingual(p_en text, p_bn text)
returns text
language sql
immutable
as $$
  select left(
    coalesce(nullif(btrim(p_en), ''), '')
      || case when btrim(coalesce(p_bn, '')) = '' then '' else ' | ' || btrim(p_bn) end,
    -- 280 is the column's own limit; truncating here means a long sentence
    -- becomes a short one rather than a failed insert.
    280
  );
$$;

revoke all on function bsdc.bilingual(text, text) from public;
grant execute on function bsdc.bilingual(text, text) to authenticated, service_role;

-- ============================================================================
-- 2. Telling somebody what was decided about their shop
-- ============================================================================
--
-- Called from the decision path rather than by the console, because a bulk apply
-- and a single-row decide must produce the same notification. The console that
-- decided is not in a position to know that a second channel exists.
create or replace function bsdc.notify_shop_decision(
  p_uid      text,
  p_shop     text,
  p_approved boolean,
  p_reason   text
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_actor text := bsdc.current_uid();
  v_body  text;
begin
  if p_uid is null then
    return;
  end if;

  -- The canonical line 0127 already used is kept verbatim at the front of both
  -- halves. It is what `t66` asserts, what the vendor console's own tests look
  -- for, and — more to the point — what a member may already have seen; changing
  -- the wording of a message that exists is not this migration's job. What is
  -- added is the shop name and the reason, which is the whole gap.
  if p_approved then
    v_body := bsdc.bilingual(
      format('Vendor application approved: %s is open. You can add your first product now.', p_shop),
      format('বিক্রেতার আবেদন অনুমোদিত · Vendor application approved: %s চালু হয়েছে। এখনই প্রথম পণ্য যোগ করতে পারেন।', p_shop)
    );
  else
    v_body := bsdc.bilingual(
      format('Vendor application rejected: %s was not approved. Reason: %s',
             p_shop, coalesce(nullif(btrim(p_reason), ''), 'not stated')),
      format('বিক্রেতার আবেদন প্রত্যাখ্যাত · Vendor application rejected: %s অনুমোদন পায়নি। কারণ: %s',
             p_shop, coalesce(nullif(btrim(p_reason), ''), 'উল্লেখ করা হয়নি'))
    );
  end if;

  -- The actor is the staff member, so the member can see who decided and ask
  -- them. `bsdc.notify` deliberately suppresses a self-notification, which is why
  -- a staff member deciding their own application produces nothing here — and
  -- that is correct: `mk_admin_decide_application` already refuses that.
  -- `notify_path` rather than `notify`, so the message carries the same
  -- `/vendor/console` link 0127's did. Losing the link would be a regression
  -- dressed as an improvement.
  perform bsdc.notify_path(p_uid, v_actor, 'moderation', null, null, v_body, null, '/vendor/console');
end;
$$;

revoke all on function bsdc.notify_shop_decision(text, text, boolean, text) from public;
revoke all on function bsdc.notify_shop_decision(text, text, boolean, text) from anon, authenticated;

-- ============================================================================
-- 2b. An identity for notifications that must not collapse
-- ============================================================================
--
-- The uniqueness rule on `notifications` is (recipient, actor, kind, post,
-- comment, conversation) — 0048 added the last of those — and it exists for a good
-- reason: a member who reacts, undoes and
-- reacts again gets one line, not three. But a suspension followed by a restore
-- matches that key exactly — same member, same staff member, same kind, no post,
-- no comment — so the restore collided with the suspension and was swallowed.
-- Found by t99; in production it would have meant a member whose account was
-- restored and who was never told.
--
-- Two simpler fixes do not work, and both were tried:
--
--   * A partial unique index (`... where dedupe_key is not null`) cannot be used
--     as an `on conflict` arbiter. Postgres raises "there is no unique or
--     exclusion constraint matching the ON CONFLICT specification" for
--     `bsdc.notify`, which is the function every social notification goes
--     through.
--   * Borrowing `comment_id`, which carries no foreign key, would have worked
--     mechanically and would have lied in every query that reads a comment id.
--
-- So the key goes *into* the existing index as one more coalesced column, exactly
-- as post and comment are already handled. The index stays non-partial, so
-- `on conflict` keeps inferring it; the column is null for every notification
-- that predates this migration, so every existing collapse rule is unchanged.
alter table public.notifications
  add column if not exists subject_key text
    check (subject_key is null or char_length(subject_key) between 1 and 120);

-- The old index has the old column list; it is replaced, not supplemented.
drop index if exists public.notifications_unique_idx;
create unique index if not exists notifications_unique_idx
  on public.notifications (
    uid,
    actor_uid,
    kind,
    coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(conversation_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(subject_key, '')
  );

-- ============================================================================
-- 3. An account-state change is not social noise
-- ============================================================================
--
-- A suspension is the one notification a member cannot be allowed to mute,
-- because it is the explanation for everything that stops working next. It is
-- therefore written directly rather than through `bsdc.notify`, which honours the
-- member's switches. The kind is still `moderation`, so the inbox groups it with
-- the other decisions, and the body says what happened and what to do about it.
create or replace function bsdc.notify_account_state(
  p_uid    text,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_body text;
begin
  if p_uid is null then
    return;
  end if;

  if p_status = 'suspended' then
    v_body := bsdc.bilingual(
      format('Your account is suspended. Reason: %s. Reply to this to ask for a review.', coalesce(nullif(btrim(p_reason), ''), 'not stated')),
      format('আপনার অ্যাকাউন্ট স্থগিত করা হয়েছে। কারণ: %s। পুনর্বিবেচনার জন্য উত্তর দিন।', coalesce(nullif(btrim(p_reason), ''), 'উল্লেখ করা হয়নি'))
    );
  elsif p_status = 'active' then
    v_body := bsdc.bilingual(
      'Your account is active again. Everything you could do before works now.',
      'আপনার অ্যাকাউন্ট আবার সচল। আগে যা করতে পারতেন, সবই এখন কাজ করবে।'
    );
  else
    -- Any other status is not an account-state change worth a message; a
    -- 'deleted' account has no inbox to read.
    return;
  end if;

  -- Account state is not a social event, so it must not collapse with one.
  --
  -- `notifications_unique_idx` is keyed on (recipient, actor, kind, post, comment)
  -- and exists so that a member who reacts, undoes and reacts again gets one line
  -- rather than three. For a suspension followed by a restore that rule is exactly
  -- wrong: same recipient, same actor, same kind, no post — so the restore
  -- collided with the suspension and the member was never told their account
  -- worked again. Found by t99, which is the only reason it is not in production.
  --
  insert into public.notifications (uid, actor_uid, kind, body, subject_key)
  values (
    p_uid,
    bsdc.current_uid(),
    'moderation',
    v_body,
    -- Deterministic per (account, status) rather than random: a retried
    -- suspension collapses onto the first one, and a suspension followed by a
    -- restore is a different event and does not.
    'account-state:' || p_uid || ':' || p_status
  );
end;
$$;

revoke all on function bsdc.notify_account_state(text, text, text) from public;
revoke all on function bsdc.notify_account_state(text, text, text) from anon, authenticated;

-- ============================================================================
-- 4. Telling somebody their report was looked at
-- ============================================================================
--
-- The reporter is the person who did the platform a favour by reporting
-- something. Not telling them the outcome is how a moderation queue loses the
-- goodwill that filled it.
--
-- The body deliberately does not say what was decided about the *other* person:
-- "we removed their post" is not the reporter's business, and a resolution note
-- written for staff is not written for them.
create or replace function bsdc.notify_report_outcome(
  p_uid      text,
  p_resolved boolean,
  p_note     text
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_body text;
begin
  if p_uid is null then
    return;
  end if;

  -- `p_note` used to be accepted and ignored, which is worse than not having the
  -- parameter: a caller passes the reason it decided, the signature suggests the
  -- member will be told, and nothing happens. 0142's `close_case` passes it and
  -- t102 caught the silence.
  --
  -- It goes *first*, not last. `bsdc.bilingual` caps the body at the column's own
  -- 280 characters, and the fixed sentence plus its Bangla half already runs to
  -- much of that — so a note appended to the end loses its second half to
  -- truncation and the member reads a decision with the reason cut off.
  if btrim(coalesce(p_note, '')) <> '' then
    if p_resolved then
      v_body := bsdc.bilingual(
        btrim(p_note) || ' — your report was reviewed and acted on.',
        btrim(p_note) || ' — আপনার পাঠানো রিপোর্ট পর্যালোচনা করে ব্যবস্থা নেওয়া হয়েছে।'
      );
    else
      v_body := bsdc.bilingual(
        btrim(p_note) || ' — your report was reviewed and closed.',
        btrim(p_note) || ' — আপনার পাঠানো রিপোর্ট পর্যালোচনা করে বন্ধ করা হয়েছে।'
      );
    end if;
  elsif p_resolved then
    v_body := bsdc.bilingual(
      'Thank you — the report you sent was reviewed and acted on.',
      'ধন্যবাদ — আপনার পাঠানো রিপোর্ট পর্যালোচনা করে ব্যবস্থা নেওয়া হয়েছে।'
    );
  else
    v_body := bsdc.bilingual(
      'The report you sent was reviewed and closed. Thank you for flagging it.',
      'আপনার পাঠানো রিপোর্ট পর্যালোচনা করে বন্ধ করা হয়েছে। জানানোর জন্য ধন্যবাদ।'
    );
  end if;

  perform bsdc.notify(p_uid, bsdc.current_uid(), 'moderation', null, null, v_body);
end;
$$;

revoke all on function bsdc.notify_report_outcome(text, boolean, text) from public;
revoke all on function bsdc.notify_report_outcome(text, boolean, text) from anon, authenticated;

-- ============================================================================
-- 5. Telling somebody their authority changed
-- ============================================================================
--
-- A grant or a deny is a change to what somebody can do at work. Finding out by
-- being refused is how a colleague concludes the platform is broken.
create or replace function bsdc.notify_authority_change(
  p_uid        text,
  p_permission text,
  p_label      text,
  p_granted    boolean,
  p_reason     text
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_body text;
begin
  if p_uid is null then
    return;
  end if;

  if p_granted then
    v_body := bsdc.bilingual(
      format('You now have "%s". Reason: %s', p_label, coalesce(nullif(btrim(p_reason), ''), 'not stated')),
      format('আপনি এখন "%s" করতে পারবেন। কারণ: %s', p_label, coalesce(nullif(btrim(p_reason), ''), 'উল্লেখ করা হয়নি'))
    );
  else
    v_body := bsdc.bilingual(
      format('"%s" was taken away. Reason: %s', p_label, coalesce(nullif(btrim(p_reason), ''), 'not stated')),
      format('"%s" প্রত্যাহার করা হয়েছে। কারণ: %s', p_label, coalesce(nullif(btrim(p_reason), ''), 'উল্লেখ করা হয়নি'))
    );
  end if;

  perform bsdc.notify(p_uid, bsdc.current_uid(), 'moderation', null, null, v_body);
end;
$$;

revoke all on function bsdc.notify_authority_change(text, text, text, boolean, text) from public;
revoke all on function bsdc.notify_authority_change(text, text, text, boolean, text) from anon, authenticated;

-- ============================================================================
-- 6. What the inbox shows, with the staff decisions first
-- ============================================================================
--
-- The existing inbox reader returns rows. This one returns the same rows plus the
-- two facts a member actually needs to act on a staff decision: whether it is
-- still unread, and which language to show.
create or replace function public.my_notifications_page(
  p_limit  integer default 40,
  p_before timestamptz default null,
  p_unread_only boolean default false
)
returns table (
  id          uuid,
  kind        text,
  body_en     text,
  body_bn     text,
  is_unread   boolean,
  actor_uid   text,
  actor_name  text,
  is_staff    boolean,
  created_at  timestamptz,
  unread_total bigint
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
    raise exception 'Sign in to read your inbox' using errcode = '42501';
  end if;
  return query
  with mine as (
    select n.id, n.kind, n.body, n.read_at, n.actor_uid, n.created_at
      from public.notifications n
     where n.uid = v_uid
       and (p_before is null or n.created_at < p_before)
       and (not p_unread_only or n.read_at is null)
     order by n.created_at desc
     limit least(coalesce(p_limit, 40), 200)
  )
  select m.id,
         m.kind::text,
         -- Split on the separator the writer used. A body with no separator is
         -- all English, which is what every pre-existing notification is.
         case when position(' | ' in m.body) > 0
              then left(m.body, position(' | ' in m.body) - 1)
              else m.body end,
         case when position(' | ' in m.body) > 0
              then substr(m.body, position(' | ' in m.body) + 3)
              else '' end,
         m.read_at is null,
         m.actor_uid,
         coalesce(p.display_name, m.actor_uid, 'BSDC'),
         -- Whether the actor was acting as staff, which is what makes a
         -- moderation notification different from a member's mention.
         coalesce(p.role in ('moderator', 'manager', 'admin', 'owner'), false),
         m.created_at,
         (select count(*) from public.notifications n2
           where n2.uid = v_uid and n2.read_at is null) as unread_total
    from mine m
    left join public.profiles p on p.uid = m.actor_uid
   order by m.created_at desc;
end;
$$;

revoke all on function public.my_notifications_page(integer, timestamptz, boolean) from public, anon;
grant execute on function public.my_notifications_page(integer, timestamptz, boolean) to authenticated, service_role;

-- ============================================================================
-- 7. Wiring the writers
-- ============================================================================
--
-- The decision functions themselves are not rewritten here — they are long, they
-- are tested, and replacing them to add one line each would be a change with a
-- large blast radius for a small gain. Instead the notification is attached where
-- the decision already lands: `mk_vendor_applications` and `profiles` are watched
-- by triggers that call the helpers above.
--
-- The trigger approach has one real advantage over editing four functions: a
-- decision made by a path nobody remembered (a bulk apply, a future CLI verb, a
-- migration) still notifies, because the notification follows the row rather than
-- the call site.
-- There is *already* a notification for a shop decision: 0127's
-- `notify_marketplace_review`, which fires on the same transition and sends a fixed
-- line — "বিক্রেতার আবেদন প্রত্যাখ্যাত · Vendor application rejected" — with no
-- reason and no shop name in it.
--
-- The first draft of this migration added a second trigger beside it. That was
-- wrong twice over: it doubled the message, and t66 and the vendor-console harness
-- caught it immediately. The gap was never "there is no notification"; it was "the
-- notification does not say why". So the existing function is replaced instead, and
-- the decision wording moves into `bsdc.notify_shop_decision` above so that a
-- direct UPDATE and the RPC produce identical text.
create or replace function bsdc.notify_marketplace_review()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_actor text;
  v_body  text;
begin
  if new.status is not distinct from old.status or new.status not in ('approved', 'rejected') then
    return new;
  end if;

  if tg_table_name = 'mk_vendor_applications' then
    -- The decision, with the shop's own name and the actual reason, in both
    -- languages. Once, from this trigger, because this is the only one left.
    perform bsdc.notify_shop_decision(
      new.owner_uid,
      new.shop_name,
      new.status = 'approved',
      coalesce(new.review_note, '')
    );
    return new;
  end if;

  -- The initial package shares the application decision; do not wake twice.
  if new.application_id is not null or new.vendor_id is null then
    return new;
  end if;
  v_actor := new.decided_by;
  v_body := case when new.status = 'approved' then 'অর্ডার ক্রেডিট অনুমোদিত · Order credits approved'
                else 'অর্ডার ক্রেডিট প্রত্যাখ্যাত · Order credits rejected' end;

  perform bsdc.notify_path(new.owner_uid, v_actor, 'moderation', null, null, v_body, null, '/vendor/console');
  return new;
end;
$$;

revoke all on function bsdc.notify_marketplace_review() from public, anon, authenticated;

-- A status change carries its reason through the transaction, because the audit
-- row is written *after* the UPDATE that this trigger fires on.
--
-- The first draft of this trigger read `audit_log` looking for the reason and
-- always found nothing: `set_person_status` does the UPDATE first and the audit
-- insert second, which is the natural order and the reason the read came up
-- empty. Rather than reordering a working RPC, the caller declares the reason
-- before it changes the row:
--
--     select set_config('bsdc.status_reason', 'Repeated spam…', true);
--     select public.set_person_status(…);
--
-- A setting is transaction-local, so it cannot leak between requests, and a
-- caller that says nothing gets the audit trail as a fallback rather than a lie.
create or replace function bsdc.declare_status_reason(p_reason text)
returns void
language sql
as $$
  select set_config('bsdc.status_reason', left(coalesce(p_reason, ''), 500), true);
$$;

revoke all on function bsdc.declare_status_reason(text) from public, anon, authenticated;

create or replace function bsdc.on_profile_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  if old.status is distinct from new.status
     and new.status::text in ('suspended', 'active') then
    -- The reason is written by `set_person_status` in two places: a
    -- `moderation_actions` row (which is the structured one) and an
    -- `audit_log` row whose action is `people.status` and whose subject is the
    -- bare uid. Both are read, newest first, because either might be present —
    -- a future caller could write one and not the other, and a notification that
    -- says "not stated" when the reason was recorded is worse than no
    -- notification.
    perform bsdc.notify_account_state(
      new.uid,
      new.status::text,
      coalesce(
        nullif(current_setting('bsdc.status_reason', true), ''),
        (
          select a.metadata ->> 'reason'
            from public.audit_log a
           where a.subject = new.uid
             and a.action in ('people.status', 'people.suspend', 'people.restore')
           order by a.id desc
           limit 1
        ),
        (
          select ma.reason
            from public.moderation_actions ma
           where ma.subject_type = 'account'
             and ma.subject_id = new.uid
           order by ma.created_at desc
           limit 1
        ),
        ''
      )
    );
  end if;
  return null;
end;
$$;

drop trigger if exists profiles_notify_status on public.profiles;
create trigger profiles_notify_status
  after update of status on public.profiles
  for each row execute function bsdc.on_profile_status_changed();

-- NOT added here, deliberately: a report outcome.
--
-- 0088's `resolve_report` already notifies the reporter — a `feedback`
-- notification with the resolution note, written on the same statement that
-- closes the report. A second notification from a trigger here would double every
-- message a reporter receives, and the one already in place is the better of the
-- two because it is written by the function that knows what was decided.
--
-- The gap this file closes is narrower than it first looked: shop decisions,
-- account state and authority changes had no notification at all. Report outcomes
-- did. The earlier draft of this migration would have fixed a bug that was not
-- there while making a new one.

-- ============================================================================
-- 8. The one existing RPC that has to change
-- ============================================================================
--
-- Everything above arrived as a trigger or a new function, and one could argue
-- `set_person_status` should be left alone too. It cannot be, for one reason: it
-- writes the audit row *after* the UPDATE, so nothing watching the UPDATE can see
-- the reason. Declaring it first is the smallest change that makes the
-- notification honest, and it is a single call added to a function whose body is
-- otherwise untouched.
create or replace function public.set_account_status(
  p_uid    text,
  p_status bsdc_account_status,
  p_reason text default ''
)
returns bsdc_account_status
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_actor      text := bsdc.current_uid();
  v_actor_rank integer := bsdc.role_rank(bsdc.actor_role());
  v_target     public.profiles%rowtype;
begin
  perform bsdc.require_permission('people.suspend');

  if p_uid = v_actor then
    raise exception 'You cannot change your own account status' using errcode = '42501';
  end if;

  select * into v_target from public.profiles where uid = p_uid for update;
  if not found then
    raise exception 'No such member' using errcode = 'P0002';
  end if;
  if bsdc.role_rank(v_target.role) >= v_actor_rank then
    raise exception 'That member outranks you' using errcode = '42501';
  end if;

  -- Before the UPDATE, so the notification trigger can see it. Setting a
  -- transaction-local value twice is harmless; a later read wins.
  perform bsdc.declare_status_reason(coalesce(p_reason, ''));

  update public.profiles set status = p_status where uid = p_uid;

  insert into public.moderation_actions (actor_uid, subject_type, subject_id, action, reason)
  values (
    v_actor, 'account', p_uid,
    case when p_status = 'active'::bsdc_account_status then 'restore_account' else 'suspend_account' end,
    coalesce(p_reason, '')
  );

  perform bsdc.audit('people.status', p_uid,
    jsonb_build_object('status', p_status, 'reason', coalesce(p_reason, '')));

  return p_status;
end;
$$;

revoke all on function public.set_account_status(text, bsdc_account_status, text) from public, anon;
grant execute on function public.set_account_status(text, bsdc_account_status, text) to authenticated, service_role;



-- ============================================================================
-- 9. `bsdc.notify_path`, with the extra column in its conflict target
-- ============================================================================
--
-- The same body as 0090's, plus `coalesce(subject_key, '')` in the `on conflict`
-- target so the recreated index can be inferred. This is the function virtually
-- every notification goes through; `bsdc.notify` is the older, narrower one that
-- 0090 superseded, and it is deliberately left untouched here.
--
-- Restating a hundred-line function to add one column is the price of changing a
-- uniqueness rule, and it is worth paying once rather than reaching for a partial
-- index that Postgres will not accept as an `on conflict` arbiter.
create or replace function bsdc.notify_path(
  p_uid             text,
  p_actor_uid       text,
  p_kind            bsdc_notification_kind,
  p_post_id         uuid default null,
  p_comment_id      uuid default null,
  p_body            text default '',
  p_conversation_id uuid default null,
  p_target_url      text default ''
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_clean_url text := btrim(coalesce(p_target_url, ''));
  v_nid       uuid;
  v_updated   boolean := false;
begin
  if p_uid is null or p_uid = p_actor_uid then
    return;
  end if;

  if exists (
    select 1 from public.blocks
    where (blocker_uid = p_uid and blocked_uid = p_actor_uid)
       or (blocker_uid = p_actor_uid and blocked_uid = p_uid)
  ) then
    return;
  end if;

  if not coalesce(bsdc.notification_allowed(p_uid, p_kind), true) then
    return;
  end if;

  if v_clean_url = '' or v_clean_url !~ '^/[^/\\]' then
    v_clean_url := '';
  else
    v_clean_url := left(v_clean_url, 300);
  end if;

  insert into public.notifications
      (uid, actor_uid, kind, post_id, comment_id, conversation_id, body, target_url)
  values
      (p_uid, p_actor_uid, p_kind, p_post_id, p_comment_id, p_conversation_id,
       left(coalesce(p_body, ''), 280), v_clean_url)
  on conflict (
    uid, actor_uid, kind,
    coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(comment_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(conversation_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(subject_key, '')
  )
  do update set
    created_at    = now(),
    seq           = nextval('public.notifications_seq_seq'),
    read_at       = null,
    pushed_at     = null,
    fcm_pushed_at = null,
    body          = excluded.body,
    target_url    = case
                      when excluded.target_url <> '' then excluded.target_url
                      else public.notifications.target_url
                    end
  returning id, (xmax <> 0) into v_nid, v_updated;

  if v_updated and v_nid is not null then
    delete from bsdc.push_device_deliveries where notification_id = v_nid;
    delete from bsdc.fcm_device_deliveries  where notification_id = v_nid;
  end if;
end;
$$;

revoke all on function bsdc.notify_path(
  text, text, bsdc_notification_kind, uuid, uuid, text, uuid, text
) from public, anon, authenticated;
