-- ---------------------------------------------------------------------------
-- 0087 — Notification vocabulary expansion across every platform domain.
--
-- Like 0047, this file only appends new enum labels to `bsdc_notification_kind`.
-- Postgres allows `ALTER TYPE ... ADD VALUE` inside a transaction block, but a
-- newly added enum label cannot be referenced in the same transaction; 0088
-- uses all of these labels immediately in the next migration transaction.
-- ---------------------------------------------------------------------------

do $$
declare
  v_label text;
  v_labels constant text[] := array[
    'order',
    'review',
    'payout',
    'course',
    'job',
    'event',
    'certificate',
    'mention_group',
    'group_invite',
    'feedback'
  ];
begin
  foreach v_label in array v_labels loop
    if not exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = 'bsdc_notification_kind'
        and e.enumlabel = v_label
    ) then
      execute format('alter type bsdc_notification_kind add value %L', v_label);
    end if;
  end loop;
end
$$;
