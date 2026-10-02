import type {
  DbCourseLevel,
  DbEnrollmentStatus,
  DbLessonKind,
  DbQuestionKind,
} from '@/lib/supabase/types';

export type CourseLevel = DbCourseLevel;
export type LessonKind = DbLessonKind;
export type EnrollmentStatus = DbEnrollmentStatus;
export type QuestionKind = DbQuestionKind;

export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverUrl: string;
  level: CourseLevel;
  language: string;
  tags: string[];
  durationMinutes: number;
  lessonCount: number;
  enrolledCount: number;
  instructorUid: string;
  myProgress: number | null;
  myStatus: EnrollmentStatus | null;
  hasCertificate: boolean;
}

export interface Lesson {
  id: string;
  slug: string;
  title: string;
  kind: LessonKind;
  durationMinutes: number;
  position: number;
  moduleTitle: string;
  isPreview: boolean;
  body: string;
  completed: boolean;
}

export interface LessonGroup {
  title: string;
  lessons: Lesson[];
  minutes: number;
}

export interface QuizOption {
  id: string;
  label: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  kind: QuestionKind;
  marks: number;
  options: QuizOption[];
}

export interface GradeResult {
  score: number;
  earnedMarks: number;
  totalMarks: number;
  passed: boolean;
  certificateCode: string | null;
}

export interface CertificateVerification {
  code: string;
  recipientName: string;
  courseTitle: string;
  courseSlug: string;
  score: number;
  issuedAt: string;
  revoked: boolean;
}

/** Answers as the grader expects them: question id to chosen option ids. */
export type AnswerSheet = Record<string, string[]>;

/**
 * Percentage of a course finished, counted from lessons rather than taken on
 * trust. Mirrors the trigger in Postgres so the bar and the database agree.
 */
export function courseProgress(lessons: readonly Lesson[]): number {
  if (lessons.length === 0) return 0;
  const done = lessons.filter((lesson) => lesson.completed).length;
  return Math.min(100, Math.floor((done * 100) / lessons.length));
}

/** The first unfinished lesson — where "Continue" should take a learner. */
export function nextLesson(lessons: readonly Lesson[]): Lesson | null {
  return lessons.find((lesson) => !lesson.completed) ?? null;
}

/** Minutes still to watch or read, ignoring what is already complete. */
export function remainingMinutes(lessons: readonly Lesson[]): number {
  return lessons
    .filter((lesson) => !lesson.completed)
    .reduce((total, lesson) => total + lesson.durationMinutes, 0);
}

/**
 * Human duration without inventing precision: under an hour stays in
 * minutes, an exact hour drops the minutes entirely.
 */
export function formatDuration(minutes: number, language: 'bn' | 'en'): string {
  const safe = Math.max(0, Math.round(minutes));
  const digits = (value: number): string =>
    new Intl.NumberFormat(language === 'bn' ? 'bn-BD' : 'en-US').format(value);

  if (safe < 60) {
    return language === 'bn' ? `${digits(safe)} মিনিট` : `${digits(safe)} min`;
  }
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (rest === 0) {
    return language === 'bn' ? `${digits(hours)} ঘণ্টা` : `${digits(hours)} hr`;
  }
  return language === 'bn'
    ? `${digits(hours)} ঘণ্টা ${digits(rest)} মিনিট`
    : `${digits(hours)} hr ${digits(rest)} min`;
}

/** Lessons grouped under their module, in the order the author set. */
export function groupLessonsByModule(lessons: readonly Lesson[]): LessonGroup[] {
  const groups: LessonGroup[] = [];
  for (const lesson of [...lessons].sort((a, b) => a.position - b.position)) {
    const title = lesson.moduleTitle;
    const last = groups.at(-1);
    if (last !== undefined && last.title === title) {
      last.lessons.push(lesson);
      last.minutes += lesson.durationMinutes;
    } else {
      groups.push({ title, lessons: [lesson], minutes: lesson.durationMinutes });
    }
  }
  return groups;
}

/** True once the score reaches the course's pass mark. Never rounded up. */
export function isPassing(score: number, passMark: number): boolean {
  return score >= passMark;
}

/**
 * A quiz is only answerable when every question has a selection, and a
 * single-answer question has exactly one. Checked here so the Submit button
 * cannot send a half-finished paper the grader would mark as wrong.
 */
export function isAnswerSheetComplete(
  questions: readonly QuizQuestion[],
  answers: AnswerSheet,
): boolean {
  if (questions.length === 0) return false;
  return questions.every((question) => {
    const chosen = answers[question.id] ?? [];
    if (chosen.length === 0) return false;
    if (question.kind === 'multiple') return true;
    return chosen.length === 1;
  });
}

/** Toggle an option, respecting whether the question allows several answers. */
export function toggleAnswer(
  answers: AnswerSheet,
  question: QuizQuestion,
  optionId: string,
): AnswerSheet {
  const chosen = answers[question.id] ?? [];
  if (question.kind === 'multiple') {
    const next = chosen.includes(optionId)
      ? chosen.filter((id) => id !== optionId)
      : [...chosen, optionId];
    return { ...answers, [question.id]: next };
  }
  return { ...answers, [question.id]: chosen.includes(optionId) ? [] : [optionId] };
}

/** Certificate codes are printed uppercase; typed ones are forgiven. */
export function normaliseCertificateCode(code: string): string {
  return code.trim().toUpperCase();
}

const CODE_PATTERN = /^BSDC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** Mirrors the database check constraint, so a typo never reaches the server. */
export function isCertificateCode(code: string): boolean {
  return CODE_PATTERN.test(normaliseCertificateCode(code));
}
