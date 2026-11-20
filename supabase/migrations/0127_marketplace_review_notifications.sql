-- The current marketplace queues bypass the legacy shops decision notifier.
-- Notify only on a final state transition, not when staff edit a note.
create or replace function bsdc.notify_marketplace_review()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_actor text;
  v_body text;
begin
  if new.status is not distinct from old.status or new.status not in ('approved', 'rejected') then
    return new;
  end if;

  if tg_table_name = 'mk_vendor_applications' then
    v_actor := new.reviewed_by;
    v_body := case when new.status = 'approved' then 'বিক্রেতার আবেদন অনুমোদিত · Vendor application approved'
                  else 'বিক্রেতার আবেদন প্রত্যাখ্যাত · Vendor application rejected' end;
  else
    -- The initial package shares the application decision; do not wake twice.
    if new.application_id is not null or new.vendor_id is null then
      return new;
    end if;
    v_actor := new.decided_by;
    v_body := case when new.status = 'approved' then 'অর্ডার ক্রেডিট অনুমোদিত · Order credits approved'
                  else 'অর্ডার ক্রেডিট প্রত্যাখ্যাত · Order credits rejected' end;
  end if;

  perform bsdc.notify_path(new.owner_uid, v_actor, 'moderation', null, null, v_body, null, '/vendor/console');
  return new;
end;
$$;

revoke all on function bsdc.notify_marketplace_review() from public, anon, authenticated;

create trigger mk_vendor_application_review_notification
  after update of status on public.mk_vendor_applications
  for each row execute function bsdc.notify_marketplace_review();

create trigger mk_credit_purchase_review_notification
  after update of status on public.mk_credit_purchases
  for each row execute function bsdc.notify_marketplace_review();
