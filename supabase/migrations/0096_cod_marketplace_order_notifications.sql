-- ---------------------------------------------------------------------------
-- 0096 — Order notifications for the cash-on-delivery marketplace.
--
-- Every order event (0094 writes one mk_order_events row per change) tells the
-- party who did NOT act: a new order tells the vendor, and every later change
-- tells the customer, or the vendor when the customer acted.
--
-- Rows are inserted directly, not through bsdc.notify(). bsdc.notify() keys
-- one row per (recipient, actor, kind, target), so a customer's second order
-- would overwrite the first. Here actor_uid is null, which the unique index
-- never treats as equal, so every event keeps its own line in the inbox.
-- ---------------------------------------------------------------------------

create or replace function bsdc.mk_order_status_label(p_status text)
returns text
language sql
immutable
as $$
  select case p_status
    when 'placed' then 'New order | নতুন অর্ডার'
    when 'accepted' then 'Accepted | গ্রহণ করা হয়েছে'
    when 'packaged' then 'Packaged | প্যাকেট হয়েছে'
    when 'out_for_delivery' then 'Out for delivery | ডেলিভারিতে'
    when 'delivered' then 'Delivered | পৌঁছে গেছে'
    when 'cancelled' then 'Cancelled | বাতিল'
    else p_status
  end
$$;

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
  v_body      text;
begin
  select * into v_order from public.mk_orders where id = new.order_id;
  if not found then
    return new;
  end if;
  select owner_uid into v_owner from public.mk_vendors where id = v_order.vendor_id;

  -- The party who did not act hears about it.
  if new.actor_uid is not null and new.actor_uid = v_order.customer_uid then
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

  insert into public.notifications (uid, actor_uid, kind, body)
  values (v_recipient, null, 'order', left(v_body, 280));

  return new;
end;
$$;

drop trigger if exists mk_order_events_notify on public.mk_order_events;
create trigger mk_order_events_notify
  after insert on public.mk_order_events
  for each row execute function bsdc.mk_notify_order_event();

revoke all on function bsdc.mk_notify_order_event() from public, anon, authenticated;
revoke all on function bsdc.mk_order_status_label(text) from public, anon, authenticated;
