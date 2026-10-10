-- A voice note is not a document, and an archive is a write somebody can make.
--
-- Two failures in the messenger, both of which look like a button that does
-- nothing:
--
-- Recording worked in the browser and then arrived in the thread as a file
-- chip, because `bsdc_message_kind` had no value for sound. The enum is what a
-- row says it is, and a row that calls a voice note a "file" is a row every
-- reader of it — the thread, the preview line, a moderator's queue, an export
-- — has to guess about again. `audio` and `video` are added here. Nothing in
-- this migration uses the new values, because a value added to an enum cannot
-- be read in the same transaction that added it.
--
-- Archiving a conversation was refused. Pin, archive and the shared draft live
-- on the member's own `conversation_members` row; the row policy has always
-- allowed a member to update their own row, but the column grant that lets the
-- role touch those three columns arrived later, in 0051. On a deployment that
-- has not had 0051 applied, the update is refused with 42501 — and because the
-- control is optimistic, the only thing the member sees is the toggle snapping
-- back. The grant is repeated here. It is idempotent, and it belongs wherever
-- the messenger's own writes are being made to work.
--
-- t21 builds the database as production stands today, without 0051, to prove
-- what is missing there. That is also a deployment that has to survive this
-- migration, which is why the grants below are conditional on the column
-- existing rather than assuming 0051 ran first.

alter type bsdc_message_kind add value if not exists 'audio';
alter type bsdc_message_kind add value if not exists 'video';

-- Repeated from 0051 (pin, archive, shared draft) and from 0010 (read marker,
-- mute, leaving), because a deployment that never got one of those should still
-- be able to run this migration and have the messenger work. Each column is
-- granted only where it exists: `is_pinned` and its neighbours were added by
-- 0051, and a grant on a column that is not there yet is an error, not a
-- no-op. The essential part is not wrapped in a handler — a failure here should
-- be heard, not swallowed.
do $$
declare
  wanted_column text;
  wanted constant text[] := array[
    'is_pinned', 'is_archived', 'draft_body',
    'last_read_at', 'muted_until', 'left_at'
  ];
begin
  foreach wanted_column in array wanted loop
    if exists (
      select 1
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = 'conversation_members'
         and a.attname = wanted_column
         and a.attnum > 0
         and not a.attisdropped
    ) then
      execute format(
        'grant update (%I) on public.conversation_members to authenticated',
        wanted_column
      );
    end if;
  end loop;
end
$$;

comment on column public.messages.kind is
  'What the line is: text, image, audio (a voice note), video, file, snippet or system. Set by send_message from the caller, and the caller is the client that recorded or chose the attachment.';
