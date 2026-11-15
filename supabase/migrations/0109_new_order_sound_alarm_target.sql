-- ---------------------------------------------------------------------------
-- 0109 — A new order marks its vendor notification as an alarm.
--
-- The vendor's Android device plays a looping sound for a new order. The push
-- worker needs to tell a fresh order apart from every later status change to
-- the same vendor, and the notification row already carries the destination,
-- so the destination is the signal: a freshly placed order links to
-- /vendor/console?alarm=new. Every other order notification keeps its target
-- exactly as before (0098). Nothing else in the trigger changes.
-- ---------------------------------------------------------------------------
create or replace function bsdc.mk_notify_order_event()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_order     public.mk_orders%rowtype;
  v_owner     text;
  v_recipient text;
  v_to_vendor boolean;
  v_body      text;
  v_target    text;
begin
  select * into v_order from public.mk_orders where id = new.order_id;
  if not found then
    return new;
  end if;
  select owner_uid into v_owner from public.mk_vendors where id = v_order.vendor_id;

  -- The party who did not act hears about it.
  v_to_vendor := new.actor_uid is not null and new.actor_uid = v_order.customer_uid;
  if v_to_vendor then
    v_recipient := v_owner;
  else
    v_recipient := v_order.customer_uid;
  end if;

  if v_recipient is null or v_recipient = new.actor_uid then
    return new;
  end if;

  -- A block in either direction silences the line, as bsdc.notify() does.
  if exists (
    select 1 from public.blocks
     where (blocker_uid = v_recipient and blocked_uid = new.actor_uid)
        or (blocker_uid = new.actor_uid and blocked_uid = v_recipient)
  ) then
    return new;
  end if;

  v_body := 'Order ' || v_order.code || ' · ' || bsdc.mk_order_status_label(new.status::text);
  if coalesce(new.note, '') <> '' then
    v_body := v_body || ' · ' || new.note;
  end if;

  if not v_to_vendor then
    v_target := '/marketplace/orders';
  elsif new.status::text = 'placed' then
    v_target := '/vendor/console?alarm=new';
  else
    v_target := '/vendor/console';
  end if;

  insert into public.notifications (uid, actor_uid, kind, body, target_url)
  values (v_recipient, null, 'order', left(v_body, 280), v_target);

  return new;
end;
$$;

revoke all on function bsdc.mk_notify_order_event() from public, anon, authenticated;
