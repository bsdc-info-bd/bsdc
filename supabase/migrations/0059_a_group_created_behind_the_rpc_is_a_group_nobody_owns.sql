-- A group is three rows, not one.
--
-- `create_group` writes the group, its creator's own membership as owner, and
-- the `general` channel every group is born with. It is `security definer`, so
-- it has never needed the calling role to hold INSERT on the table — but the
-- grant was there anyway, and with it a member could write the group row on its
-- own: a group with no owner, no members and nowhere to post, listed in the
-- directory for everybody to find, and deletable only by staff or by somebody
-- who has no way to see it as theirs.
--
-- This closes the shortcut, not group creation. Every policy on the table is
-- untouched: a member still reads what the group's privacy allows, still
-- updates a group they moderate, and staff can still do what staff do.
--
-- `channels` keeps its grant on purpose — there is no `create_channel`
-- routine, and a group's moderator writes its channels directly.

revoke insert on table public.groups from authenticated;
