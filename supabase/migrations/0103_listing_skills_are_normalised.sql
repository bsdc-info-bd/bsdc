-- 0103: skills on jobs and gigs are stored in one canonical form.
--
-- Job search matches a skill with `skills @> array[lower(p_skill)]`, so a skill
-- stored as "React" could never be found by the "react" filter. Writes did not
-- normalise, so such listings were invisible under the skill filter. This adds
-- one normaliser (trim, lower-case, collapse inner spaces, drop empties,
-- de-duplicate, sort), applies it to every insert and to every change of
-- `skills`, and backfills existing rows. Idempotent.

create or replace function bsdc.normalise_skills(p_skills text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array(
    select distinct s
      from (
        select lower(btrim(regexp_replace(x, '\s+', ' ', 'g'))) as s
          from unnest(coalesce(p_skills, array[]::text[])) as x
      ) t
     where s <> ''
     order by s
  ), array[]::text[]);
$$;

create or replace function bsdc.normalise_listing_skills()
returns trigger
language plpgsql
as $$
begin
  new.skills := bsdc.normalise_skills(new.skills);
  return new;
end;
$$;

drop trigger if exists jobs_normalise_skills on public.jobs;
create trigger jobs_normalise_skills
  before insert or update of skills on public.jobs
  for each row execute function bsdc.normalise_listing_skills();

drop trigger if exists gigs_normalise_skills on public.gigs;
create trigger gigs_normalise_skills
  before insert or update of skills on public.gigs
  for each row execute function bsdc.normalise_listing_skills();

update public.jobs set skills = bsdc.normalise_skills(skills)
 where skills is distinct from bsdc.normalise_skills(skills);

update public.gigs set skills = bsdc.normalise_skills(skills)
 where skills is distinct from bsdc.normalise_skills(skills);
