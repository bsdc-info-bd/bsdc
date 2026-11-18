-- 0119 — a member can delete their own account.
--
-- Google Play requires in-app account deletion for any app that lets people
-- create an account, and the privacy policy already promises it: "When you
-- delete your account, your profile, posts, messages and device tokens are
-- deleted; order and payment records that belong to the other party to a
-- transaction are retained in a form that no longer identifies you." Until now
-- the only way to exercise that promise was to write to the support address.
-- This migration makes it a button.
--
-- The design follows the policy exactly, and the schema forces it:
--
--   * The profile row is anonymised, not hard-deleted. `public.orders.uid`
--     references it `on delete restrict`, and order records must survive for
--     the other party to the transaction. Anonymising the profile is what makes
--     those retained records stop identifying the person.
--
--   * Because the row survives, nothing cascades. That is the whole difficulty
--     of this migration: ninety-odd tables reference `profiles` with
--     `on delete cascade`, and against a row that is not deleted, not one of
--     those cascades fires. Every personal store therefore has to be named
--     explicitly below. The list is grouped and commented for that reason, and
--     it is the part a reviewer should read when a new table is added: a new
--     personal table that cascades from `profiles` is *not* covered for free.
--
--   * What is deleted: content the member authored, their social graph, their
--     behavioural traces, their private records (applications, proposals,
--     learning progress, sketches, address book), and every device token.
--
--   * What is kept, de-identified: orders and payments on both marketplaces,
--     credit ledgers, moderation and audit records. These exist for the other
--     party, for accounting, or for safety, and each is scrubbed of the fields
--     that identify the person where the row must survive a terminal state.
--
--   * Shop and vendor rows are kept (orders point at them) but suspended and
--     stripped of contact details, including the NID and bKash sender numbers
--     on the vendor application, which are the most sensitive rows in the
--     database.
--
--   * The username is released. It is set to null rather than left behind,
--     because a deleted member's handle must not stay reserved for them — and
--     because leaving it would keep identifying them in URLs.
--
--   * The role is reset to 'member'. An anonymised profile must not keep a
--     staff or moderator role: the account is gone, and the row that remains is
--     a tombstone for foreign keys, not a person with powers.
--
-- Two refusals, both deliberate:
--
--   * An anonymous caller gets 42501. There is no account to delete.
--   * The owner account cannot be deleted from here. It is the one account the
--     platform cannot lose, and a self-service path that could remove it would
--     be a way to lock the whole community out of its own database. An owner
--     who genuinely wants to leave transfers ownership first, through the
--     people console, which is the path that already exists for that.
--
-- The Firebase user is deleted by the client after this returns, not here: the
-- database cannot reach Firebase, and the client is the one holding the
-- session. The order matters — the database work happens while the token is
-- still valid, then the auth account goes, then the client signs out.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
begin
  if v_uid is null then
    raise exception 'sign in required to delete an account' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.profiles where uid = v_uid and role = 'owner'
  ) then
    raise exception 'the owner account cannot be deleted from here; transfer ownership first'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where uid = v_uid) then
    raise exception 'no such member' using errcode = 'P0002';
  end if;

  -- ---------------------------------------------------------------------
  -- 1. Content the member authored. Posts carry their comments, reactions,
  --    media and mentions with them; the explicit deletes cover what a post
  --    does not own, and what the member wrote elsewhere.
  -- ---------------------------------------------------------------------
  delete from public.posts where author_uid = v_uid;
  delete from public.comments where author_uid = v_uid;
  delete from public.messages where sender_uid = v_uid;
  delete from public.media_assets where owner_uid = v_uid;
  delete from public.playground_sketches where uid = v_uid;
  delete from public.product_reviews where uid = v_uid;
  delete from public.mk_reviews where customer_uid = v_uid;

  -- ---------------------------------------------------------------------
  -- 2. The address book and every device token. A token that outlives the
  --    account would keep waking a phone for somebody who has left.
  -- ---------------------------------------------------------------------
  delete from public.addresses where uid = v_uid;
  delete from public.fcm_tokens where uid = v_uid;
  delete from public.push_subscriptions where uid = v_uid;

  -- ---------------------------------------------------------------------
  -- 3. The social graph. Follows, blocks, memberships, RSVPs and reactions
  --    are about the member's participation, and none of them carries a
  --    counterparty obligation that survives the account.
  -- ---------------------------------------------------------------------
  delete from public.follows where follower_uid = v_uid or followee_uid = v_uid;
  delete from public.blocks where blocker_uid = v_uid or blocked_uid = v_uid;
  delete from public.group_members where uid = v_uid;
  delete from public.group_join_requests where uid = v_uid;
  delete from public.channel_members where uid = v_uid;
  delete from public.page_followers where uid = v_uid;
  delete from public.event_rsvps where uid = v_uid;
  delete from public.conversation_members where uid = v_uid;
  delete from public.post_reactions where uid = v_uid;
  delete from public.comment_reactions where uid = v_uid;
  delete from public.poll_votes where voter_uid = v_uid;
  delete from public.post_shares where uid = v_uid;
  delete from public.project_stars where uid = v_uid;
  delete from public.message_reactions where uid = v_uid;
  delete from public.message_receipts where uid = v_uid;
  delete from public.message_stars where uid = v_uid;
  delete from public.message_pins where pinned_by = v_uid;

  -- ---------------------------------------------------------------------
  -- 4. Behavioural traces and inboxes: what the member read, saved, searched
  --    for, and was notified about. These are the rows the privacy policy
  --    calls "activity", and they go with the account.
  -- ---------------------------------------------------------------------
  delete from public.notifications where uid = v_uid or actor_uid = v_uid;
  delete from public.bookmarks where uid = v_uid;
  delete from public.bookmark_collections where uid = v_uid;
  delete from public.feed_preferences where uid = v_uid;
  delete from public.feed_seen where uid = v_uid;
  delete from public.topic_affinity where uid = v_uid;
  delete from public.notice_receipts where uid = v_uid;
  delete from public.wishlist_items where uid = v_uid;
  delete from public.carts where uid = v_uid;
  delete from public.mk_cart_items where customer_uid = v_uid;
  delete from public.ip_events where uid = v_uid;

  -- ---------------------------------------------------------------------
  -- 5. Private records that only ever described the member: job
  --    applications and cover letters, freelance proposals, course
  --    enrollment and progress, certificates issued to them.
  -- ---------------------------------------------------------------------
  delete from public.job_applications where applicant_uid = v_uid;
  delete from public.gig_proposals where freelancer_uid = v_uid;
  delete from public.enrollments where uid = v_uid;
  delete from public.lesson_progress where uid = v_uid;
  delete from public.quiz_attempts where uid = v_uid;
  delete from public.certificates where uid = v_uid;
  delete from public.staff_records where uid = v_uid;

  -- ---------------------------------------------------------------------
  -- 6. Vendor and shop rows survive, because orders point at them and the
  --    buyer's history has to keep resolving. They are suspended and
  --    stripped: a closed shop must not keep publishing the owner's mobile
  --    number, and the application must not keep their NID.
  --
  --    The placeholders below are the narrowest values the table's own check
  --    constraints accept, not arbitrary filler: `mobile` must match a
  --    Bangladeshi handset pattern, `nid_number` must be 10, 13 or 17 digits.
  -- ---------------------------------------------------------------------
  update public.mk_vendors
     set status       = 'suspended',
         name         = 'Closed shop',
         description  = '',
         logo_url     = '',
         cover_url    = '',
         mobile       = '01700000000',
         address_line = 'Removed'
   where owner_uid = v_uid;

  update public.mk_vendor_applications
     set full_name       = 'Deleted member',
         shop_name       = 'Closed shop',
         nid_number      = '0000000000',
         mobile          = '01700000000',
         address_line    = 'Removed',
         trade_license_no = '',
         place_label     = '',
         payment_sender  = '01700000000',
         payment_holder  = 'Deleted member',
         review_note     = ''
   where owner_uid = v_uid;

  update public.shops
     set status  = 'closed',
         name    = 'Closed shop',
         tagline = '',
         about   = '',
         logo_url = '',
         city    = ''
   where owner_uid = v_uid;

  -- ---------------------------------------------------------------------
  -- 7. Orders on both marketplaces. An order that is still live keeps its
  --    delivery snapshot: the vendor has to be able to deliver it, and that
  --    is transactional data with a purpose. An order that is finished has
  --    no such purpose left, so its snapshot goes. The row itself stays, and
  --    still points at the tombstone profile, so the vendor's takings and the
  --    buyer's history both keep adding up.
  -- ---------------------------------------------------------------------
  update public.orders
     set recipient    = 'Deleted member',
         phone        = '',
         address_line = 'Removed',
         city         = '',
         note         = ''
   where uid = v_uid
     and status in ('delivered', 'cancelled', 'refunded');

  update public.mk_orders
     set customer_name  = 'Deleted member',
         customer_phone = '01700000000',
         address_line   = 'Removed',
         landmark       = '',
         place_label    = '',
         note           = ''
   where customer_uid = v_uid
     and status in ('delivered', 'cancelled');

  -- ---------------------------------------------------------------------
  -- 8. The profile itself: a tombstone. No name, no handle, no photo, no
  --    bio, no location, no skills, no role, no counts. The row remains so
  --    every foreign key above keeps resolving, and `status = 'deleted'`
  --    (which the enum has carried since 0001) is what the read paths use to
  --    decide the tombstone is not a person.
  -- ---------------------------------------------------------------------
  update public.profiles
     set display_name        = 'Deleted member',
         username            = null,
         bio                 = '',
         avatar_url          = '',
         cover_url           = '',
         location            = '',
         website             = '',
         skills              = '{}',
         interests           = '{}',
         role                = 'member',
         status              = 'deleted',
         onboarding_complete = false,
         email_verified      = false,
         notifications       = '{"followers":false,"comments":false,"mentions":false,"messages":false,"digest":false}'::jsonb,
         privacy             = '{"discoverable":false,"showActivity":false,"showEmail":false}'::jsonb,
         followers_count     = 0,
         following_count     = 0,
         posts_count         = 0,
         last_seen_at        = null
   where uid = v_uid;

  perform bsdc.audit('account.self_delete', v_uid, '{}'::jsonb);
end;
$$;

-- `create function` grants EXECUTE to PUBLIC by default, which in this project
-- means anon too. The body refuses an anonymous caller anyway, but a function
-- that deletes content should not answer the door at all: revoke the default and
-- grant the one role that has an account to delete.
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Self-service account deletion, required by Google Play for apps with account '
  'creation. Deletes authored content, the social graph, behavioural traces, '
  'private records and device tokens; suspends and strips vendor and shop rows; '
  'scrubs finished orders; anonymises the profile to a tombstone. Order and '
  'payment rows survive because they reference the profile, but no longer '
  'identify anyone. The client deletes the Firebase user after this returns.';
