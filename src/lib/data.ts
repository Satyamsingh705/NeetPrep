import { AttemptStatus, Prisma, QuestionType, TestMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getQuestionTable } from "@/lib/question-content";
import { evaluateAttempt, getInitialAnswerState, getPaletteStatus, normalizeStoredAnswer } from "@/lib/neet";
import { getSubjectLabel } from "@/lib/subject-categories";
import type { QuestionOption, QuestionPayload, StoredAnswersMap } from "@/lib/types";

function isDatabaseUnavailableError(error: unknown) {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P1001")
    || error instanceof Prisma.PrismaClientInitializationError
  );
}

function normalizeQuestion(question: {
  question: {
    id: string;
    subject: Prisma.JsonValue | string;
    chapter: string;
    type: QuestionType;
    prompt: string | null;
    metadata: Prisma.JsonValue;
    imagePath: string | null;
    options: Prisma.JsonValue;
    correctAnswers: Prisma.JsonValue;
    answerPolicy: Prisma.JsonValue | string;
  };
  orderIndex: number;
  section: string;
}) {
  return {
    id: question.question.id,
    subject: question.question.subject,
    chapter: question.question.chapter,
    section: question.section,
    orderIndex: question.orderIndex,
    type: question.question.type,
    prompt: question.question.prompt,
    table: getQuestionTable(question.question.metadata),
    imagePath: question.question.imagePath,
    options: (question.question.options as QuestionOption[] | null) ?? null,
    correctAnswers: (question.question.correctAnswers as string[]).filter(Boolean),
    answerPolicy: question.question.answerPolicy,
  } as QuestionPayload;
}

export async function getDashboardData() {
  try {
    const [tests, questions, attempts, totalQuestions] = await Promise.all([
      prisma.test.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { attempts: true, testQuestions: true } } } }),
      prisma.question.groupBy({ by: ["subject"], _count: { _all: true } }),
      prisma.attempt.findMany({ orderBy: { startedAt: "desc" }, take: 8, include: { test: true } }),
      prisma.question.count(),
    ]);

    const normalizedQuestions = Array.from(
      questions.reduce((groups, group) => {
        const subject = getSubjectLabel(group.subject);
        const current = groups.get(subject) ?? { subject, _count: { _all: 0 } };
        current._count._all += group._count._all;
        groups.set(subject, current);
        return groups;
      }, new Map<string, { subject: string; _count: { _all: number } }>()).values(),
    );

    return { tests, questions: normalizedQuestions, attempts, totalQuestions };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return { tests: [], questions: [], attempts: [], totalQuestions: 0 };
    }

    throw error;
  }
}

export async function getStudentHomeSummary() {
  try {
    const summary = await prisma.test.aggregate({
      where: {
        published: true,
      },
      _sum: {
        totalQuestions: true,
      },
    });

    return { totalQuestions: summary._sum.totalQuestions ?? 0 };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return { totalQuestions: 0 };
    }

    throw error;
  }
}

export async function getQuestionBankSummary() {
  try {
    const [total, grouped, chapters] = await Promise.all([
      prisma.question.count(),
      prisma.question.groupBy({ by: ["subject", "type"], _count: { _all: true } }),
      prisma.question.findMany({ select: { subject: true, chapter: true }, distinct: ["subject", "chapter"], orderBy: [{ subject: "asc" }, { chapter: "asc" }] }),
    ]);

    const normalizedGrouped = Array.from(
      grouped.reduce((groups, group) => {
        const subject = getSubjectLabel(group.subject);
        const key = `${subject}-${group.type}`;
        const current = groups.get(key) ?? { subject, type: group.type, _count: { _all: 0 } };
        current._count._all += group._count._all;
        groups.set(key, current);
        return groups;
      }, new Map<string, { subject: string; type: QuestionType; _count: { _all: number } }>()).values(),
    );

    const normalizedChapters = Array.from(
      chapters.reduce((items, chapter) => {
        const subject = getSubjectLabel(chapter.subject);
        const key = `${subject}-${chapter.chapter}`;

        if (!items.has(key)) {
          items.set(key, { subject, chapter: chapter.chapter });
        }

        return items;
      }, new Map<string, { subject: string; chapter: string }>()).values(),
    );

    return { total, grouped: normalizedGrouped, chapters: normalizedChapters };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return { total: 0, grouped: [], chapters: [] };
    }

    throw error;
  }
}

export async function getStudentsForAdmin() {
  try {
    return await prisma.student.findMany({
      where: {
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            attempts: true,
          },
        },
      },
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return [];
    }

    throw error;
  }
}

export async function getTestSeriesGroupsWithDocuments() {
  try {
    return await prisma.testSeriesGroup.findMany({
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
      include: {
        documents: {
          orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        },
      },
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return [];
    }

    throw error;
  }
}

export async function getUngroupedTestSeriesDocuments() {
  try {
    return await prisma.testSeriesDocument.findMany({
      where: { groupId: null },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return [];
    }

    throw error;
  }
}

export async function getStudentAttemptCount(studentId: string) {
  try {
    return await prisma.attempt.count({
      where: {
        studentId,
      },
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return 0;
    }

    throw error;
  }
}

export async function getTestsForListing(studentId?: string, options?: { includeUnpublished?: boolean }) {
  try {
    const tests = await prisma.test.findMany({
      where: options?.includeUnpublished ? undefined : { published: true },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { attempts: true } },
        attempts: studentId
          ? {
              where: { studentId },
              select: { id: true },
            }
          : false,
        testQuestions: {
          distinct: ["subject", "chapter"],
          select: {
            subject: true,
            chapter: true,
          },
        },
      },
    });

    return tests.map((test) => ({
      ...test,
      studentAttemptCount: studentId ? test.attempts.length : test._count.attempts,
    }));
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return [];
    }

    throw error;
  }
}

export async function getStudentAnalytics(studentId: string) {
  try {
    const attempts = await prisma.attempt.findMany({
      where: {
        studentId,
        status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED] },
        result: { not: Prisma.JsonNull },
      },
      orderBy: { submittedAt: "desc" },
      include: { test: true },
    });

  const parsedAttempts = attempts.map((attempt) => {
    const result = attempt.result as {
      score: number;
      summary: { accuracy: number; correct: number; incorrect: number; attempted: number };
      subjectWise: Array<{ subject: string; score: number; accuracy: number }>;
    };

    return {
      id: attempt.id,
      testId: attempt.test.id,
      testName: attempt.test.name,
      testCode: attempt.test.testCode,
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      score: result.score,
      accuracy: result.summary.accuracy,
      correct: result.summary.correct,
      incorrect: result.summary.incorrect,
      attempted: result.summary.attempted,
      subjectWise: result.subjectWise.map((subject) => ({
        ...subject,
        subject: getSubjectLabel(subject.subject),
      })),
    };
  });

  const totalSubmitted = parsedAttempts.length;
  const bestScore = parsedAttempts.reduce((best, attempt) => Math.max(best, attempt.score), 0);
  const averageScore = totalSubmitted > 0 ? Math.round(parsedAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / totalSubmitted) : 0;
  const averageAccuracy = totalSubmitted > 0 ? Math.round(parsedAttempts.reduce((sum, attempt) => sum + attempt.accuracy, 0) / totalSubmitted) : 0;

  const subjectTotals = new Map<string, { score: number; accuracy: number; count: number }>();

  for (const attempt of parsedAttempts) {
    for (const subject of attempt.subjectWise) {
      const current = subjectTotals.get(subject.subject) ?? { score: 0, accuracy: 0, count: 0 };
      subjectTotals.set(subject.subject, {
        score: current.score + subject.score,
        accuracy: current.accuracy + subject.accuracy,
        count: current.count + 1,
      });
    }
  }

  const subjectAverages = Array.from(subjectTotals.entries()).map(([subject, totals]) => ({
    subject,
    averageScore: Math.round(totals.score / totals.count),
    averageAccuracy: Math.round(totals.accuracy / totals.count),
  })).sort((left, right) => right.averageScore - left.averageScore);

  const strongestSubject = [...subjectAverages].sort((left, right) => right.averageScore - left.averageScore)[0] ?? null;
  const weakestSubject = [...subjectAverages].sort((left, right) => left.averageScore - right.averageScore)[0] ?? null;

    return {
      totalSubmitted,
      bestScore,
      averageScore,
      averageAccuracy,
      subjectAverages,
      strongestSubject,
      weakestSubject,
      recentAttempts: parsedAttempts.slice(0, 5),
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return {
        totalSubmitted: 0,
        bestScore: 0,
        averageScore: 0,
        averageAccuracy: 0,
        subjectAverages: [],
        strongestSubject: null,
        weakestSubject: null,
        recentAttempts: [],
      };
    }

    throw error;
  }
}

export async function getInstructionData(testId: string) {
  const test = await prisma.test.findUnique({
    where: { id: testId },
    include: {
      testQuestions: {
        orderBy: { orderIndex: "asc" },
      },
    },
  });

  if (!test) {
    return null;
  }

  return {
    id: test.id,
    testCode: test.testCode,
    name: test.name,
    totalQuestions: test.totalQuestions,
    durationMinutes: test.durationMinutes,
    incorrectMarks: test.incorrectMarks,
    testQuestions: test.testQuestions,
  };
}

export async function startAttempt(testId: string, student?: { id: string; username: string; displayName: string | null }) {
  const test = await prisma.test.findUnique({
    where: { id: testId },
    include: {
      testQuestions: {
        orderBy: { orderIndex: "asc" },
        include: { question: true },
      },
    },
  });

  if (!test) {
    throw new Error("Test not found.");
  }

  const answers = Object.fromEntries(
    test.testQuestions.map((row) => [row.question.id, getInitialAnswerState()]),
  );

  const attempt = await prisma.attempt.create({
    data: {
      testId,
      studentId: student?.id,
      studentName: student?.displayName ?? student?.username,
      answers,
    },
  });

  return attempt;
}

export async function getAttemptData(attemptId: string, studentId?: string) {
  const attempt = await prisma.attempt.findFirst({
    where: {
      id: attemptId,
      ...(studentId ? { studentId } : {}),
    },
    include: {
      test: {
        include: {
          testQuestions: {
            orderBy: { orderIndex: "asc" },
            include: { question: true },
          },
        },
      },
    },
  });

  if (!attempt) {
    return null;
  }

  const questions = attempt.test.testQuestions.map(normalizeQuestion);
  const answers = Object.fromEntries(
    Object.entries((attempt.answers as StoredAnswersMap) ?? {}).map(([questionId, answer]) => [questionId, normalizeStoredAnswer(answer)]),
  ) as StoredAnswersMap;
  const palette = questions.map((question) => ({
    id: question.id,
    orderIndex: question.orderIndex,
    status: getPaletteStatus(answers[question.id] ?? getInitialAnswerState()),
  }));

  return {
    attempt,
    test: attempt.test,
    questions,
    answers,
    palette,
  };
}

export async function persistAttempt(params: {
  attemptId: string;
  studentId?: string;
  answers: StoredAnswersMap;
  currentQuestionIndex: number;
  tabSwitchCount: number;
  totalTimeSpentSeconds: number;
}) {
  const attempt = await prisma.attempt.findFirst({
    where: {
      id: params.attemptId,
      ...(params.studentId ? { studentId: params.studentId } : {}),
    },
    select: { id: true },
  });

  if (!attempt) {
    throw new Error("Attempt not found.");
  }

  return prisma.attempt.update({
    where: { id: attempt.id },
    data: {
      answers: params.answers,
      currentQuestionIndex: params.currentQuestionIndex,
      tabSwitchCount: params.tabSwitchCount,
      totalTimeSpentSeconds: params.totalTimeSpentSeconds,
    },
  });
}

export async function submitAttempt(attemptId: string, autoSubmitted = false, studentId?: string) {
  const attemptData = await getAttemptData(attemptId, studentId);

  if (!attemptData) {
    throw new Error("Attempt not found.");
  }

  if (attemptData.attempt.status !== AttemptStatus.IN_PROGRESS && attemptData.attempt.result) {
    return attemptData.attempt;
  }

  const result = evaluateAttempt(
    {
      id: attemptData.test.id,
      mode: attemptData.test.mode as TestMode,
      correctMarks: attemptData.test.correctMarks,
      incorrectMarks: attemptData.test.incorrectMarks,
      unansweredMarks: attemptData.test.unansweredMarks,
      totalQuestions: attemptData.test.totalQuestions,
      totalEvaluatedQuestions: attemptData.test.totalEvaluatedQuestions,
    },
    attemptData.questions,
    attemptData.answers,
  );

  return prisma.attempt.update({
    where: { id: attemptId },
    data: {
      status: autoSubmitted ? AttemptStatus.AUTO_SUBMITTED : AttemptStatus.SUBMITTED,
      submittedAt: new Date(),
      result,
    },
  });
}

export async function getAttemptResult(attemptId: string) {
  return prisma.attempt.findFirst({
    where: { id: attemptId },
    include: { test: true },
  });
}

export async function getStudentAttemptResult(attemptId: string, studentId: string) {
  return prisma.attempt.findFirst({
    where: {
      id: attemptId,
      studentId,
    },
    include: { test: true },
  });
}

export async function getSubmittedAttemptResults(studentId?: string) {
  try {
    return await prisma.attempt.findMany({
      where: {
        status: { in: [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED] },
        result: { not: Prisma.JsonNull },
        ...(studentId ? { studentId } : {}),
      },
      orderBy: { submittedAt: "desc" },
      include: { test: true },
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return [];
    }

    throw error;
  }
}