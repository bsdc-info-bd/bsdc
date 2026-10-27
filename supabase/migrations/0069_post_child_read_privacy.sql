-- Child records must not reveal content hidden by the parent post's RLS.
-- Use the caller's SELECT on posts, not a SECURITY DEFINER helper: this keeps
-- drafts, follower visibility, trash and channel membership aligned with the
-- actual parent policy, including future changes to that policy.
-- Restrictive policies also constrain permissive FOR ALL author policies;
-- replacing only *_read_all would otherwise leave that alternate read path.
-- Existing write policies/grants and service-role maintenance remain intact.
do $$
declare
  child text;
begin
  foreach child in array array[
    'post_tags', 'post_media', 'post_mentions', 'poll_options', 'poll_votes'
  ] loop
    execute format('drop policy if exists post_parent_read_guard on public.%I', child);
    execute format(
      'create policy post_parent_read_guard on public.%I as restrictive
       for select to public using (
         exists (select 1 from public.posts p where p.id = %I.post_id)
       )', child, child
    );
  end loop;
end;
$$;
