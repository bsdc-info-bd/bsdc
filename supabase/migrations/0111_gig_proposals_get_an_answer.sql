-- 0111 — a gig's client can answer a proposal, and only that client.
--
-- `job_applications` has had `public.decide_application()` since 0013, which is
-- how an employer moves an applicant to reviewing, shortlisted, hired or
-- rejected. A freelance gig had no equivalent: `gig_proposals` was granted
-- `select, delete` only, so the client of a gig could read a proposal and the
-- freelancer could retract one, but nobody could ever say "yes".
--
-- This adds the missing half of the same conversation, with the same shape and
-- the same guarantees as `decide_application`:
--
--   * only the client who posted the gig may decide (staff may, as they can
--     everywhere else);
--   * the decision is a server-side write, so a member can never PATCH a status
--     column straight through PostgREST;
--   * the freelancer is told, once, with a notification whose link opens the
--     gig they bid on.
--
-- It also finishes what 0042 started. That migration revoked blanket UPDATE on
-- the opportunity tables and re-granted the columns a member may write; it did
-- not list `gig_proposals` at all, because until now no column of that table
-- was writable by a member. The status column stays server-owned: the grant
-- below deliberately omits it, so the RPC is the only door.

-- ------------------------------ the decision -------------------------------

create or replace function public.decide_gig_proposal(
  p_proposal_id uuid,
  p_status      bsdc_application_status
)
returns void
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid  text := bsdc.current_uid();
  v_row  public.gig_proposals%rowtype;
  v_gig  public.gigs%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_row from public.gig_proposals where id = p_proposal_id;
  if not found then
    raise exception 'proposal not found' using errcode = 'P0002';
  end if;

  select * into v_gig from public.gigs where id = v_row.gig_id;

  if v_gig.client_uid is distinct from v_uid and not bsdc.is_staff() then
    raise exception 'only the client of this gig may decide a proposal'
      using errcode = '42501';
  end if;

  -- A retracted bid is the freelancer's decision, not the client's: re-deciding
  -- it would put a withdrawn proposal back in the client's queue.
  if v_row.status = 'withdrawn' then
    raise exception 'this proposal was withdrawn by the freelancer'
      using errcode = '22023';
  end if;

  update public.gig_proposals
    set status = p_status
    where id = p_proposal_id;

  perform bsdc.notify_path(
    v_row.freelancer_uid,
    v_uid,
    'job',
    null,
    null,
    left('Your proposal for ' || v_gig.title || ' is now ' || p_status::text, 280),
    null,
    '/freelance/' || v_gig.slug
  );
end;
$$;

grant execute on function public.decide_gig_proposal(uuid, bsdc_application_status)
  to authenticated;

-- --------------------------------- grants ----------------------------------
--
-- Read and delete stay exactly as 0014 granted them. The update grant below is
-- column-scoped on purpose: it lets nothing through on its own (the row is
-- still guarded by `gig_proposals_read_parties` for reads and by the RPC for
-- writes) but it keeps the table's privilege list explicit, so nobody has to
-- guess in a later migration whether a revoke is still in force.

revoke update on public.gig_proposals from authenticated;
grant update (pitch, bid_amount, delivery_days) on public.gig_proposals to authenticated;

-- A client may not decide their own proposal — they cannot have one, because
-- `submit_proposal` already refuses a bid on your own gig. The policy below
-- makes the same statement at the row level: a client only ever sees their own
-- gig's proposals, which `gig_proposals_read_parties` already enforces.

comment on function public.decide_gig_proposal(uuid, bsdc_application_status) is
  'The client of a gig (or staff) moves a proposal to reviewing, shortlisted, hired or rejected. The freelancer is notified with a link to the gig.';
