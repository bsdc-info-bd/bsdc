-- ---------------------------------------------------------------------------
-- The notification vocabulary gains the word for a message.
--
-- This is a file of its own on purpose. `alter type ... add value` is allowed
-- inside a transaction, but the new label may not be *used* in the same
-- transaction, and every migration file here runs as one transaction — so
-- adding the label and the function that names it cannot share a file. This
-- one only adds the label; the sender that uses it is 0048.
--
-- Re-running is a no-op: the label is added only when it is absent.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'bsdc_notification_kind' and e.enumlabel = 'message'
  ) then
    alter type bsdc_notification_kind add value 'message';
  end if;
end
$$;
