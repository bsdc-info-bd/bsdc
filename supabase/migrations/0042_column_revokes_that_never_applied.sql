-- ---------------------------------------------------------------------------
-- Column revokes that never worked, because the table-level grant overrode
-- them.
--
-- Postgres privilege rule: a table-level GRANT covers every column, and a
-- column-level REVOKE cannot subtract from it. Twelve migrations tried to
-- protect a column with
--
--   revoke update (likes_count) on public.comments from authenticated;
--
-- after granting
--
--   grant insert, update, delete on public.comments to authenticated;
--
-- so the revoke did nothing at all: whoever could UPDATE the row could still
-- write the counter. That left every denormalised number the platform shows
-- forgeable with one PostgREST PATCH from any signed-in member — a page owner
-- could set `pages.followers_count` to a million, a vendor could inflate
-- `products.sold_count`, a commenter could rewrite `comments.likes_count`,
-- and so on for jobs, gigs, projects, events, courses, enrollments, shops,
-- orders, ads, page ordering and notices.
--
-- The fix is the shape 0002/0004 already use for `profiles` and `posts` and
-- 0038 re-applied to `profiles`: revoke the table-level privilege and grant
-- back every column the member is still allowed to write. Each section below
-- names the columns that stay server-owned; every other column keeps exactly
-- the privilege it had before, so no client write changes behaviour.
--
--   * comments      — counters, thread bookkeeping (depth/root_id), the
--                     accepted-answer flag, and the post/author identity of
--                     an existing comment.
--   * pages         — follower count and the staff-only verified badge.
--   * events        — the RSVP count.
--   * jobs          — application and view counters.
--   * gigs          — proposal counter.
--   * projects      — star counter.
--   * enrollments   — lesson progress, completion state and timestamp, all
--                     owned by complete_lesson().
--   * courses       — lesson/enrolment counters and the derived duration.
--   * products      — review aggregates, the sold count, and stock/status/
--                     published_at, which move through restock_product() and
--                     publish_product() so the shelf and the sold count can
--                     never disagree.
--   * shops         — rating aggregates, order counter, commission, approval
--                     and status: platform-owned.
--   * orders        — totals, coupon, buyer, shop, and the status/timestamps
--                     that advance_order() owns.
--   * ad_campaigns  — spend, review note, status and owner.
--   * page_sections — `position`, which the ordering function owns.
--   * notices       — code, status and publication fields.
--
-- `id`, `created_at` and `updated_at` are not re-granted either: the primary
-- key is immutable, `created_at` is set once by its default, and
-- `updated_at` is written by the `bsdc.touch_updated_at()` trigger, which
-- runs as a BEFORE trigger and needs no column privilege. Generated columns
-- (`search_vector`) are excluded for the same reason — the database computes
-- them.
--
-- Re-running is safe: REVOKE of a privilege that is absent is a no-op, and
-- GRANT of one that is present is a no-op.
-- ---------------------------------------------------------------------------

-- ------------------------------- content -----------------------------------

-- Counters, thread bookkeeping and the answer flag are trigger/RPC owned.
revoke update on public.comments from authenticated;
grant update (
  parent_id, body, status, edited_at
) on public.comments to authenticated;

-- ----------------------------- communities ---------------------------------

revoke update on public.pages from authenticated;
grant update (
  slug, name, category, about, avatar_url, cover_url, website, owner_uid
) on public.pages to authenticated;

revoke update on public.events from authenticated;
grant update (
  slug, title, description, mode, venue, city, join_url, cover_url,
  starts_at, ends_at, timezone, capacity, host_uid, group_id, page_id,
  is_cancelled
) on public.events to authenticated;

-- ---------------------------- opportunities --------------------------------

revoke update on public.jobs from authenticated;
grant update (
  slug, title, company, company_page_id, description, job_type, work_mode,
  level, city, country, salary_min, salary_max, salary_currency,
  salary_period, skills, apply_url, status, poster_uid, expires_at,
  published_at
) on public.jobs to authenticated;

revoke update on public.gigs from authenticated;
grant update (
  slug, title, description, budget_min, budget_max, currency, is_hourly,
  duration_days, skills, status, client_uid, published_at
) on public.gigs to authenticated;

revoke update on public.projects from authenticated;
grant update (
  slug, name, tagline, description, repo_url, demo_url, cover_url, tech,
  license, looking_for_contributors, owner_uid
) on public.projects to authenticated;

-- ------------------------------- learning ----------------------------------

revoke update on public.enrollments from authenticated;
grant update (
  course_id, uid, last_lesson_id
) on public.enrollments to authenticated;

revoke update on public.courses from authenticated;
grant update (
  slug, title, summary, description, cover_url, level, language, tags,
  outcomes, prerequisites, pass_mark, grants_certificate, instructor_uid,
  status, published_at
) on public.courses to authenticated;

-- ------------------------------ marketplace --------------------------------

revoke update on public.products from authenticated;
grant update (
  shop_id, slug, title, summary, description, images, category, tags, price,
  price_original, currency, is_digital, max_per_order
) on public.products to authenticated;

revoke update on public.shops from authenticated;
grant update (
  slug, name, tagline, about, logo_url, city, shipping_flat,
  free_shipping_over, suspension_reason
) on public.shops to authenticated;

revoke update on public.orders from authenticated;
grant update (
  payment_method, currency, recipient, phone, address_line, city, note,
  confirmed_at, cancelled_at, cancel_reason
) on public.orders to authenticated;

-- ---------------------------------- ads ------------------------------------

revoke update on public.ad_campaigns from authenticated;
grant update (
  name, pricing, bid, daily_budget, total_budget, starts_at, ends_at,
  target_cities, target_topics, target_language
) on public.ad_campaigns to authenticated;

-- ------------------------------- corporate ---------------------------------

revoke update on public.page_sections from authenticated;
grant update (
  page_id, kind, payload, is_visible
) on public.page_sections to authenticated;

revoke update on public.notices from authenticated;
grant update (
  title, summary, body, category, audience, priority, pinned, requires_ack,
  expires_at, created_by
) on public.notices to authenticated;
