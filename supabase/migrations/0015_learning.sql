-- ---------------------------------------------------------------------------
-- Learning: courses, modules, lessons, quizzes and certificates.
--
-- Two things are deliberately impossible from a browser here. A learner
-- cannot read which quiz option is correct (column privileges, not just row
-- policies), and a learner cannot award themselves a certificate: issuance
-- happens inside grade_quiz_attempt() only after the database has counted the
-- completed lessons and the passing score itself.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'bsdc_course_level') then
    create type bsdc_course_level as enum ('beginner', 'intermediate', 'advanced');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_course_status') then
    create type bsdc_course_status as enum ('draft', 'published', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_lesson_kind') then
    create type bsdc_lesson_kind as enum ('reading', 'video', 'exercise', 'quiz');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_enrollment_status') then
    create type bsdc_enrollment_status as enum ('active', 'completed', 'dropped');
  end if;
  if not exists (select 1 from pg_type where typname = 'bsdc_question_kind') then
    create type bsdc_question_kind as enum ('single', 'multiple', 'boolean');
  end if;
end;
$$;

-- ------------------------------- courses -----------------------------------
create table if not exists public.courses (
  id             uuid primary key default gen_random_uuid(),
  slug           citext not null unique
                   check (slug ~ '^[a-z0-9][a-z0-9-]{2,119}$'),
  title          text not null check (char_length(btrim(title)) between 3 and 140),
  summary        text not null default '' check (char_length(summary) <= 500),
  description    text not null default '' check (char_length(description) <= 20000),
  cover_url      text not null default '',
  level          bsdc_course_level not null default 'beginner',
  language       text not null default 'bn' check (language in ('bn', 'en')),
  tags           text[] not null default array[]::text[],
  outcomes       text[] not null default array[]::text[],
  prerequisites  text[] not null default array[]::text[],
  -- Minutes. Derived from the lessons by trigger; never written by a client.
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  lesson_count   integer not null default 0 check (lesson_count >= 0),
  enrolled_count integer not null default 0 check (enrolled_count >= 0),
  -- A pass mark of 70 means 70% of the quiz marks, not 70 marks.
  pass_mark      integer not null default 70 check (pass_mark between 1 and 100),
  grants_certificate boolean not null default true,
  instructor_uid text not null references public.profiles (uid) on delete cascade,
  status         bsdc_course_status not null default 'draft',
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint courses_tag_count
    check (array_length(tags, 1) is null or array_length(tags, 1) <= 12)
);

create index if not exists courses_published_idx
  on public.courses (status, published_at desc nulls last) where status = 'published';
create index if not exists courses_tags_idx on public.courses using gin (tags);
create index if not exists courses_instructor_idx on public.courses (instructor_uid);

drop trigger if exists courses_touch on public.courses;
create trigger courses_touch before update on public.courses
  for each row execute function bsdc.touch_updated_at();

-- ------------------------------- modules -----------------------------------
create table if not exists public.course_modules (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  title      text not null check (char_length(btrim(title)) between 2 and 140),
  summary    text not null default '' check (char_length(summary) <= 500),
  position   integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  unique (course_id, position)
);

create index if not exists course_modules_course_idx
  on public.course_modules (course_id, position);

-- ------------------------------- lessons -----------------------------------
create table if not exists public.lessons (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  module_id   uuid references public.course_modules (id) on delete set null,
  slug        citext not null check (slug ~ '^[a-z0-9][a-z0-9-]{2,119}$'),
  title       text not null check (char_length(btrim(title)) between 2 and 140),
  kind        bsdc_lesson_kind not null default 'reading',
  body        text not null default '' check (char_length(body) <= 60000),
  video_url   text not null default '',
  duration_minutes integer not null default 5 check (duration_minutes between 0 and 600),
  position    integer not null check (position >= 0),
  -- A free preview lesson is readable without enrolling.
  is_preview  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (course_id, slug),
  unique (course_id, position)
);

create index if not exists lessons_course_idx on public.lessons (course_id, position);

drop trigger if exists lessons_touch on public.lessons;
create trigger lessons_touch before update on public.lessons
  for each row execute function bsdc.touch_updated_at();

-- The course's advertised length and lesson count are derived, never typed in.
create or replace function bsdc.sync_course_totals()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_course uuid := coalesce(new.course_id, old.course_id);
begin
  update public.courses c
    set lesson_count = totals.count, duration_minutes = totals.minutes
    from (
      select count(*)::integer as count, coalesce(sum(duration_minutes), 0)::integer as minutes
      from public.lessons where course_id = v_course
    ) as totals
    where c.id = v_course;
  return null;
end;
$$;

drop trigger if exists lessons_sync_totals on public.lessons;
create trigger lessons_sync_totals after insert or update or delete on public.lessons
  for each row execute function bsdc.sync_course_totals();

-- ----------------------------- enrollments ---------------------------------
create table if not exists public.enrollments (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses (id) on delete cascade,
  uid          text not null references public.profiles (uid) on delete cascade,
  status       bsdc_enrollment_status not null default 'active',
  -- Percent of lessons completed. Maintained by trigger from lesson_progress.
  progress     integer not null default 0 check (progress between 0 and 100),
  last_lesson_id uuid references public.lessons (id) on delete set null,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (course_id, uid)
);

create index if not exists enrollments_uid_idx on public.enrollments (uid, updated_at desc);

drop trigger if exists enrollments_touch on public.enrollments;
create trigger enrollments_touch before update on public.enrollments
  for each row execute function bsdc.touch_updated_at();

create or replace function bsdc.sync_enrolled_count()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.courses set enrolled_count = enrolled_count + 1 where id = new.course_id;
  elsif tg_op = 'DELETE' then
    update public.courses
      set enrolled_count = greatest(enrolled_count - 1, 0) where id = old.course_id;
  end if;
  return null;
end;
$$;

drop trigger if exists enrollments_sync_count on public.enrollments;
create trigger enrollments_sync_count after insert or delete on public.enrollments
  for each row execute function bsdc.sync_enrolled_count();

-- --------------------------- lesson progress -------------------------------
create table if not exists public.lesson_progress (
  id           uuid primary key default gen_random_uuid(),
  lesson_id    uuid not null references public.lessons (id) on delete cascade,
  course_id    uuid not null references public.courses (id) on delete cascade,
  uid          text not null references public.profiles (uid) on delete cascade,
  seconds_spent integer not null default 0 check (seconds_spent >= 0),
  completed_at timestamptz not null default now(),
  unique (lesson_id, uid)
);

create index if not exists lesson_progress_course_idx
  on public.lesson_progress (course_id, uid);

-- Progress is a counted fact about rows, not a number the client sends.
create or replace function bsdc.sync_enrollment_progress()
returns trigger
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_course uuid := coalesce(new.course_id, old.course_id);
  v_uid    text := coalesce(new.uid, old.uid);
  v_total  integer;
  v_done   integer;
  v_pct    integer;
begin
  select lesson_count into v_total from public.courses where id = v_course;
  select count(*)::integer into v_done
    from public.lesson_progress where course_id = v_course and uid = v_uid;

  v_pct := case when coalesce(v_total, 0) = 0 then 0
                else least(100, (v_done * 100) / v_total) end;

  update public.enrollments
    set progress = v_pct,
        status = case when v_pct >= 100 then 'completed'::bsdc_enrollment_status
                      else status end,
        completed_at = case when v_pct >= 100 then coalesce(completed_at, now())
                            else null end,
        last_lesson_id = coalesce(new.lesson_id, last_lesson_id)
    where course_id = v_course and uid = v_uid;
  return null;
end;
$$;

drop trigger if exists lesson_progress_sync on public.lesson_progress;
create trigger lesson_progress_sync after insert or delete on public.lesson_progress
  for each row execute function bsdc.sync_enrollment_progress();

-- -------------------------------- quizzes ----------------------------------
create table if not exists public.quizzes (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  lesson_id   uuid references public.lessons (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 2 and 140),
  instructions text not null default '' check (char_length(instructions) <= 2000),
  time_limit_minutes integer check (time_limit_minutes is null or time_limit_minutes between 1 and 480),
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  created_at  timestamptz not null default now()
);

create index if not exists quizzes_course_idx on public.quizzes (course_id);

create table if not exists public.quiz_questions (
  id         uuid primary key default gen_random_uuid(),
  quiz_id    uuid not null references public.quizzes (id) on delete cascade,
  prompt     text not null check (char_length(btrim(prompt)) between 3 and 2000),
  kind       bsdc_question_kind not null default 'single',
  marks      integer not null default 1 check (marks between 1 and 100),
  explanation text not null default '' check (char_length(explanation) <= 2000),
  position   integer not null check (position >= 0),
  unique (quiz_id, position)
);

create index if not exists quiz_questions_quiz_idx on public.quiz_questions (quiz_id, position);

create table if not exists public.quiz_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  label       text not null check (char_length(btrim(label)) between 1 and 500),
  -- Never readable by a learner: see the column grants in 0016.
  is_correct  boolean not null default false,
  position    integer not null check (position >= 0),
  unique (question_id, position)
);

create index if not exists quiz_options_question_idx on public.quiz_options (question_id, position);

create table if not exists public.quiz_attempts (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references public.quizzes (id) on delete cascade,
  uid         text not null references public.profiles (uid) on delete cascade,
  score       integer not null default 0 check (score between 0 and 100),
  earned_marks integer not null default 0 check (earned_marks >= 0),
  total_marks integer not null default 0 check (total_marks >= 0),
  passed      boolean not null default false,
  answers     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists quiz_attempts_mine_idx
  on public.quiz_attempts (quiz_id, uid, created_at desc);

-- ----------------------------- certificates --------------------------------
create table if not exists public.certificates (
  id          uuid primary key default gen_random_uuid(),
  -- Printed on the certificate and typed into the public verifier.
  code        text not null unique check (code ~ '^BSDC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  course_id   uuid not null references public.courses (id) on delete cascade,
  uid         text not null references public.profiles (uid) on delete cascade,
  recipient_name text not null check (char_length(btrim(recipient_name)) between 1 and 120),
  course_title text not null check (char_length(btrim(course_title)) between 1 and 140),
  score       integer not null check (score between 0 and 100),
  issued_at   timestamptz not null default now(),
  revoked_at  timestamptz,
  revoke_reason text not null default '' check (char_length(revoke_reason) <= 500),
  unique (course_id, uid)
);

create index if not exists certificates_uid_idx on public.certificates (uid, issued_at desc);

-- A short code a human can read aloud: no ambiguous I, O, 0 or 1.
create or replace function bsdc.new_certificate_code()
returns text
language plpgsql
volatile
set search_path = public, bsdc, pg_temp
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code  text;
  v_try   integer := 0;
begin
  loop
    v_code := 'BSDC';
    for v_block in 1..3 loop
      v_code := v_code || '-';
      for v_char in 1..4 loop
        v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
      end loop;
    end loop;
    exit when not exists (select 1 from public.certificates where code = v_code);
    v_try := v_try + 1;
    if v_try > 20 then
      raise exception 'could not allocate a certificate code' using errcode = '55000';
    end if;
  end loop;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- enrolling, completing, grading, issuing
-- ---------------------------------------------------------------------------

create or replace function public.enroll_in_course(p_course_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid    text := bsdc.current_uid();
  v_status bsdc_course_status;
  v_id     uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select status into v_status from public.courses where id = p_course_id;
  if not found or v_status <> 'published' then
    raise exception 'this course is not open for enrolment' using errcode = 'P0002';
  end if;

  insert into public.enrollments (course_id, uid)
    values (p_course_id, v_uid)
    on conflict (course_id, uid) do update set status = 'active'
    returning id into v_id;
  return v_id;
end;
$$;

-- Completing a lesson is idempotent: replaying it never inflates progress.
create or replace function public.complete_lesson(
  p_lesson_id uuid,
  p_seconds   integer default 0
)
returns integer
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid     text := bsdc.current_uid();
  v_course  uuid;
  v_progress integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select course_id into v_course from public.lessons where id = p_lesson_id;
  if not found then
    raise exception 'lesson not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.enrollments where course_id = v_course and uid = v_uid
  ) then
    raise exception 'enrol in the course first' using errcode = '42501';
  end if;

  insert into public.lesson_progress (lesson_id, course_id, uid, seconds_spent)
    values (p_lesson_id, v_course, v_uid, greatest(coalesce(p_seconds, 0), 0))
    on conflict (lesson_id, uid)
    do update set seconds_spent = public.lesson_progress.seconds_spent
                                  + greatest(coalesce(p_seconds, 0), 0);

  select progress into v_progress
    from public.enrollments where course_id = v_course and uid = v_uid;
  return coalesce(v_progress, 0);
end;
$$;

-- Marking is done here, against rows the client is not allowed to read. The
-- answer payload is {question_id: [option_id, ...]}; a question scores its
-- marks only when the chosen set equals the correct set exactly.
create or replace function public.grade_quiz_attempt(
  p_quiz_id uuid,
  p_answers jsonb
)
returns table (
  score            integer,
  earned_marks     integer,
  total_marks      integer,
  passed           boolean,
  certificate_code text
)
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
declare
  v_uid      text := bsdc.current_uid();
  v_course   uuid;
  v_pass     integer;
  v_grants   boolean;
  v_attempts integer;
  v_max      integer;
  v_earned   integer := 0;
  v_total    integer := 0;
  v_score    integer := 0;
  v_passed   boolean := false;
  v_progress integer := 0;
  v_code     text := null;
  v_name     text;
  v_title    text;
  r          record;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select q.course_id, q.max_attempts, c.pass_mark, c.grants_certificate, c.title
    into v_course, v_max, v_pass, v_grants, v_title
    from public.quizzes q join public.courses c on c.id = q.course_id
    where q.id = p_quiz_id;
  if not found then
    raise exception 'quiz not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.enrollments where course_id = v_course and uid = v_uid
  ) then
    raise exception 'enrol in the course first' using errcode = '42501';
  end if;

  select count(*)::integer into v_attempts
    from public.quiz_attempts where quiz_id = p_quiz_id and uid = v_uid;
  if v_attempts >= v_max then
    raise exception 'no attempts remaining' using errcode = '42501';
  end if;

  for r in
    select
      qq.id,
      qq.marks,
      (
        select coalesce(array_agg(o.id order by o.id), array[]::uuid[])
        from public.quiz_options o where o.question_id = qq.id and o.is_correct
      ) as correct_ids
    from public.quiz_questions qq
    where qq.quiz_id = p_quiz_id
  loop
    v_total := v_total + r.marks;
    if (
      select coalesce(array_agg(value::uuid order by value::uuid), array[]::uuid[])
      from jsonb_array_elements_text(coalesce(p_answers -> r.id::text, '[]'::jsonb))
    ) = r.correct_ids then
      v_earned := v_earned + r.marks;
    end if;
  end loop;

  v_score := case when v_total = 0 then 0 else (v_earned * 100) / v_total end;
  v_passed := v_score >= v_pass;

  insert into public.quiz_attempts
      (quiz_id, uid, score, earned_marks, total_marks, passed, answers)
    values (p_quiz_id, v_uid, v_score, v_earned, v_total, v_passed, coalesce(p_answers, '{}'::jsonb));

  -- A certificate requires both a pass and a finished course. Neither fact is
  -- taken from the client.
  if v_passed and v_grants then
    select e.progress into v_progress
      from public.enrollments e where e.course_id = v_course and e.uid = v_uid;

    if coalesce(v_progress, 0) >= 100 then
      select coalesce(nullif(btrim(p.display_name), ''), p.username)
        into v_name from public.profiles p where p.uid = v_uid;

      insert into public.certificates
          (code, course_id, uid, recipient_name, course_title, score)
        values (bsdc.new_certificate_code(), v_course, v_uid,
                coalesce(v_name, 'BSDC member'), v_title, v_score)
        on conflict (course_id, uid) do nothing;

      select c.code into v_code
        from public.certificates c where c.course_id = v_course and c.uid = v_uid;
    end if;
  end if;

  return query select v_score, v_earned, v_total, v_passed, v_code;
end;
$$;

-- The catalogue in one round trip, with this member's own progress.
create or replace function public.course_catalog(
  p_limit integer default 40,
  p_level bsdc_course_level default null,
  p_tag   text default null
)
returns table (
  id               uuid,
  slug             text,
  title            text,
  summary          text,
  cover_url        text,
  level            bsdc_course_level,
  language         text,
  tags             text[],
  duration_minutes integer,
  lesson_count     integer,
  enrolled_count   integer,
  instructor_uid   text,
  my_progress      integer,
  my_status        bsdc_enrollment_status,
  has_certificate  boolean
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    c.id, c.slug::text, c.title, c.summary, c.cover_url, c.level, c.language, c.tags,
    c.duration_minutes, c.lesson_count, c.enrolled_count, c.instructor_uid,
    e.progress, e.status,
    exists (
      select 1 from public.certificates cert
      where cert.course_id = c.id and cert.uid = bsdc.current_uid()
        and cert.revoked_at is null
    )
  from public.courses c
  left join public.enrollments e on e.course_id = c.id and e.uid = bsdc.current_uid()
  where c.status = 'published'
    and (p_level is null or c.level = p_level)
    and (p_tag is null or c.tags @> array[lower(p_tag)])
  order by c.published_at desc nulls last
  limit greatest(1, least(p_limit, 100));
$$;

-- One course's whole outline, with this member's completion per lesson. The
-- body of a lesson is withheld unless it is a preview or the member enrolled.
create or replace function public.course_outline(p_slug text)
returns table (
  lesson_id        uuid,
  lesson_slug      text,
  title            text,
  kind             bsdc_lesson_kind,
  duration_minutes integer,
  position         integer,
  module_title     text,
  is_preview       boolean,
  body             text,
  completed        boolean
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    l.id, l.slug::text, l.title, l.kind, l.duration_minutes, l.position,
    coalesce(m.title, ''), l.is_preview,
    case
      when l.is_preview then l.body
      when exists (
        select 1 from public.enrollments e
        where e.course_id = c.id and e.uid = bsdc.current_uid()
      ) then l.body
      else ''
    end,
    exists (
      select 1 from public.lesson_progress lp
      where lp.lesson_id = l.id and lp.uid = bsdc.current_uid()
    )
  from public.lessons l
  join public.courses c on c.id = l.course_id
  left join public.course_modules m on m.id = l.module_id
  where c.slug = p_slug::citext and c.status = 'published'
  order by l.position;
$$;

-- A quiz as a learner may see it: prompts and options, never the answer key.
create or replace function public.quiz_paper(p_quiz_id uuid)
returns table (
  question_id uuid,
  prompt      text,
  kind        bsdc_question_kind,
  marks       integer,
  position    integer,
  option_id   uuid,
  label       text,
  option_position integer
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select qq.id, qq.prompt, qq.kind, qq.marks, qq.position, o.id, o.label, o.position
  from public.quiz_questions qq
  join public.quiz_options o on o.question_id = qq.id
  where qq.quiz_id = p_quiz_id
  order by qq.position, o.position;
$$;

-- Public verification. Deliberately returns no uid, no email and no score for
-- a revoked certificate: enough to confirm a claim, nothing more.
create or replace function public.verify_certificate(p_code text)
returns table (
  code           text,
  recipient_name text,
  course_title   text,
  course_slug    text,
  score          integer,
  issued_at      timestamptz,
  revoked        boolean
)
language sql
stable
security definer
set search_path = public, bsdc, pg_temp
as $$
  select
    cert.code, cert.recipient_name, cert.course_title, c.slug::text,
    case when cert.revoked_at is null then cert.score else 0 end,
    cert.issued_at,
    cert.revoked_at is not null
  from public.certificates cert
  join public.courses c on c.id = cert.course_id
  where cert.code = upper(btrim(p_code));
$$;

create or replace function public.revoke_certificate(p_code text, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public, bsdc, pg_temp
as $$
begin
  if not bsdc.is_staff() then
    raise exception 'only staff may revoke a certificate' using errcode = '42501';
  end if;
  update public.certificates
    set revoked_at = now(), revoke_reason = coalesce(p_reason, '')
    where code = upper(btrim(p_code));
end;
$$;
