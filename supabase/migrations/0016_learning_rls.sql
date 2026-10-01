-- ---------------------------------------------------------------------------
-- Row level security for the learning module.
--
-- The important line in this file is the column privilege on
-- quiz_options.is_correct: row policies alone cannot hide a column, so the
-- answer key is revoked outright and only the security-definer grader reads
-- it. A learner also cannot write their own progress percentage, score or
-- certificate — those columns and tables are closed to direct writes.
-- ---------------------------------------------------------------------------

alter table public.courses         enable row level security;
alter table public.course_modules  enable row level security;
alter table public.lessons         enable row level security;
alter table public.enrollments     enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.quizzes         enable row level security;
alter table public.quiz_questions  enable row level security;
alter table public.quiz_options    enable row level security;
alter table public.quiz_attempts   enable row level security;
alter table public.certificates    enable row level security;

-- ------------------------------- courses -----------------------------------
drop policy if exists courses_read_published on public.courses;
create policy courses_read_published on public.courses
  for select using (
    status = 'published' or instructor_uid = bsdc.current_uid() or bsdc.is_staff()
  );

drop policy if exists courses_insert_own on public.courses;
create policy courses_insert_own on public.courses
  for insert with check (instructor_uid = bsdc.current_uid());

drop policy if exists courses_update_own on public.courses;
create policy courses_update_own on public.courses
  for update using (instructor_uid = bsdc.current_uid() or bsdc.is_staff())
  with check (instructor_uid = bsdc.current_uid() or bsdc.is_staff());

drop policy if exists courses_delete_own on public.courses;
create policy courses_delete_own on public.courses
  for delete using (instructor_uid = bsdc.current_uid() or bsdc.is_staff());

-- --------------------------- modules and lessons ----------------------------
drop policy if exists course_modules_read on public.course_modules;
create policy course_modules_read on public.course_modules
  for select using (
    exists (
      select 1 from public.courses c
      where c.id = course_id
        and (c.status = 'published' or c.instructor_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  );

drop policy if exists course_modules_write on public.course_modules;
create policy course_modules_write on public.course_modules
  for all using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and (c.instructor_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  )
  with check (
    exists (
      select 1 from public.courses c
      where c.id = course_id and (c.instructor_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  );

-- A lesson row is listable for any published course; its body is withheld by
-- course_outline() unless the lesson is a preview or the member enrolled.
drop policy if exists lessons_read on public.lessons;
create policy lessons_read on public.lessons
  for select using (
    exists (
      select 1 from public.courses c
      where c.id = course_id
        and (c.status = 'published' or c.instructor_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  );

drop policy if exists lessons_write on public.lessons;
create policy lessons_write on public.lessons
  for all using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and (c.instructor_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  )
  with check (
    exists (
      select 1 from public.courses c
      where c.id = course_id and (c.instructor_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  );

-- ------------------------------ enrollments ---------------------------------
-- A learner sees their own enrolment; an instructor sees their course roster.
drop policy if exists enrollments_read_own on public.enrollments;
create policy enrollments_read_own on public.enrollments
  for select using (
    uid = bsdc.current_uid()
    or exists (
      select 1 from public.courses c
      where c.id = course_id and c.instructor_uid = bsdc.current_uid()
    )
    or bsdc.is_staff()
  );

-- Enrolling goes through public.enroll_in_course(); leaving is the member's own.
drop policy if exists enrollments_update_own on public.enrollments;
create policy enrollments_update_own on public.enrollments
  for update using (uid = bsdc.current_uid())
  with check (uid = bsdc.current_uid());

drop policy if exists enrollments_delete_own on public.enrollments;
create policy enrollments_delete_own on public.enrollments
  for delete using (uid = bsdc.current_uid() or bsdc.is_staff());

-- --------------------------- lesson progress --------------------------------
drop policy if exists lesson_progress_read_own on public.lesson_progress;
create policy lesson_progress_read_own on public.lesson_progress
  for select using (
    uid = bsdc.current_uid()
    or exists (
      select 1 from public.courses c
      where c.id = course_id and c.instructor_uid = bsdc.current_uid()
    )
    or bsdc.is_staff()
  );

-- Completion is recorded by public.complete_lesson() only: there is no insert
-- policy, so a learner cannot tick off a lesson of a course they never joined.

-- ------------------------------- quizzes ------------------------------------
drop policy if exists quizzes_read on public.quizzes;
create policy quizzes_read on public.quizzes
  for select using (
    exists (
      select 1 from public.courses c
      where c.id = course_id
        and (c.status = 'published' or c.instructor_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  );

drop policy if exists quizzes_write on public.quizzes;
create policy quizzes_write on public.quizzes
  for all using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and (c.instructor_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  )
  with check (
    exists (
      select 1 from public.courses c
      where c.id = course_id and (c.instructor_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  );

drop policy if exists quiz_questions_read on public.quiz_questions;
create policy quiz_questions_read on public.quiz_questions
  for select using (
    exists (
      select 1 from public.quizzes q join public.courses c on c.id = q.course_id
      where q.id = quiz_id
        and (c.status = 'published' or c.instructor_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  );

drop policy if exists quiz_questions_write on public.quiz_questions;
create policy quiz_questions_write on public.quiz_questions
  for all using (
    exists (
      select 1 from public.quizzes q join public.courses c on c.id = q.course_id
      where q.id = quiz_id and (c.instructor_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  )
  with check (
    exists (
      select 1 from public.quizzes q join public.courses c on c.id = q.course_id
      where q.id = quiz_id and (c.instructor_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  );

drop policy if exists quiz_options_read on public.quiz_options;
create policy quiz_options_read on public.quiz_options
  for select using (
    exists (
      select 1
      from public.quiz_questions qq
      join public.quizzes q on q.id = qq.quiz_id
      join public.courses c on c.id = q.course_id
      where qq.id = question_id
        and (c.status = 'published' or c.instructor_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  );

drop policy if exists quiz_options_write on public.quiz_options;
create policy quiz_options_write on public.quiz_options
  for all using (
    exists (
      select 1
      from public.quiz_questions qq
      join public.quizzes q on q.id = qq.quiz_id
      join public.courses c on c.id = q.course_id
      where qq.id = question_id and (c.instructor_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  )
  with check (
    exists (
      select 1
      from public.quiz_questions qq
      join public.quizzes q on q.id = qq.quiz_id
      join public.courses c on c.id = q.course_id
      where qq.id = question_id and (c.instructor_uid = bsdc.current_uid() or bsdc.is_staff())
    )
  );

-- Attempts belong to the learner and to the instructor marking the cohort.
drop policy if exists quiz_attempts_read_own on public.quiz_attempts;
create policy quiz_attempts_read_own on public.quiz_attempts
  for select using (
    uid = bsdc.current_uid()
    or exists (
      select 1 from public.quizzes q join public.courses c on c.id = q.course_id
      where q.id = quiz_id and c.instructor_uid = bsdc.current_uid()
    )
    or bsdc.is_staff()
  );

-- No insert policy: grading happens in public.grade_quiz_attempt().

-- ----------------------------- certificates ---------------------------------
-- A certificate is readable by its holder, the instructor and staff. Everyone
-- else verifies one code at a time through public.verify_certificate(), which
-- exposes a name, a course and a date — never a uid or an email.
drop policy if exists certificates_read_own on public.certificates;
create policy certificates_read_own on public.certificates
  for select using (
    uid = bsdc.current_uid()
    or exists (
      select 1 from public.courses c
      where c.id = course_id and c.instructor_uid = bsdc.current_uid()
    )
    or bsdc.is_staff()
  );

-- No insert, update or delete policy at all: issuance and revocation are
-- RPC-only, so a certificate cannot be minted or quietly edited by a client.

-- ---------------------------------------------------------------------------
-- Column privileges: the parts a client must never write, and the one column
-- it must never read.
-- ---------------------------------------------------------------------------

revoke update (progress, status, completed_at) on public.enrollments from authenticated;
revoke update (lesson_count, duration_minutes, enrolled_count) on public.courses from authenticated;

-- The answer key. Hidden from both anonymous and signed-in clients; the
-- grader reads it as the definer, never the caller.
revoke select (is_correct) on public.quiz_options from anon, authenticated;
revoke insert (is_correct), update (is_correct) on public.quiz_options from anon;

grant select on public.courses, public.course_modules, public.lessons to anon, authenticated;
grant select on public.quizzes, public.quiz_questions to anon, authenticated;
grant select (id, question_id, label, position) on public.quiz_options to anon, authenticated;
grant select on public.enrollments, public.lesson_progress, public.quiz_attempts,
  public.certificates to authenticated;

grant insert, update, delete on public.courses, public.course_modules, public.lessons,
  public.quizzes, public.quiz_questions, public.quiz_options to authenticated;
grant update, delete on public.enrollments to authenticated;

grant execute on function public.enroll_in_course(uuid) to authenticated;
grant execute on function public.complete_lesson(uuid, integer) to authenticated;
grant execute on function public.grade_quiz_attempt(uuid, jsonb) to authenticated;
grant execute on function public.revoke_certificate(text, text) to authenticated;
grant execute on function public.course_catalog(integer, bsdc_course_level, text)
  to anon, authenticated;
grant execute on function public.course_outline(text) to anon, authenticated;
grant execute on function public.quiz_paper(uuid) to anon, authenticated;
grant execute on function public.verify_certificate(text) to anon, authenticated;
