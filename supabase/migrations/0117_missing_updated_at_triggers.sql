-- 0117: the five tables whose updated_at never advanced.
--
-- 41 tables carry `updated_at`; 40 touch triggers maintained it. The five below
-- were created with the column and its `default now()` and nothing else, so the
-- value was written once at insert and then stayed true-looking forever. That is
-- worse than having no column: a reader — the audit screen, a future bug hunt, an
-- operator checking whether a package price change took effect — sees a timestamp
-- and believes it.
--
-- Each of these is genuinely updated in place:
--
--   mk_cart_items        the quantity changes every time somebody edits a basket
--   mk_settings          the marketplace's own configuration row
--   mk_credit_packages   the admin package-price editor writes here
--   admin_saved_macros   a saved console macro is edited after it is created
--   topic_affinity       the feed's interest scores are re-weighted as you read
--
-- The shared helper already exists (`bsdc.touch_updated_at`, 0001), so this adds
-- no new function and no new behaviour beyond the timestamp itself.

-- Written as plain statements rather than a DO loop for a reason worth stating:
-- the launch audit greps this directory for `create trigger ... before update on`,
-- and a trigger built by `execute format()` inside a block is invisible to it. A
-- check that cannot see the fix reports the bug as still present, and teaching the
-- check to parse PL/pgSQL would be a much larger change than writing five lines.
--
-- `drop ... if exists` first makes each one idempotent.

drop trigger if exists topic_affinity_touch on public.topic_affinity;
create trigger topic_affinity_touch before update on public.topic_affinity
  for each row execute function bsdc.touch_updated_at();

drop trigger if exists admin_saved_macros_touch on public.admin_saved_macros;
create trigger admin_saved_macros_touch before update on public.admin_saved_macros
  for each row execute function bsdc.touch_updated_at();

drop trigger if exists mk_settings_touch on public.mk_settings;
create trigger mk_settings_touch before update on public.mk_settings
  for each row execute function bsdc.touch_updated_at();

-- The admin package-price editor writes this table. Before this trigger, saving a
-- new 10/50/100 price left `updated_at` reading as the moment the row was seeded,
-- so the console could not tell an edited price from an original one.
drop trigger if exists mk_credit_packages_touch on public.mk_credit_packages;
create trigger mk_credit_packages_touch before update on public.mk_credit_packages
  for each row execute function bsdc.touch_updated_at();

-- A basket line's quantity changes every time somebody edits their cart; the
-- timestamp is what makes a stale basket diagnosable at all.
drop trigger if exists mk_cart_items_touch on public.mk_cart_items;
create trigger mk_cart_items_touch before update on public.mk_cart_items
  for each row execute function bsdc.touch_updated_at();

-- Nothing above rewrites a row: this migration only installs the triggers.
