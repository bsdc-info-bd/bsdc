import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type {
  CertificateRow,
  CertificateVerificationRow,
  CourseCatalogRow,
  CourseOutlineRow,
  CourseRow,
  GradeResultRow,
  QuizPaperRow,
  QuizRow,
} from '@/lib/supabase/types';
import { normaliseCertificateCode } from './learning-types';
import type {
  AnswerSheet,
  CertificateVerification,
  CourseLevel,
  CourseSummary,
  GradeResult,
  Lesson,
  QuizQuestion,
} from './learning-types';

function toCourse(row: CourseCatalogRow): CourseSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    coverUrl: row.cover_url,
    level: row.level,
    language: row.language,
    tags: row.tags,
    durationMinutes: row.duration_minutes,
    lessonCount: row.lesson_count,
    enrolledCount: row.enrolled_count,
    instructorUid: row.instructor_uid,
    myProgress: row.my_progress,
    myStatus: row.my_status,
    hasCertificate: row.has_certificate,
  };
}

export async function fetchCatalog(
  level: CourseLevel | null = null,
  tag: string | null = null,
  limit = 40,
): Promise<CourseSummary[]> {
  const { data, error } = await getSupabase()
    .rpc('course_catalog', { p_limit: limit, p_level: level, p_tag: tag })
    .returns<CourseCatalogRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toCourse);
}

export interface CourseDetail {
  course: CourseRow;
  lessons: Lesson[];
  quizId: string | null;
  maxAttempts: number;
}

/**
 * A course page in three reads: the course record, its outline (bodies
 * withheld by the database unless the lesson is a preview or the member
 * enrolled) and the quiz header.
 */
export async function fetchCourse(slug: string): Promise<CourseDetail | null> {
  const supabase = getSupabase();

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle<CourseRow>();
  if (courseError) throw toDataError(courseError);
  if (course === null) return null;

  const [{ data: outline, error: outlineError }, { data: quiz, error: quizError }] =
    await Promise.all([
      supabase.rpc('course_outline', { p_slug: slug }).returns<CourseOutlineRow[]>(),
      supabase
        .from('quizzes')
        .select('*')
        .eq('course_id', course.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle<QuizRow>(),
    ]);
  if (outlineError) throw toDataError(outlineError);
  if (quizError) throw toDataError(quizError);

  const lessons: Lesson[] = (outline ?? []).map((row) => ({
    id: row.lesson_id,
    slug: row.lesson_slug,
    title: row.title,
    kind: row.kind,
    durationMinutes: row.duration_minutes,
    position: row.position,
    moduleTitle: row.module_title,
    isPreview: row.is_preview,
    body: row.body,
    completed: row.completed,
  }));

  return {
    course,
    lessons,
    quizId: quiz?.id ?? null,
    maxAttempts: quiz?.max_attempts ?? 0,
  };
}

export async function enrol(courseId: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('enroll_in_course', { p_course_id: courseId });
  if (error) throw toDataError(error);
  return typeof data === 'string' ? data : '';
}

/** Returns the course progress percentage the database recomputed. */
export async function completeLesson(lessonId: string, seconds = 0): Promise<number> {
  const { data, error } = await getSupabase().rpc('complete_lesson', {
    p_lesson_id: lessonId,
    p_seconds: seconds,
  });
  if (error) throw toDataError(error);
  return typeof data === 'number' ? data : 0;
}

/** The paper as a learner may see it: prompts and options, no answer key. */
export async function fetchQuizPaper(quizId: string): Promise<QuizQuestion[]> {
  const { data, error } = await getSupabase()
    .rpc('quiz_paper', { p_quiz_id: quizId })
    .returns<QuizPaperRow[]>();
  if (error) throw toDataError(error);

  const questions = new Map<string, QuizQuestion>();
  for (const row of data ?? []) {
    const existing = questions.get(row.question_id);
    if (existing === undefined) {
      questions.set(row.question_id, {
        id: row.question_id,
        prompt: row.prompt,
        kind: row.kind,
        marks: row.marks,
        options: [{ id: row.option_id, label: row.label }],
      });
    } else {
      existing.options.push({ id: row.option_id, label: row.label });
    }
  }
  return [...questions.values()];
}

/** Marking happens in Postgres; this only carries the answers and the verdict. */
export async function gradeQuiz(quizId: string, answers: AnswerSheet): Promise<GradeResult> {
  const { data, error } = await getSupabase()
    .rpc('grade_quiz_attempt', { p_quiz_id: quizId, p_answers: answers })
    .returns<GradeResultRow[]>();
  if (error) throw toDataError(error);

  const row = (data ?? [])[0];
  if (row === undefined) {
    return { score: 0, earnedMarks: 0, totalMarks: 0, passed: false, certificateCode: null };
  }
  return {
    score: row.score,
    earnedMarks: row.earned_marks,
    totalMarks: row.total_marks,
    passed: row.passed,
    certificateCode: row.certificate_code,
  };
}

export async function fetchMyCertificates(uid: string): Promise<CertificateRow[]> {
  const { data, error } = await getSupabase()
    .from('certificates')
    .select('*')
    .eq('uid', uid)
    .order('issued_at', { ascending: false })
    .returns<CertificateRow[]>();
  if (error) throw toDataError(error);
  return data ?? [];
}

/** Public verification by code. Returns null when no such certificate exists. */
export async function verifyCertificate(code: string): Promise<CertificateVerification | null> {
  const { data, error } = await getSupabase()
    .rpc('verify_certificate', { p_code: normaliseCertificateCode(code) })
    .returns<CertificateVerificationRow[]>();
  if (error) throw toDataError(error);

  const row = (data ?? [])[0];
  if (row === undefined) return null;
  return {
    code: row.code,
    recipientName: row.recipient_name,
    courseTitle: row.course_title,
    courseSlug: row.course_slug,
    score: row.score,
    issuedAt: row.issued_at,
    revoked: row.revoked,
  };
}
