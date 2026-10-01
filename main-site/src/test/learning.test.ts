import { describe, expect, it } from 'vitest';
import {
  courseProgress,
  formatDuration,
  groupLessonsByModule,
  isAnswerSheetComplete,
  isCertificateCode,
  isPassing,
  nextLesson,
  normaliseCertificateCode,
  remainingMinutes,
  toggleAnswer,
  type AnswerSheet,
  type Lesson,
  type QuizQuestion,
} from '@/lib/learning/learning-types';

function lesson(partial: Partial<Lesson> & { id: string; position: number }): Lesson {
  return {
    slug: partial.id,
    title: `Lesson ${partial.id}`,
    kind: 'reading',
    durationMinutes: 10,
    moduleTitle: 'Basics',
    isPreview: false,
    body: 'content',
    completed: false,
    ...partial,
  };
}

const question: QuizQuestion = {
  id: 'q1',
  prompt: 'Which statements are true?',
  kind: 'single',
  marks: 2,
  options: [
    { id: 'o1', label: 'One' },
    { id: 'o2', label: 'Two' },
  ],
};

describe('courseProgress', () => {
  it('is zero for a course with no lessons rather than NaN', () => {
    expect(courseProgress([])).toBe(0);
  });

  it('counts completed lessons and never rounds up a part-finished course', () => {
    const lessons = [
      lesson({ id: 'a', position: 0, completed: true }),
      lesson({ id: 'b', position: 1 }),
      lesson({ id: 'c', position: 2 }),
    ];
    expect(courseProgress(lessons)).toBe(33);
  });

  it('reaches one hundred only when every lesson is done', () => {
    const lessons = [
      lesson({ id: 'a', position: 0, completed: true }),
      lesson({ id: 'b', position: 1, completed: true }),
    ];
    expect(courseProgress(lessons)).toBe(100);
  });
});

describe('nextLesson and remainingMinutes', () => {
  const lessons = [
    lesson({ id: 'a', position: 0, completed: true, durationMinutes: 15 }),
    lesson({ id: 'b', position: 1, durationMinutes: 20 }),
    lesson({ id: 'c', position: 2, durationMinutes: 25 }),
  ];

  it('points at the first unfinished lesson', () => {
    expect(nextLesson(lessons)?.id).toBe('b');
  });

  it('returns nothing once the course is finished', () => {
    expect(nextLesson([lesson({ id: 'a', position: 0, completed: true })])).toBeNull();
  });

  it('counts only the minutes still to do', () => {
    expect(remainingMinutes(lessons)).toBe(45);
  });
});

describe('formatDuration', () => {
  it('stays in minutes below an hour', () => {
    expect(formatDuration(45, 'en')).toBe('45 min');
  });

  it('drops the minutes on a whole hour', () => {
    expect(formatDuration(120, 'en')).toBe('2 hr');
  });

  it('keeps both parts otherwise', () => {
    expect(formatDuration(95, 'en')).toBe('1 hr 35 min');
  });

  it('uses Bengali digits in Bengali', () => {
    expect(formatDuration(45, 'bn')).toContain('মিনিট');
    expect(formatDuration(45, 'bn')).not.toContain('45');
  });
});

describe('groupLessonsByModule', () => {
  it('keeps module order and sums each module length', () => {
    const groups = groupLessonsByModule([
      lesson({ id: 'b', position: 1, moduleTitle: 'Basics', durationMinutes: 10 }),
      lesson({ id: 'c', position: 2, moduleTitle: 'Advanced', durationMinutes: 30 }),
      lesson({ id: 'a', position: 0, moduleTitle: 'Basics', durationMinutes: 5 }),
    ]);
    expect(groups.map((group) => group.title)).toEqual(['Basics', 'Advanced']);
    expect(groups[0]?.lessons.map((item) => item.id)).toEqual(['a', 'b']);
    expect(groups[0]?.minutes).toBe(15);
    expect(groups[1]?.minutes).toBe(30);
  });
});

describe('isPassing', () => {
  it('passes exactly at the mark and fails one below it', () => {
    expect(isPassing(70, 70)).toBe(true);
    expect(isPassing(69, 70)).toBe(false);
  });
});

describe('answer sheets', () => {
  it('refuses an empty paper', () => {
    expect(isAnswerSheetComplete([], {})).toBe(false);
  });

  it('requires every question to be answered', () => {
    const second: QuizQuestion = { ...question, id: 'q2' };
    const answers: AnswerSheet = { q1: ['o1'] };
    expect(isAnswerSheetComplete([question, second], answers)).toBe(false);
    expect(isAnswerSheetComplete([question, second], { ...answers, q2: ['o2'] })).toBe(true);
  });

  it('replaces the choice on a single-answer question', () => {
    const first = toggleAnswer({}, question, 'o1');
    const second = toggleAnswer(first, question, 'o2');
    expect(second['q1']).toEqual(['o2']);
  });

  it('deselects when the same single answer is tapped twice', () => {
    const chosen = toggleAnswer({}, question, 'o1');
    expect(toggleAnswer(chosen, question, 'o1')['q1']).toEqual([]);
  });

  it('accumulates choices on a multiple-answer question', () => {
    const multi: QuizQuestion = { ...question, kind: 'multiple' };
    const first = toggleAnswer({}, multi, 'o1');
    const both = toggleAnswer(first, multi, 'o2');
    expect(both['q1']).toEqual(['o1', 'o2']);
    expect(toggleAnswer(both, multi, 'o1')['q1']).toEqual(['o2']);
  });
});

describe('certificate codes', () => {
  it('forgives case and surrounding space', () => {
    expect(normaliseCertificateCode('  bsdc-ab12-cd34-ef56 ')).toBe('BSDC-AB12-CD34-EF56');
  });

  it('accepts the printed format and rejects anything else', () => {
    expect(isCertificateCode('bsdc-ab12-cd34-ef56')).toBe(true);
    expect(isCertificateCode('BSDC-AB12-CD34')).toBe(false);
    expect(isCertificateCode('ABCD-AB12-CD34-EF56')).toBe(false);
    expect(isCertificateCode('')).toBe(false);
  });
});
