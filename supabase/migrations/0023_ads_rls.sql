-- ---------------------------------------------------------------------------
-- Row level security for advertising.
--
-- An advertiser owns the words and the destination. They do not own the
-- counting, the charging, or the decision to go live: events, stats and the
-- wallet have no write policy for anybody, and `status` and `spent` are
-- revoked at column level so the only way to change them is a function that
-- re-checks the rules.
-- ---------------------------------------------------------------------------

alter table public.ad_campaigns      enable row level security;
alter table public.ad_creatives      enable row level security;
alter table public.ad_wallet_entries enable row level security;
alter table public.ad_events         enable row level security;
alter table public.ad_daily_stats    enable row level security;

-- ------------------------------ campaigns ----------------------------------
drop policy if exists ad_campaigns_read_own on public.ad_campaigns;
create policy ad_campaigns_read_own on public.ad_campaigns
  for select using (owner_uid = bsdc.current_uid() or bsdc.is_staff());

-- Insert goes through create_campaign(), which stamps the owner; a direct
-- insert is still allowed but can only ever name yourself as the owner.
drop policy if exists ad_campaigns_insert_own on public.ad_campaigns;
create policy ad_campaigns_insert_own on public.ad_campaigns
  for insert with check (owner_uid = bsdc.current_uid() and status = 'draft');

-- A draft may be edited freely. Once it has been submitted, the text is
-- frozen until a reviewer has had their say.
drop policy if exists ad_campaigns_update_draft on public.ad_campaigns;
create policy ad_campaigns_update_draft on public.ad_campaigns
  for update using (owner_uid = bsdc.current_uid() and status in ('draft', 'rejected'))
  with check (owner_uid = bsdc.current_uid());

drop policy if exists ad_campaigns_delete_draft on public.ad_campaigns;
create policy ad_campaigns_delete_draft on public.ad_campaigns
  for delete using (owner_uid = bsdc.current_uid() and status in ('draft', 'rejected'));

-- ------------------------------ creatives ----------------------------------
drop policy if exists ad_creatives_read_own on public.ad_creatives;
create policy ad_creatives_read_own on public.ad_creatives
  for select using (
    exists (
      select 1 from public.ad_campaigns a
      where a.id = campaign_id and (a.owner_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  );

drop policy if exists ad_creatives_write_own on public.ad_creatives;
create policy ad_creatives_write_own on public.ad_creatives
  for update using (
    exists (
      select 1 from public.ad_campaigns a
      where a.id = campaign_id and a.owner_uid = bsdc.current_uid()
    )
  )
  with check (
    exists (
      select 1 from public.ad_campaigns a
      where a.id = campaign_id and a.owner_uid = bsdc.current_uid()
    )
  );

drop policy if exists ad_creatives_delete_own on public.ad_creatives;
create policy ad_creatives_delete_own on public.ad_creatives
  for delete using (
    exists (
      select 1 from public.ad_campaigns a
      where a.id = campaign_id and a.owner_uid = bsdc.current_uid()
        and a.status in ('draft', 'rejected', 'paused')
    )
  );

-- No insert policy: add_creative() is the only door, because adding a
-- creative to a live campaign must also send that campaign back for review.

-- -------------------------------- wallet -----------------------------------
drop policy if exists ad_wallet_read_own on public.ad_wallet_entries;
create policy ad_wallet_read_own on public.ad_wallet_entries
  for select using (owner_uid = bsdc.current_uid() or bsdc.is_staff());

-- No insert, update or delete policy at all. Credits come from staff through
-- topup_ad_wallet(); debits are written by record_ad_event() as the definer.

-- -------------------------- events and statistics --------------------------
-- An advertiser may read the counts for their own campaigns and nothing else.
-- Nobody may write a count: that is record_ad_event()'s job alone, which is
-- what makes an impression a measurement rather than a claim.
drop policy if exists ad_events_read_own on public.ad_events;
create policy ad_events_read_own on public.ad_events
  for select using (
    exists (
      select 1 from public.ad_campaigns a
      where a.id = campaign_id and (a.owner_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  );

drop policy if exists ad_daily_stats_read_own on public.ad_daily_stats;
create policy ad_daily_stats_read_own on public.ad_daily_stats
  for select using (
    exists (
      select 1 from public.ad_campaigns a
      where a.id = campaign_id and (a.owner_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  );

-- ---------------------------------------------------------------------------
-- Column privileges
-- ---------------------------------------------------------------------------
-- Going live, spending and the reviewer's note are not the advertiser's to
-- write, even on a draft they otherwise own.
revoke update (status, spent, owner_uid, review_note, created_at)
  on public.ad_campaigns from authenticated;
revoke insert (status, spent, owner_uid) on public.ad_campaigns from authenticated;
revoke insert, update, delete on public.ad_wallet_entries from anon, authenticated;
revoke insert, update, delete on public.ad_events from anon, authenticated;
revoke insert, update, delete on public.ad_daily_stats from anon, authenticated;
revoke insert on public.ad_creatives from anon, authenticated;

grant select, insert, update, delete on public.ad_campaigns to authenticated;
grant select, update, delete on public.ad_creatives to authenticated;
grant select on public.ad_wallet_entries, public.ad_events, public.ad_daily_stats
  to authenticated;

-- Serving is granted to anonymous readers too: an ad on a public page must
-- render for a guest, and the function returns no commercial detail.
grant execute on function public.serve_ads(bsdc_ad_placement, integer) to anon, authenticated;
grant execute on function public.record_ad_event(uuid, bsdc_ad_event_kind) to anon, authenticated;

grant execute on function public.create_campaign(
  text, bsdc_ad_pricing, integer, integer, integer, timestamptz, timestamptz,
  text[], text[], text
) to authenticated;
grant execute on function public.add_creative(
  uuid, bsdc_ad_placement, text, text, text, text, text
) to authenticated;
grant execute on function public.submit_campaign(uuid) to authenticated;
grant execute on function public.decide_campaign(uuid, boolean, text) to authenticated;
grant execute on function public.set_campaign_paused(uuid, boolean) to authenticated;
grant execute on function public.topup_ad_wallet(text, integer, text) to authenticated;
grant execute on function public.ad_wallet_balance() to authenticated;
grant execute on function public.ad_wallet_history(integer) to authenticated;
grant execute on function public.my_campaigns(integer) to authenticated;
grant execute on function public.campaign_creatives(uuid) to authenticated;
grant execute on function public.campaign_daily(uuid, integer) to authenticated;
