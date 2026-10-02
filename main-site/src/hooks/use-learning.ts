import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type {
  AnswerSheet,
  CertificateVerification,
  CourseLevel,
  CourseSummary,
  GradeResult,
  Lesson,
  QuizQuestion,
} from '@/lib/learning/learning-types';
import type { CertificateRow, CourseRow } from '@/lib/supabase/types';
import { useAuthStore } from '@/store/auth-store';

const repository = () => import('@/lib/learning/learning-repository');

export interface CatalogFilters {
  level: CourseLevel | null;
  tag: string | null;
}

export interface CatalogResult {
  courses: CourseSummary[];
  filters: CatalogFilters;
  setFilters: (next: CatalogFilters) => void;
  isLoading: boolean;
  isError: boolean;
}

/** The course catalogue, filtered in Postgres so the payload stays small. */
export function useCourseCatalog(): CatalogResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const [filters, setFilters] = useState<CatalogFilters>({ level: null, tag: null });

  const query = useQuery({
    queryKey: ['course-catalog', uid, filters.level, filters.tag],
    queryFn: async () => (await repository()).fetchCatalog(filters.level, filters.tag),
    staleTime: 60_000,
  });

  return {
    courses: query.data ?? [],
    filters,
    setFilters,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export interface CourseResult {
  course: CourseRow | null;
  lessons: Lesson[];
  quizId: string | null;
  maxAttempts: number;
  isLoading: boolean;
  isError: boolean;
  isEnrolled: boolean;
  enrol: () => Promise<void>;
  isEnrolling: boolean;
  complete: (lessonId: string, seconds?: number) => Promise<void>;
}

/**
 * One course with its outline. Enrolment state is inferred from the data the
 * database chose to return — a locked course comes back with empty bodies.
 */
export function useCourse(slug: string | undefined): CourseResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const queryKey = ['course', slug, uid];

  const query = useQuery({
    queryKey,
    queryFn: async () => (await repository()).fetchCourse(slug ?? ''),
    enabled: slug !== undefined && slug.length > 0,
    staleTime: 30_000,
  });

  const enrolMutation = useMutation({
    mutationFn: async (courseId: string) => (await repository()).enrol(courseId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['course-catalog'] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (input: { lessonId: string; seconds: number }) =>
      (await repository()).completeLesson(input.lessonId, input.seconds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['course-catalog'] });
    },
  });

  const detail = query.data ?? null;
  const lessons = detail?.lessons ?? [];
  const isEnrolled =
    uid !== null && lessons.some((lesson) => !lesson.isPreview && lesson.body.length > 0);

  return {
    course: detail?.course ?? null,
    lessons,
    quizId: detail?.quizId ?? null,
    maxAttempts: detail?.maxAttempts ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    isEnrolled,
    enrol: async () => {
      if (detail === null) return;
      await enrolMutation.mutateAsync(detail.course.id);
    },
    isEnrolling: enrolMutation.isPending,
    complete: async (lessonId, seconds = 0) => {
      await completeMutation.mutateAsync({ lessonId, seconds });
    },
  };
}

export interface QuizResult {
  questions: QuizQuestion[];
  isLoading: boolean;
  grade: (answers: AnswerSheet) => Promise<GradeResult>;
  isGrading: boolean;
  result: GradeResult | null;
}

/** A quiz paper plus the server's verdict. Nothing is marked in the browser. */
export function useQuiz(quizId: string | null): QuizResult {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<GradeResult | null>(null);

  const query = useQuery({
    queryKey: ['quiz-paper', quizId],
    queryFn: async () => (await repository()).fetchQuizPaper(quizId ?? ''),
    enabled: quizId !== null,
    staleTime: 300_000,
  });

  const mutation = useMutation({
    mutationFn: async (answers: AnswerSheet) =>
      (await repository()).gradeQuiz(quizId ?? '', answers),
    onSuccess: (verdict) => {
      setResult(verdict);
      void queryClient.invalidateQueries({ queryKey: ['certificates'] });
      void queryClient.invalidateQueries({ queryKey: ['course'] });
    },
  });

  return {
    questions: query.data ?? [],
    isLoading: query.isLoading,
    grade: (answers) => mutation.mutateAsync(answers),
    isGrading: mutation.isPending,
    result,
  };
}

export interface CertificatesResult {
  certificates: CertificateRow[];
  isLoading: boolean;
}

export function useMyCertificates(): CertificatesResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);

  const query = useQuery({
    queryKey: ['certificates', uid],
    queryFn: async () => (await repository()).fetchMyCertificates(uid ?? ''),
    enabled: uid !== null,
    staleTime: 300_000,
  });

  return { certificates: query.data ?? [], isLoading: query.isLoading };
}

export interface VerificationResult {
  certificate: CertificateVerification | null;
  isLoading: boolean;
  isError: boolean;
  notFound: boolean;
}

/** Public certificate verification: one code, one answer, no session needed. */
export function useCertificateVerification(code: string | undefined): VerificationResult {
  const query = useQuery({
    queryKey: ['verify-certificate', code],
    queryFn: async () => (await repository()).verifyCertificate(code ?? ''),
    enabled: code !== undefined && code.length > 0,
    staleTime: 300_000,
  });

  return {
    certificate: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    notFound: query.isSuccess && query.data === null,
  };
}
