-- ---------------------------------------------------------------------------
-- Internal helpers stop answering the door.
--
-- Every function created in the `bsdc` schema inherits PostgreSQL's default
-- EXECUTE grant to PUBLIC, and 0002 grants `usage on schema bsdc` to `anon`
-- and `authenticated`. So all 60-odd internal helpers were callable by anyone
-- holding the publishable key. Most are harmless, but `bsdc.notify` is not:
-- a security-definer function that writes straight into another member's
-- inbox, with no check on who is calling it. An anonymous visitor could post
-- any kind of notification into any member's inbox.
--
-- The rule used to draw the line, applied from the catalogue rather than by
-- reading each function:
--
--   A helper keeps its public grant when something outside the definer
--   boundary legitimately calls it — a row level security policy (policies
--   execute as the caller), a column default, a view, an index expression, a
--   constraint, or a SECURITY INVOKER function's body. Everything else is
--   internal by construction and reverts to owner-only.
--
-- Two trigger functions had to change first. `bsdc.notify_follow` and
-- `bsdc.notify_mention` were SECURITY INVOKER, so the member inserting the
-- follow or the mention executed them with their own privileges — and they
-- call `bsdc.notify`. Closing `notify` without this would have broken follows
-- and mentions. They now run as the owner, exactly as 0039 made the counter
-- triggers do, and for the same reason.
--
-- Nothing legitimate loses access: every client RPC in every app resolves to
-- the `public` schema (checked against the 99 distinct rpc names in the
-- repository), and the functions kept here are the ones that policies and
-- defaults name.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- part 1 — the two notification triggers run as the owner
-- ---------------------------------------------------------------------------
create or replace function bsdc.notify_follow()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  perform bsdc.notify(new.followee_uid, new.follower_uid, 'follow');
  return null;
end;
$$;

create or replace function bsdc.notify_mention()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_author text;
begin
  select author_uid into v_author from public.posts where id = new.post_id;
  perform bsdc.notify(new.mentioned_uid, v_author, 'mention', new.post_id);
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- part 2 — helpers that nothing outside the definer boundary calls
-- ---------------------------------------------------------------------------
-- `bsdc.notify` itself, first: it is the one that writes to another member's
-- inbox, and after part 1 nothing but a definer function calls it.
revoke execute on function bsdc.notify(
  text, text, bsdc_notification_kind, uuid, uuid, text, uuid
) from public;

revoke execute on function bsdc.notification_allowed(text, bsdc_notification_kind) from public;
revoke execute on function bsdc.require_permission(text) from public;
revoke execute on function bsdc.direct_key(text, text) from public;
revoke execute on function bsdc.group_role(uuid, text) from public;
revoke execute on function bsdc.cart_for(text) from public;
revoke execute on function bsdc.settle_order(uuid) from public;
revoke execute on function bsdc.new_order_code() from public;
revoke execute on function bsdc.new_certificate_code() from public;
revoke execute on function bsdc.order_transition_allowed(bsdc_order_status, bsdc_order_status) from public;
revoke execute on function bsdc.ad_event_cost(bsdc_ad_pricing, integer, bsdc_ad_event_kind) from public;
revoke execute on function bsdc.ad_spend_today(uuid) from public;
revoke execute on function bsdc.day_series(integer) from public;
revoke execute on function bsdc.config_value_valid(bsdc_config_type, jsonb, numeric, numeric) from public;
revoke execute on function bsdc.clip_text(text, integer) from public;
revoke execute on function bsdc.check_theme_tokens(jsonb) from public;
revoke execute on function bsdc.route_pattern(text) from public;
