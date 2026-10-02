-- ---------------------------------------------------------------------------
-- Row level security for the SEO engine and the branding studio.
--
-- Metadata is public by definition — it is what the site tells crawlers — so
-- the reading functions are security definer and anybody may call them. The
-- tables behind them are not public: a visitor may ask what one path says,
-- and may not download the editorial queue, the hit counters on retired URLs
-- or a palette that has not been approved yet.
-- ---------------------------------------------------------------------------

alter table public.seo_overrides enable row level security;
alter table public.redirects     enable row level security;
alter table public.brand_themes  enable row level security;

-- --------------------------- seo_overrides ---------------------------------
drop policy if exists seo_overrides_read on public.seo_overrides;
create policy seo_overrides_read on public.seo_overrides
  for select using (bsdc.has_permission('seo.manage'));

-- Written only through set_seo_override / clear_seo_override, so the path is
-- normalised, the text is clipped to what a search result shows and the
-- change is audited in the same transaction.
revoke insert, update, delete on public.seo_overrides from anon, authenticated;

-- ------------------------------ redirects ----------------------------------
drop policy if exists redirects_read on public.redirects;
create policy redirects_read on public.redirects
  for select using (bsdc.has_permission('seo.manage'));

revoke insert, update, delete on public.redirects from anon, authenticated;

-- ---------------------------- brand_themes ---------------------------------
-- Staff who may manage branding see every draft palette. Everybody else sees
-- the live theme only as CSS, through brand_theme_css().
drop policy if exists brand_themes_read on public.brand_themes;
create policy brand_themes_read on public.brand_themes
  for select using (bsdc.has_permission('brand.manage'));

revoke insert, update, delete on public.brand_themes from anon, authenticated;

-- ------------------------------ functions ----------------------------------
-- The public doors: one path's metadata, the sitemap, the live palette and
-- the redirect lookup the edge performs before it serves a 404. None of them
-- accepts a filter that could turn it into a listing of private rows.
grant execute on function public.seo_for_path(text) to anon, authenticated;
grant execute on function public.sitemap_urls(text, integer, integer) to anon, authenticated;
grant execute on function public.sitemap_sections(integer) to anon, authenticated;
grant execute on function public.brand_theme_css() to anon, authenticated;
grant execute on function public.brand_contrast(text, text) to anon, authenticated;
grant execute on function public.follow_redirect(text) to anon, authenticated;

-- The editing doors check the permission inside the function, in the same
-- transaction as the write, so a direct PostgREST call is no shortcut.
grant execute on function public.set_seo_override(
  text, text, text, text, text, text, text, numeric, text) to authenticated;
grant execute on function public.clear_seo_override(text) to authenticated;
grant execute on function public.set_redirect(text, text, smallint, text) to authenticated;
grant execute on function public.remove_redirect(text) to authenticated;
grant execute on function public.save_brand_theme(text, text, jsonb) to authenticated;
grant execute on function public.activate_brand_theme(text) to authenticated;

revoke execute on function public.set_seo_override(
  text, text, text, text, text, text, text, numeric, text) from anon;
revoke execute on function public.clear_seo_override(text) from anon;
revoke execute on function public.set_redirect(text, text, smallint, text) from anon;
revoke execute on function public.remove_redirect(text) from anon;
revoke execute on function public.save_brand_theme(text, text, jsonb) from anon;
revoke execute on function public.activate_brand_theme(text) from anon;
