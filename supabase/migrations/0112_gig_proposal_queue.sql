-- 0112 — a gig's client can read the proposal queue, and it actually loads.
--
-- Two separate faults made "N proposals" a number that led nowhere.
--
-- 1. Android asked PostgREST for `profiles:freelancer_uid(...,verified)`. There
--    is no `verified` column on `public.profiles`: it is derived in the read
--    RPCs (`role in ('moderator','manager','admin','owner')`, see 0092). An
--    unknown column in a `select=` list is a 400, not an empty list, so the
--    whole proposals query failed and the client saw nothing at all. The same
--    bug sat on `job_applications`.
--
-- 2. Neither platform had a way to list the queue: `gig_proposals` was readable
--    one row at a time but the freelancer's profile came from a second,
--    manually-joined table. That is exactly the kind of join that rots, because
--    the policy that guards it (`profiles` read) and the policy that guards the
--    bids (`gig_proposals_read_parties`) live in different migrations.
--
-- This adds `gig_proposal_queue()`: one server-side read, scoped to the gig's
-- client (or staff), returning the freelancer's public card alongside the bid,
-- with `verified` derived the same way every other member list derives it. It
-- is `stable` and `security definer` with a pinned `search_path`, and it takes
-- the auth decision from `bsdc.current_uid()`, so the client's own uid is never
-- passed in from the browser.
--
-- Downgrade-safe: no table, column, policy or grant is changed by this file.

create or replace function public.gig_proposal_queue(
  p_gig_id uuid,
  p_limit  integer default 100
)
returns table (
  id              uuid,
  gig_id          uuid,
  freelancer_uid  text,
  username        text,
  display_name    text,
  avatar_url      text,
  verified        boolean,
  pitch           text,
  bid_amount      integer,
  delivery_days   integer,
  status          bsdc_application_status,
  created_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid  text := bsdc.current_uid();
  v_gig  public.gigs%rowtype;
  v_cap  integer := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_gig_id is null then
    raise exception 'gig id required' using errcode = '22023';
  end if;

  -- Qualified deliberately. This function's OUT parameter is called `id`, and a
  -- PL/pgSQL variable shadows a column of the same name: `where id = p_gig_id`
  -- is therefore read as `v_row.id = p_gig_id` against the OUT row, and raises
  -- 42702 ("column reference id is ambiguous") for *every* caller. The queue
  -- this file exists to provide could never load. t87 keeps it proved.
  select * into v_gig from public.gigs g where g.id = p_gig_id;
  if not found then
    raise exception 'gig not found' using errcode = 'P0002';
  end if;

  -- Same rule as `decide_gig_proposal`: the client, or staff. Nobody else can
  -- read a queue of bids, including the freelancers who wrote them.
  if v_gig.client_uid is distinct from v_uid and not bsdc.is_staff() then
    raise exception 'only the client of this gig may read its proposals'
      using errcode = '42501';
  end if;

  return query
    select
      gp.id,
      gp.gig_id,
      gp.freelancer_uid,
      coalesce(p.username::text, '')                             as username,
      coalesce(nullif(btrim(p.display_name), ''), 'Member')      as display_name,
      coalesce(p.avatar_url, '')                                 as avatar_url,
      (p.role in ('moderator', 'manager', 'admin', 'owner'))     as verified,
      gp.pitch,
      gp.bid_amount,
      gp.delivery_days,
      gp.status,
      gp.created_at
    from public.gig_proposals gp
    left join public.profiles p on p.uid = gp.freelancer_uid
    where gp.gig_id = p_gig_id
    order by
      -- A withdrawn bid is history: it stays readable but never outranks a live
      -- one. Then newest first, which is what a client triages by.
      (gp.status = 'withdrawn') asc,
      gp.created_at desc
    limit v_cap;
end;
$$;

comment on function public.gig_proposal_queue(uuid, integer) is
  'Every proposal on one gig, with the freelancer public card and a derived verified flag. Client of the gig or staff only.';

revoke all on function public.gig_proposal_queue(uuid, integer) from public;
grant execute on function public.gig_proposal_queue(uuid, integer) to authenticated;

-- How many proposals a queue holds, so a list can show a count it can prove.
create or replace function public.gig_proposal_count(p_gig_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
  v_gig public.gigs%rowtype;
  v_total integer;
begin
  if p_gig_id is null then
    return 0;
  end if;

  select * into v_gig from public.gigs g where g.id = p_gig_id;
  if not found then
    return 0;
  end if;

  -- The public count on the gig card is already visible to everyone; only the
  -- per-row detail is restricted, so an anonymous reader gets the number and
  -- nothing else.
  select count(*)::integer into v_total
    from public.gig_proposals
    where gig_id = p_gig_id
      and status <> 'withdrawn';

  return coalesce(v_total, 0);
end;
$$;

comment on function public.gig_proposal_count(uuid) is
  'Live (non-withdrawn) proposal count for one gig. Safe for any reader.';

revoke all on function public.gig_proposal_count(uuid) from public;
grant execute on function public.gig_proposal_count(uuid) to anon, authenticated;
