-- 0115 — buying advertising credits with bKash, and a review queue for them.
--
-- Until now an advertising wallet could only be filled by `topup_ad_wallet()`,
-- which is staff-only and takes a number typed by an administrator. An
-- advertiser with a bKash balance and a campaign to run had no path at all: the
-- only way to advertise was to find a member of staff.
--
-- This adds the missing half — a member's own request, and a decision on it —
-- with the same shape the marketplace already uses for vendor credit packages
-- (`mk_credit_purchases` + `mk_admin_decide_credit_purchase`, 0094), because two
-- payment flows that answer the same question should not answer it differently.
--
-- The rules the product asked for, and where each one is enforced:
--
--   * 1 credit = 1 taka. A credit is a taka. `ad_credit_amount_poisha(v)` is
--     the single place that conversion happens, and it is the only arithmetic
--     in this file.
--   * Minimum 500 taka. Enforced by a table CHECK and re-stated by the RPC, so
--     neither a stale browser nor a hand-written request can get under it.
--   * bKash only. The method column has one allowed value today. Adding Nagad
--     later is a migration, not a client change — and a client can never
--     choose a method the server has not agreed to.
--   * Spendable on ads only. A credit lands in `ad_wallet_entries`, which only
--     `ad_spend` reads. It is not a balance anything else can draw on.
--   * Approve or reject with a reason. A rejection without a reason is refused
--     in SQL, and the advertiser is told the reason through the notification
--     body, so it is not a sentence that exists only in a log.
--
-- Security posture:
--
--   * No client write grant on `ad_credit_purchases` at all. Rows are created by
--     `request_ad_credits()` and changed by `decide_ad_credit_request()`. There
--     is no INSERT, UPDATE or DELETE privilege to abuse, so a forged request
--     cannot set its own `status`, `price_poisha` or `credits`.
--   * The amount is computed from the credit count on the server. A client that
--     posts `credits: 500, price_poisha: 1` gets 500 credits priced at 50000
--     poisha, because the price column is never read from the request.
--   * A txn id is unique among live rows, so one bKash payment cannot fund two
--     wallets. A rejected request releases its txn id, because a rejection means
--     the money was not counted — the advertiser may correct the id and retry.
--   * Approval inserts exactly one `topup` ledger row, keyed to the request, and
--     the partial unique index below makes a second insert impossible even if
--     two administrators press approve at the same moment.

-- ---------------------------- telling the staff ----------------------------
--
-- `bsdc.notify_path()` addresses one member. A review queue needs the other
-- shape: "tell everyone who can act on this". That is a different question
-- from a role, because a permission can be granted to a role the notification
-- author has never heard of — so this reads the permission, not a role name.
--
-- It is intentionally not SECURITY DEFINER: it is only ever called from inside
-- the definer functions below, and keeping it invoker-rights means it cannot be
-- reached as a standalone notifier by a client role.

create or replace function bsdc.notify_staff(
  p_permission text,
  p_actor_uid  text,
  p_body       text,
  p_target_url text default ''
)
returns integer
language plpgsql
as $$
declare
  v_recipient text;
  v_count     integer := 0;
begin
  for v_recipient in
    select p.uid
      from public.profiles p
     where p.status = 'active'::bsdc_account_status
       and (
             p.role = 'owner'::bsdc_role
             or p.role in (
                  select r.role from public.role_permissions r
                   where r.permission = p_permission
                )
           )
  loop
    perform bsdc.notify_path(
      v_recipient,
      p_actor_uid,
      'moderation'::bsdc_notification_kind,
      null,
      null,
      p_body,
      null,
      p_target_url
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

comment on function bsdc.notify_staff(text, text, text, text) is
  'Notifies every active member whose role holds a permission. Returns how many were told.';

revoke all on function bsdc.notify_staff(text, text, text, text) from public, anon, authenticated;

-- -------------------------------- credits ----------------------------------

/**
 * Taka in, poisha out — the whole exchange rate, in one function.
 *
 * One advertising credit buys one taka of delivery, and the ledger counts in
 * poisha, so a credit is 100 poisha. Every path that prices a package calls
 * this; nothing else multiplies by 100.
 */
create or replace function bsdc.ad_credit_amount_poisha(p_credits integer)
returns integer
language sql
immutable
as $$
  select (greatest(coalesce(p_credits, 0), 0) * 100)::integer;
$$;

comment on function bsdc.ad_credit_amount_poisha(integer) is
  'Advertising credits to poisha: 1 credit = 1 taka = 100 poisha.';

create table if not exists public.ad_credit_purchases (
  id             uuid primary key default gen_random_uuid(),
  uid            text not null references public.profiles (uid) on delete cascade,
  -- A credit is a taka, so this is also the taka amount.
  credits        integer not null check (credits >= 500 and credits <= 1000000),
  price_poisha   integer not null check (price_poisha >= 50000),
  method         text not null default 'bkash' check (method in ('bkash')),
  -- The bKash account the money was sent from, and the transaction id bKash gave.
  sender_number  text not null check (sender_number ~ '^01[3-9][0-9]{8}$'),
  txn_id         text not null check (char_length(btrim(txn_id)) between 6 and 64),
  status         text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  review_note    text not null default '' check (char_length(review_note) <= 500),
  decided_by     text references public.profiles (uid) on delete set null,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  -- The price is the credit count, and the server says so rather than trusting
  -- a column a client could have written.
  constraint ad_credit_price_matches check (price_poisha = credits * 100)
);

-- One live request per bKash transaction. A rejected or cancelled request
-- releases its id so a typo can be corrected and resubmitted.
create unique index if not exists ad_credit_purchases_live_txn_idx
  on public.ad_credit_purchases (lower(btrim(txn_id)))
  where status in ('pending', 'approved');

create index if not exists ad_credit_purchases_uid_idx
  on public.ad_credit_purchases (uid, created_at desc);

create index if not exists ad_credit_purchases_status_idx
  on public.ad_credit_purchases (status, created_at);

-- Which request credited which ledger row. Null for the staff top-ups that
-- existed before this table. The unique index is what makes double approval
-- impossible rather than merely unlikely.
alter table public.ad_wallet_entries
  add column if not exists credit_purchase_id uuid
    references public.ad_credit_purchases (id) on delete set null;

create unique index if not exists ad_wallet_entries_credit_once_idx
  on public.ad_wallet_entries (credit_purchase_id)
  where credit_purchase_id is not null;

alter table public.ad_credit_purchases enable row level security;

-- A member reads their own requests; staff read every request. Nothing writes
-- through these policies: the only writer is the SECURITY DEFINER RPCs below.
drop policy if exists ad_credit_purchases_read_own on public.ad_credit_purchases;
create policy ad_credit_purchases_read_own on public.ad_credit_purchases
  for select using (uid = bsdc.current_uid() or bsdc.is_staff());

revoke all on public.ad_credit_purchases from public, anon, authenticated;

-- ------------------------------ the request --------------------------------

create or replace function public.request_ad_credits(
  p_credits       integer,
  p_sender_number text,
  p_txn_id        text
)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid     text := bsdc.current_uid();
  v_credits integer := coalesce(p_credits, 0);
  v_sender  text := btrim(coalesce(p_sender_number, ''));
  v_txn     text := btrim(coalesce(p_txn_id, ''));
  v_price   integer;
  v_row     public.ad_credit_purchases%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if v_credits < 500 then
    raise exception 'The minimum advertising credit purchase is 500 taka'
      using errcode = '22023';
  end if;
  if v_credits > 1000000 then
    raise exception 'The maximum advertising credit purchase is 1,000,000 taka'
      using errcode = '22023';
  end if;
  if v_sender !~ '^01[3-9][0-9]{8}$' then
    raise exception 'Enter the bKash number the money was sent from, like 01712345678'
      using errcode = '22023';
  end if;
  if char_length(v_txn) < 6 then
    raise exception 'Enter the bKash transaction id from your payment message'
      using errcode = '22023';
  end if;

  -- One bKash payment, one request. The unique index would refuse this anyway;
  -- saying so here means the member gets a sentence instead of a 23505.
  if exists (
    select 1 from public.ad_credit_purchases
     where lower(btrim(txn_id)) = lower(v_txn)
       and status in ('pending', 'approved')
  ) then
    raise exception 'This bKash transaction id has already been used'
      using errcode = '23505';
  end if;

  v_price := bsdc.ad_credit_amount_poisha(v_credits);

  insert into public.ad_credit_purchases (uid, credits, price_poisha, method, sender_number, txn_id)
  values (v_uid, v_credits, v_price, 'bkash', v_sender, v_txn)
  returning * into v_row;

  -- Whoever reviews advertising is told once, with a link that opens the queue.
  -- The notification kind vocabulary is a database enum shared with the web and
  -- Android clients; a brand new label could not be referenced in this same
  -- transaction anyway, and would render as an unknown kind in every client
  -- until they shipped. `moderation` is the kind the review queues already use,
  -- so the staff notification reads correctly everywhere on day one.
  perform bsdc.notify_staff(
    'advertising.review',
    v_uid,
    left('Advertising credit request: ' || v_credits || ' taka from ' || v_sender, 280),
    '/admin/ads'
  );

  return jsonb_build_object(
    'id', v_row.id,
    'credits', v_row.credits,
    'price_poisha', v_row.price_poisha,
    'status', v_row.status
  );
end;
$$;

comment on function public.request_ad_credits(integer, text, text) is
  'An advertiser asks for credits after paying bKash. Minimum 500 taka, 1 credit = 1 taka. The price is computed server-side.';

revoke all on function public.request_ad_credits(integer, text, text) from public, anon;
grant execute on function public.request_ad_credits(integer, text, text) to authenticated;

-- ------------------------------ the review ---------------------------------

create or replace function public.decide_ad_credit_request(
  p_purchase_id uuid,
  p_decision    text,
  p_note        text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid       text := bsdc.mk_require_uid();
  v_note      text := btrim(coalesce(p_note, ''));
  v_row       public.ad_credit_purchases%rowtype;
  v_balance   integer;
begin
  perform bsdc.mk_require_staff_permission('advertising.review');

  if p_decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject' using errcode = '22023';
  end if;

  select * into v_row
    from public.ad_credit_purchases
   where id = p_purchase_id
   for update;

  if not found then
    raise exception 'Credit request not found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'This credit request was already decided' using errcode = '22023';
  end if;

  if p_decision = 'reject' then
    -- A rejection the advertiser cannot read is a rejection they cannot act on,
    -- so a reason is required and it is delivered, not merely stored.
    if char_length(v_note) < 5 then
      raise exception 'Write a reason of at least 5 characters' using errcode = '22023';
    end if;

    update public.ad_credit_purchases
       set status = 'rejected',
           review_note = left(v_note, 500),
           decided_by = v_uid,
           decided_at = now()
     where id = v_row.id;

    perform bsdc.notify_path(
      v_row.uid,
      v_uid,
      'payout'::bsdc_notification_kind,
      null,
      null,
      left('Your ' || v_row.credits || ' taka advertising credit request was declined: ' || v_note, 280),
      null,
      '/ads'
    );

    return jsonb_build_object('id', v_row.id, 'status', 'rejected');
  end if;

  update public.ad_credit_purchases
     set status = 'approved',
         review_note = left(v_note, 500),
         decided_by = v_uid,
         decided_at = now()
   where id = v_row.id;

  -- The money arrives as a single `topup` row. `credit_purchase_id` is unique,
  -- so a second approval — a double click, a retried request, two admins —
  -- raises instead of crediting the wallet twice.
  insert into public.ad_wallet_entries (owner_uid, kind, amount, memo, reference, credit_purchase_id)
  values (
    v_row.uid,
    'topup',
    v_row.price_poisha,
    'bKash advertising credits',
    v_row.txn_id,
    v_row.id
  );

  select coalesce(sum(amount), 0)::integer into v_balance
    from public.ad_wallet_entries
   where owner_uid = v_row.uid;

  perform bsdc.notify_path(
    v_row.uid,
    v_uid,
    'payout'::bsdc_notification_kind,
    null,
    null,
    left('Your ' || v_row.credits || ' taka advertising credits are ready. Balance: ' || v_balance || ' poisha.', 280),
    null,
    '/ads'
  );

  return jsonb_build_object(
    'id', v_row.id,
    'status', 'approved',
    'balance_poisha', v_balance
  );
end;
$$;

comment on function public.decide_ad_credit_request(uuid, text, text) is
  'Staff approve or reject an advertising credit request. Rejection requires a reason. Approval credits the wallet exactly once.';

revoke all on function public.decide_ad_credit_request(uuid, text, text) from public, anon;
grant execute on function public.decide_ad_credit_request(uuid, text, text) to authenticated;

-- ------------------------------- the queues --------------------------------

create or replace function public.ad_credit_queue(p_status text default 'pending', p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
begin
  perform bsdc.mk_require_uid();
  perform bsdc.mk_require_staff_permission('advertising.review');

  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.created_at)
      from (
        select p.id, p.uid, pr.display_name, pr.username,
               p.credits, p.price_poisha, p.method, p.sender_number, p.txn_id,
               p.status, p.review_note, p.created_at,
               p.decided_at
          from public.ad_credit_purchases p
          left join public.profiles pr on pr.uid = p.uid
         where p.status = coalesce(nullif(btrim(p_status), ''), 'pending')
         order by p.created_at
         limit least(greatest(coalesce(p_limit, 100), 1), 200)
      ) x
  ), '[]'::jsonb);
end;
$$;

comment on function public.ad_credit_queue(text, integer) is
  'Staff review queue for advertising credit requests, newest last so the oldest is worked first.';

revoke all on function public.ad_credit_queue(text, integer) from public, anon;
grant execute on function public.ad_credit_queue(text, integer) to authenticated;

-- A member's own requests and their current wallet, in one call, so the
-- advertising page can render both without a second round trip.
create or replace function public.my_ad_credit_requests(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, bsdc, extensions, pg_temp
as $$
declare
  v_uid text := bsdc.current_uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'balance_poisha', coalesce((
      select sum(amount) from public.ad_wallet_entries where owner_uid = v_uid
    ), 0),
    'requests', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc)
        from (
          select p.id, p.credits, p.price_poisha, p.method, p.status,
                 p.review_note, p.created_at, p.decided_at
            from public.ad_credit_purchases p
           where p.uid = v_uid
           order by p.created_at desc
           limit least(greatest(coalesce(p_limit, 50), 1), 200)
        ) x
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.my_ad_credit_requests(integer) is
  'The signed-in advertiser''s wallet balance and their credit request history.';

revoke all on function public.my_ad_credit_requests(integer) from public, anon;
grant execute on function public.my_ad_credit_requests(integer) to authenticated;

-- --------------------------- the permission it needs -----------------------
--
-- `advertising.review` had to exist before `decide_ad_credit_request` could be
-- called by anybody. Granting it to the two roles that already moderate
-- advertising keeps the decision with the people making it today.

insert into public.role_permissions (role, permission) values
  ('owner', 'advertising.review'),
  ('admin', 'advertising.review')
on conflict do nothing;
