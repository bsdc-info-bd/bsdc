import { Award, CheckCircle2, Circle, Lock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { MarkdownView } from '@/components/content/MarkdownView';
import { Seo } from '@/components/seo/Seo';
import {
  AccordionItem,
  Alert,
  Badge,
  Button,
  Card,
  Chip,
  PageSkeleton,
  ProgressBar,
  SectionHeading,
} from '@/design-system';
import { useCourse, useQuiz } from '@/hooks/use-learning';
import {
  courseProgress,
  formatDuration,
  groupLessonsByModule,
  isAnswerSheetComplete,
  nextLesson,
  remainingMinutes,
  toggleAnswer,
  type AnswerSheet,
} from '@/lib/learning/learning-types';
import { formatNumber } from '@/lib/format';
import { certificatePath, coursePath, ROUTES, SITE } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

/** One course: outline, lesson reader, and the quiz that is marked server-side. */
export default function CoursePage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);

  const course = useCourse(slug);
  const quiz = useQuiz(course.quizId);
  const [openLessonId, setOpenLessonId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerSheet>({});

  const groups = useMemo(() => groupLessonsByModule(course.lessons), [course.lessons]);
  const progress = courseProgress(course.lessons);
  const upNext = nextLesson(course.lessons);
  const remaining = remainingMinutes(course.lessons);
  const openLesson = course.lessons.find((lesson) => lesson.id === openLessonId) ?? null;
  const ready = isAnswerSheetComplete(quiz.questions, answers);

  async function join() {
    try {
      await course.enrol();
      toast.success(t('learn.enrolled'));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  async function markComplete(lessonId: string) {
    try {
      await course.complete(lessonId);
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  async function submitQuiz() {
    try {
      const verdict = await quiz.grade(answers);
      if (verdict.passed) {
        toast.success(t('learn.quizPassed', { score: verdict.score }));
      } else {
        toast.error(t('learn.quizFailed', { score: verdict.score }));
      }
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  if (course.isLoading) {
    return (
      <div className="fab-container py-10">
        <PageSkeleton label={t('common.loading')} />
      </div>
    );
  }

  if (course.isError || course.course === null) {
    return (
      <div className="fab-container py-10">
        <Alert tone="danger" title={t('learn.notFound')}>
          <Link to={ROUTES.learn} className="fab-link">
            {t('learn.backToCatalog')}
          </Link>
        </Alert>
      </div>
    );
  }

  const record = course.course;
  const courseJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: record.title,
    description: record.summary,
    inLanguage: record.language,
    url: new URL(coursePath(record.slug), SITE.url).toString(),
    educationalLevel: record.level,
    timeRequired: `PT${String(Math.max(record.duration_minutes, 1))}M`,
    provider: { '@type': 'Organization', name: SITE.name, url: SITE.url },
    hasCourseInstance: [
      {
        '@type': 'CourseInstance',
        courseMode: 'online',
        courseWorkload: `PT${String(Math.max(record.duration_minutes, 1))}M`,
      },
    ],
  };

  return (
    <>
      <Seo
        title={`${record.title} — ${t('learn.title')}`}
        description={record.summary.length > 0 ? record.summary : t('learn.metaDescription')}
        path={coursePath(record.slug)}
        type="article"
        jsonLd={[courseJsonLd]}
      />

      <div className="fab-container py-6 sm:py-10">
        <SectionHeading title={record.title} description={record.summary} />

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge tone="neutral">{t(`learn.levels.${record.level}`)}</Badge>
          <span>
            {t('learn.lessonCount', { total: formatNumber(record.lesson_count, language) })}
          </span>
          <span>{formatDuration(record.duration_minutes, language)}</span>
          <span>{t('learn.passMark', { mark: record.pass_mark })}</span>
          {record.grants_certificate ? <Badge tone="green">{t('learn.certificate')}</Badge> : null}
        </div>

        {record.tags.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1">
            {record.tags.map((tag) => (
              <li key={tag}>
                <Chip>{tag}</Chip>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div>
            {record.description.length > 0 ? (
              <Card>
                <MarkdownView markdown={record.description} />
              </Card>
            ) : null}

            <section className="mt-4" aria-labelledby="course-outline">
              <h2 id="course-outline" className="text-lg font-semibold">
                {t('learn.outline')}
              </h2>
              <Card className="mt-2" padded={false}>
                {groups.map((group) => (
                  <AccordionItem
                    key={group.title.length > 0 ? group.title : 'ungrouped'}
                    title={`${group.title.length > 0 ? group.title : t('learn.lessons')} · ${formatDuration(group.minutes, language)}`}
                    defaultOpen
                    className="px-4"
                  >
                    <ul className="pb-2">
                      {group.lessons.map((lesson) => {
                        const locked = lesson.body.length === 0 && !lesson.isPreview;
                        return (
                          <li
                            key={lesson.id}
                            className="flex items-center gap-2 border-b border-border py-2 last:border-0"
                          >
                            {lesson.completed ? (
                              <CheckCircle2
                                size={16}
                                className="text-green-700"
                                aria-hidden="true"
                              />
                            ) : (
                              <Circle size={16} className="text-muted" aria-hidden="true" />
                            )}
                            <button
                              type="button"
                              disabled={locked}
                              className="fab-tap min-w-0 flex-1 text-start text-sm disabled:cursor-not-allowed disabled:text-muted"
                              onClick={() => {
                                setOpenLessonId(lesson.id);
                              }}
                            >
                              <span className="fab-truncate block">{lesson.title}</span>
                              <span className="block text-2xs text-muted">
                                {t(`learn.kinds.${lesson.kind}`)} ·{' '}
                                {formatDuration(lesson.durationMinutes, language)}
                              </span>
                            </button>
                            {lesson.isPreview ? (
                              <Badge tone="neutral">{t('learn.preview')}</Badge>
                            ) : null}
                            {locked ? (
                              <Lock size={14} className="text-muted" aria-hidden="true" />
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </AccordionItem>
                ))}
              </Card>
            </section>

            {openLesson !== null && openLesson.body.length > 0 ? (
              <section className="mt-4" aria-labelledby="lesson-reader">
                <h2 id="lesson-reader" className="text-lg font-semibold">
                  {openLesson.title}
                </h2>
                <Card className="mt-2">
                  <MarkdownView markdown={openLesson.body} />
                  {!openLesson.completed && course.isEnrolled ? (
                    <Button
                      className="mt-4"
                      onClick={() => {
                        void markComplete(openLesson.id);
                      }}
                    >
                      {t('learn.markComplete')}
                    </Button>
                  ) : null}
                </Card>
              </section>
            ) : null}

            {course.quizId !== null && course.isEnrolled ? (
              <section className="mt-6" aria-labelledby="course-quiz">
                <h2 id="course-quiz" className="text-lg font-semibold">
                  {t('learn.quiz')}
                </h2>
                <p className="mt-1 text-sm text-muted">{t('learn.quizHint')}</p>

                <Card className="mt-2">
                  <ol className="grid gap-4">
                    {quiz.questions.map((question, index) => (
                      <li key={question.id}>
                        <p className="text-sm font-semibold">
                          {formatNumber(index + 1, language)}. {question.prompt}
                        </p>
                        <p className="text-2xs text-muted">
                          {t('learn.marks', { total: question.marks })} ·{' '}
                          {t(`learn.questionKinds.${question.kind}`)}
                        </p>
                        <ul className="mt-2 grid gap-1">
                          {question.options.map((option) => {
                            const chosen = (answers[question.id] ?? []).includes(option.id);
                            return (
                              <li key={option.id}>
                                <label className="fab-tap flex items-center gap-2 text-sm">
                                  <input
                                    type={question.kind === 'multiple' ? 'checkbox' : 'radio'}
                                    name={question.id}
                                    checked={chosen}
                                    onChange={() => {
                                      setAnswers((current) =>
                                        toggleAnswer(current, question, option.id),
                                      );
                                    }}
                                  />
                                  <span>{option.label}</span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    ))}
                  </ol>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                      disabled={!ready || quiz.isGrading}
                      onClick={() => {
                        void submitQuiz();
                      }}
                    >
                      {t('learn.submitQuiz')}
                    </Button>
                    <span className="text-xs text-muted">
                      {t('learn.attemptsAllowed', { total: course.maxAttempts })}
                    </span>
                  </div>

                  {quiz.result !== null ? (
                    <Alert
                      tone={quiz.result.passed ? 'success' : 'warning'}
                      title={t('learn.scoreLabel', { score: quiz.result.score })}
                      className="mt-4"
                    >
                      <p>
                        {t('learn.marksEarned', {
                          earned: quiz.result.earnedMarks,
                          total: quiz.result.totalMarks,
                        })}
                      </p>
                      {quiz.result.certificateCode !== null ? (
                        <p className="mt-1">
                          <Link
                            to={certificatePath(quiz.result.certificateCode)}
                            className="fab-link"
                          >
                            {t('learn.viewCertificate')}
                          </Link>
                        </p>
                      ) : null}
                    </Alert>
                  ) : null}
                </Card>
              </section>
            ) : null}
          </div>

          <aside>
            <Card>
              <ProgressBar
                value={progress}
                label={t('learn.progressLabel', { percent: progress })}
              />
              <p className="mt-2 text-sm">{t('learn.progressLabel', { percent: progress })}</p>
              {remaining > 0 ? (
                <p className="text-xs text-muted">
                  {t('learn.remaining', { duration: formatDuration(remaining, language) })}
                </p>
              ) : null}

              {!isSignedIn ? (
                <p className="mt-3 text-sm text-muted">{t('learn.signInToEnrol')}</p>
              ) : course.isEnrolled ? (
                upNext !== null ? (
                  <Button
                    className="mt-3 w-full"
                    onClick={() => {
                      setOpenLessonId(upNext.id);
                    }}
                  >
                    {t('learn.continue')}
                  </Button>
                ) : (
                  <p className="mt-3 flex items-center gap-2 text-sm">
                    <Award size={16} aria-hidden="true" />
                    {t('learn.courseComplete')}
                  </p>
                )
              ) : (
                <Button
                  className="mt-3 w-full"
                  disabled={course.isEnrolling}
                  onClick={() => {
                    void join();
                  }}
                >
                  {t('learn.enrol')}
                </Button>
              )}
            </Card>

            {record.outcomes.length > 0 ? (
              <Card className="mt-3">
                <h2 className="text-sm font-semibold">{t('learn.outcomes')}</h2>
                <ul className="mt-2 grid gap-1 text-sm text-muted">
                  {record.outcomes.map((outcome) => (
                    <li key={outcome}>{outcome}</li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {record.prerequisites.length > 0 ? (
              <Card className="mt-3">
                <h2 className="text-sm font-semibold">{t('learn.prerequisites')}</h2>
                <ul className="mt-2 grid gap-1 text-sm text-muted">
                  {record.prerequisites.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  );
}
