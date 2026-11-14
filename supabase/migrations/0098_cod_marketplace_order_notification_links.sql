-- ---------------------------------------------------------------------------
-- 0098 — Order notifications link to the right screen for each recipient.
--
-- 0096 left target_url empty, so every `order` notification fell back to the
-- legacy /orders page: a customer never reached the marketplace tracker, and a
-- vendor never reached the shop console. This writes the destination per
-- recipient. The inbox and the push payload both read target_url first.
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

  insert into public.notifications (uid, actor_uid, kind, body, target_url)
  values (
    v_recipient,
    null,
    'order',
    left(v_body, 280),
    case when v_to_vendor then '/vendor/console' else '/marketplace/orders' end
  );

  return new;
end;
$$;

revoke all on function bsdc.mk_notify_order_event() from public, anon, authenticated;
