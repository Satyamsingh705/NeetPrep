import { lookup } from "node:dns/promises";
import { randomUUID } from "node:crypto";
import type { AttemptStatus, Prisma, QuestionType, Subject, TestMode } from "@prisma/client";
import { getSupabaseServerClient, isSupabaseStorageEnabled } from "@/lib/supabase";
import { getQuestionTable } from "@/lib/question-content";
import { getInitialAnswerState, getPaletteStatus, normalizeStoredAnswer } from "@/lib/neet";
import type { QuestionOption, QuestionPayload, StoredAnswersMap } from "@/lib/types";

const globalForSupabaseFallback = globalThis as typeof globalThis & {
  supabaseReadFallbackState?: {
    checkedAt: number;
    shouldBypassPrisma: boolean;
  };
};

const READ_FALLBACK_CACHE_TTL_MS = 5 * 60 * 1000;

type StudentAuthRecord = {
  id: string;
  username: string;
  displayName: string | null;
  passwordHash: string;
  isActive: boolean;
};

type AdminAuthRecord = {
  id: string;
  username: string;
  displayName: string | null;
  passwordHash: string;
};

type TestRow = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  totalQuestions: number;
  totalEvaluatedQuestions: number;
  correctMarks: number;
  incorrectMarks: number;
  unansweredMarks: number;
  mode: TestMode;
  published: boolean;
  config: Prisma.JsonValue | null;
  createdAt: string;
  updatedAt: string;
  testCode: string | null;
};

type TestQuestionRow = {
  id?: string;
  testId: string;
  questionId?: string;
  orderIndex?: number;
  subject: Subject;
  chapter: string;
  section?: string;
};

type AttemptRow = {
  id: string;
  testId: string;
};

type TestSeriesGroupRow = {
  id: string;
  title: string;
  description: string | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
};

type TestSeriesDocumentRow = {
  id: string;
  title: string;
  fileName: string;
  filePath: string;
  orderIndex: number;
  groupId: string | null;
  createdAt: string;
  updatedAt: string;
};

type QuestionRow = {
  id: string;
  subject: Subject;
  chapter: string;
  type: QuestionType;
  prompt: string | null;
  metadata: Prisma.JsonValue;
  imagePath: string | null;
  options: Prisma.JsonValue;
  correctAnswers: Prisma.JsonValue;
  answerPolicy: Prisma.JsonValue | string;
};

type AttemptRowDetailed = {
  id: string;
  testId: string;
  studentId: string | null;
  studentName: string | null;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  lastSavedAt: string;
  answers: Prisma.JsonValue;
  currentQuestionIndex: number;
  tabSwitchCount: number;
  totalTimeSpentSeconds: number;
  result: Prisma.JsonValue | null;
};

function getSupabaseDatabaseClient() {
  if (!isSupabaseStorageEnabled()) {
    throw new Error("Supabase fallback is not configured.");
  }

  return getSupabaseServerClient();
}

function normalizeDate(value: string) {
  return new Date(value);
}

function getRuntimeDatabaseHost() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return null;
  }

  try {
    const normalizedUrl = databaseUrl.replace(/^postgresql?:\/\//, "http://");
    return new URL(normalizedUrl).hostname;
  } catch {
    return null;
  }
}

function sortByOrderAndCreated<T extends { orderIndex: number; createdAt: Date }>(items: T[]) {
  return [...items].sort((left, right) => {
    if (left.orderIndex !== right.orderIndex) {
      return left.orderIndex - right.orderIndex;
    }

    return left.createdAt.getTime() - right.createdAt.getTime();
  });
}

function normalizeQuestion(question: {
  question: QuestionRow;
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

async function getQuestionRowsByIds(questionIds: string[]) {
  if (questionIds.length === 0) {
    return new Map<string, QuestionRow>();
  }

  const supabase = getSupabaseDatabaseClient();
  const { data, error } = await supabase
    .from("Question")
    .select("id, subject, chapter, type, prompt, metadata, imagePath, options, correctAnswers, answerPolicy")
    .in("id", questionIds)
    .returns<QuestionRow[]>();

  if (error) {
    throw new Error(`Supabase question lookup failed: ${error.message}`);
  }

  return new Map((data ?? []).map((question) => [question.id, question]));
}

async function getTestQuestionRows(testId: string) {
  const supabase = getSupabaseDatabaseClient();
  const { data, error } = await supabase
    .from("TestQuestion")
    .select("id, testId, questionId, orderIndex, subject, chapter, section")
    .eq("testId", testId)
    .order("orderIndex", { ascending: true })
    .returns<Array<{ id: string; testId: string; questionId: string; orderIndex: number; subject: Subject; chapter: string; section: string }>>();

  if (error) {
    throw new Error(`Supabase test question lookup failed: ${error.message}`);
  }

  return data ?? [];
}

export async function getTestWithQuestionsViaSupabase(testId: string) {
  const supabase = getSupabaseDatabaseClient();
  const { data: test, error: testError } = await supabase
    .from("Test")
    .select("id, name, description, durationMinutes, totalQuestions, totalEvaluatedQuestions, correctMarks, incorrectMarks, unansweredMarks, mode, published, config, createdAt, updatedAt, testCode")
    .eq("id", testId)
    .maybeSingle<TestRow>();

  if (testError) {
    throw new Error(`Supabase test lookup failed: ${testError.message}`);
  }

  if (!test) {
    return null;
  }

  const testQuestionRows = await getTestQuestionRows(testId);
  const questionMap = await getQuestionRowsByIds(testQuestionRows.map((row) => row.questionId));

  return {
    ...test,
    createdAt: normalizeDate(test.createdAt),
    updatedAt: normalizeDate(test.updatedAt),
    testQuestions: testQuestionRows.map((row) => {
      const question = questionMap.get(row.questionId);

      if (!question) {
        throw new Error(`Question ${row.questionId} was not found for test ${testId}.`);
      }

      return {
        id: row.id,
        testId: row.testId,
        questionId: row.questionId,
        orderIndex: row.orderIndex,
        subject: row.subject,
        chapter: row.chapter,
        section: row.section,
        question,
      };
    }),
  };
}

export function isSupabaseDatabaseFallbackEnabled() {
  return isSupabaseStorageEnabled();
}

export async function shouldBypassPrismaForReads() {
  if (!isSupabaseDatabaseFallbackEnabled()) {
    return false;
  }

  const cachedState = globalForSupabaseFallback.supabaseReadFallbackState;

  if (cachedState && Date.now() - cachedState.checkedAt < READ_FALLBACK_CACHE_TTL_MS) {
    return cachedState.shouldBypassPrisma;
  }

  const host = getRuntimeDatabaseHost();

  if (!host || !host.endsWith(".supabase.co")) {
    globalForSupabaseFallback.supabaseReadFallbackState = { checkedAt: Date.now(), shouldBypassPrisma: false };
    return false;
  }

  try {
    await lookup(host);
    globalForSupabaseFallback.supabaseReadFallbackState = { checkedAt: Date.now(), shouldBypassPrisma: false };
    return false;
  } catch {
    globalForSupabaseFallback.supabaseReadFallbackState = { checkedAt: Date.now(), shouldBypassPrisma: true };
    return true;
  }
}

export async function getStudentByUsernameViaSupabase(username: string) {
  const supabase = getSupabaseDatabaseClient();
  const { data, error } = await supabase
    .from("Student")
    .select("id, username, displayName, passwordHash, isActive")
    .eq("username", username)
    .maybeSingle<StudentAuthRecord>();

  if (error) {
    throw new Error(`Supabase student lookup failed: ${error.message}`);
  }

  return data;
}

export async function getAdminByUsernameViaSupabase(username: string) {
  const supabase = getSupabaseDatabaseClient();
  const { data, error } = await supabase
    .from("Admin")
    .select("id, username, displayName, passwordHash")
    .eq("username", username)
    .maybeSingle<AdminAuthRecord>();

  if (error) {
    throw new Error(`Supabase admin lookup failed: ${error.message}`);
  }

  return data;
}

export async function getStudentHomeSummaryViaSupabase() {
  const supabase = getSupabaseDatabaseClient();
  const { data, error } = await supabase.from("Test").select("totalQuestions").eq("published", true);

  if (error) {
    throw new Error(`Supabase test summary lookup failed: ${error.message}`);
  }

  return {
    totalQuestions: (data ?? []).reduce((sum, test) => sum + (test.totalQuestions ?? 0), 0),
  };
}

export async function getStudentAttemptCountViaSupabase(studentId: string) {
  const supabase = getSupabaseDatabaseClient();
  const { count, error } = await supabase
    .from("Attempt")
    .select("id", { count: "exact", head: true })
    .eq("studentId", studentId);

  if (error) {
    throw new Error(`Supabase attempt count lookup failed: ${error.message}`);
  }

  return count ?? 0;
}

export async function getTestsForListingViaSupabase(studentId?: string, options?: { includeUnpublished?: boolean }) {
  const supabase = getSupabaseDatabaseClient();
  let testsQuery = supabase
    .from("Test")
    .select("id, name, description, durationMinutes, totalQuestions, totalEvaluatedQuestions, correctMarks, incorrectMarks, unansweredMarks, mode, published, config, createdAt, updatedAt, testCode")
    .order("createdAt", { ascending: false });

  if (!options?.includeUnpublished) {
    testsQuery = testsQuery.eq("published", true);
  }

  const { data: tests, error: testsError } = await testsQuery.returns<TestRow[]>();

  if (testsError) {
    throw new Error(`Supabase tests lookup failed: ${testsError.message}`);
  }

  if (!tests || tests.length === 0) {
    return [];
  }

  const testIds = tests.map((test) => test.id);

  const { data: testQuestions, error: testQuestionsError } = await supabase
    .from("TestQuestion")
    .select("testId, subject, chapter")
    .in("testId", testIds)
    .returns<TestQuestionRow[]>();

  if (testQuestionsError) {
    throw new Error(`Supabase test question lookup failed: ${testQuestionsError.message}`);
  }

  let attemptRows: AttemptRow[] = [];

  if (studentId) {
    const { data, error } = await supabase
      .from("Attempt")
      .select("id, testId")
      .eq("studentId", studentId)
      .in("testId", testIds)
      .returns<AttemptRow[]>();

    if (error) {
      throw new Error(`Supabase student attempts lookup failed: ${error.message}`);
    }

    attemptRows = data ?? [];
  } else {
    const { data, error } = await supabase
      .from("Attempt")
      .select("id, testId")
      .in("testId", testIds)
      .returns<AttemptRow[]>();

    if (error) {
      throw new Error(`Supabase attempts lookup failed: ${error.message}`);
    }

    attemptRows = data ?? [];
  }

  const attemptsByTestId = new Map<string, AttemptRow[]>();

  for (const attempt of attemptRows) {
    const current = attemptsByTestId.get(attempt.testId) ?? [];
    current.push(attempt);
    attemptsByTestId.set(attempt.testId, current);
  }

  const questionsByTestId = new Map<string, Array<{ subject: Subject; chapter: string }>>();

  for (const question of testQuestions ?? []) {
    const current = questionsByTestId.get(question.testId) ?? [];

    if (!current.some((item) => item.subject === question.subject && item.chapter === question.chapter)) {
      current.push({ subject: question.subject, chapter: question.chapter });
    }

    questionsByTestId.set(question.testId, current);
  }

  return tests.map((test) => {
    const attempts = attemptsByTestId.get(test.id) ?? [];

    return {
      ...test,
      createdAt: normalizeDate(test.createdAt),
      updatedAt: normalizeDate(test.updatedAt),
      _count: { attempts: attempts.length },
      attempts,
      testQuestions: questionsByTestId.get(test.id) ?? [],
      studentAttemptCount: attempts.length,
    };
  });
}

export async function getInstructionDataViaSupabase(testId: string) {
  const test = await getTestWithQuestionsViaSupabase(testId);
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

export async function createAttemptViaSupabase(testId: string, student?: { id: string; username: string; displayName: string | null }) {
  const test = await getTestWithQuestionsViaSupabase(testId);

  if (!test) {
    throw new Error("Test not found.");
  }

  const answers = Object.fromEntries(test.testQuestions.map((row) => [row.question.id, getInitialAnswerState()]));
  const supabase = getSupabaseDatabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("Attempt")
    .insert({
      id: randomUUID(),
      testId,
      studentId: student?.id,
      studentName: student?.displayName ?? student?.username,
      status: "IN_PROGRESS",
      startedAt: now,
      lastSavedAt: now,
      answers,
      currentQuestionIndex: 1,
      tabSwitchCount: 0,
      totalTimeSpentSeconds: 0,
      result: null,
    })
    .select("id, testId, studentId, studentName, status, startedAt, submittedAt, lastSavedAt, answers, currentQuestionIndex, tabSwitchCount, totalTimeSpentSeconds, result")
    .single<AttemptRowDetailed>();

  if (error) {
    throw new Error(`Supabase attempt creation failed: ${error.message}`);
  }

  return {
    ...data,
    startedAt: normalizeDate(data.startedAt),
    submittedAt: data.submittedAt ? normalizeDate(data.submittedAt) : null,
    lastSavedAt: normalizeDate(data.lastSavedAt),
  };
}

export async function getAttemptWithTestViaSupabase(attemptId: string, studentId?: string) {
  const supabase = getSupabaseDatabaseClient();
  let attemptQuery = supabase
    .from("Attempt")
    .select("id, testId, studentId, studentName, status, startedAt, submittedAt, lastSavedAt, answers, currentQuestionIndex, tabSwitchCount, totalTimeSpentSeconds, result")
    .eq("id", attemptId);

  if (studentId) {
    attemptQuery = attemptQuery.eq("studentId", studentId);
  }

  const { data: attempt, error: attemptError } = await attemptQuery.maybeSingle<AttemptRowDetailed>();

  if (attemptError) {
    throw new Error(`Supabase attempt lookup failed: ${attemptError.message}`);
  }

  if (!attempt) {
    return null;
  }

  const test = await getTestWithQuestionsViaSupabase(attempt.testId);

  if (!test) {
    return null;
  }

  return {
    attempt: {
      ...attempt,
      startedAt: normalizeDate(attempt.startedAt),
      submittedAt: attempt.submittedAt ? normalizeDate(attempt.submittedAt) : null,
      lastSavedAt: normalizeDate(attempt.lastSavedAt),
    },
    test,
  };
}

export async function getAttemptDataViaSupabase(attemptId: string, studentId?: string) {
  const payload = await getAttemptWithTestViaSupabase(attemptId, studentId);

  if (!payload) {
    return null;
  }

  const questions = payload.test.testQuestions.map(normalizeQuestion);
  const answers = Object.fromEntries(
    Object.entries((payload.attempt.answers as StoredAnswersMap) ?? {}).map(([questionId, answer]) => [questionId, normalizeStoredAnswer(answer)]),
  ) as StoredAnswersMap;
  const palette = questions.map((question) => ({
    id: question.id,
    orderIndex: question.orderIndex,
    status: getPaletteStatus(answers[question.id] ?? getInitialAnswerState()),
  }));

  return {
    attempt: payload.attempt,
    test: payload.test,
    questions,
    answers,
    palette,
  };
}

export async function persistAttemptViaSupabase(params: {
  attemptId: string;
  studentId?: string;
  answers: StoredAnswersMap;
  currentQuestionIndex: number;
  tabSwitchCount: number;
  totalTimeSpentSeconds: number;
}) {
  const supabase = getSupabaseDatabaseClient();
  let query = supabase
    .from("Attempt")
    .update({
      answers: params.answers,
      currentQuestionIndex: params.currentQuestionIndex,
      tabSwitchCount: params.tabSwitchCount,
      totalTimeSpentSeconds: params.totalTimeSpentSeconds,
    })
    .eq("id", params.attemptId);

  if (params.studentId) {
    query = query.eq("studentId", params.studentId);
  }

  const { data, error } = await query.select("id").maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(`Supabase attempt save failed: ${error.message}`);
  }

  if (!data) {
    throw new Error("Attempt not found.");
  }

  return data;
}

export async function updateAttemptSubmissionViaSupabase(params: {
  attemptId: string;
  studentId?: string;
  status: AttemptStatus;
  submittedAt: Date;
  result: Prisma.JsonValue;
}) {
  const supabase = getSupabaseDatabaseClient();
  let query = supabase
    .from("Attempt")
    .update({
      status: params.status,
      submittedAt: params.submittedAt.toISOString(),
      result: params.result,
    })
    .eq("id", params.attemptId);

  if (params.studentId) {
    query = query.eq("studentId", params.studentId);
  }

  const { data, error } = await query
    .select("id, testId, studentId, studentName, status, startedAt, submittedAt, lastSavedAt, answers, currentQuestionIndex, tabSwitchCount, totalTimeSpentSeconds, result")
    .maybeSingle<AttemptRowDetailed>();

  if (error) {
    throw new Error(`Supabase attempt submission failed: ${error.message}`);
  }

  if (!data) {
    throw new Error("Attempt not found.");
  }

  return {
    ...data,
    startedAt: normalizeDate(data.startedAt),
    submittedAt: data.submittedAt ? normalizeDate(data.submittedAt) : null,
    lastSavedAt: normalizeDate(data.lastSavedAt),
  };
}

export async function getAttemptResultViaSupabase(attemptId: string, studentId?: string) {
  const payload = await getAttemptWithTestViaSupabase(attemptId, studentId);

  if (!payload) {
    return null;
  }

  return {
    ...payload.attempt,
    test: payload.test,
  };
}

export async function getSubmittedAttemptResultsViaSupabase(studentId?: string) {
  const supabase = getSupabaseDatabaseClient();
  let query = supabase
    .from("Attempt")
    .select("id, testId, studentId, studentName, status, startedAt, submittedAt, lastSavedAt, answers, currentQuestionIndex, tabSwitchCount, totalTimeSpentSeconds, result")
    .in("status", ["SUBMITTED", "AUTO_SUBMITTED"])
    .not("result", "is", null)
    .order("submittedAt", { ascending: false });

  if (studentId) {
    query = query.eq("studentId", studentId);
  }

  const { data, error } = await query.returns<AttemptRowDetailed[]>();

  if (error) {
    throw new Error(`Supabase submitted attempts lookup failed: ${error.message}`);
  }

  const attempts = data ?? [];
  const testIds = Array.from(new Set(attempts.map((attempt) => attempt.testId)));
  const testsById = new Map<string, TestRow>();

  if (testIds.length > 0) {
    const { data: tests, error: testsError } = await supabase
      .from("Test")
      .select("id, name, description, durationMinutes, totalQuestions, totalEvaluatedQuestions, correctMarks, incorrectMarks, unansweredMarks, mode, published, config, createdAt, updatedAt, testCode")
      .in("id", testIds)
      .returns<TestRow[]>();

    if (testsError) {
      throw new Error(`Supabase submitted tests lookup failed: ${testsError.message}`);
    }

    for (const test of tests ?? []) {
      testsById.set(test.id, {
        ...test,
        createdAt: test.createdAt,
        updatedAt: test.updatedAt,
      });
    }
  }

  return attempts
    .map((attempt) => {
      const test = testsById.get(attempt.testId);

      if (!test) {
        return null;
      }

      return {
        ...attempt,
        startedAt: normalizeDate(attempt.startedAt),
        submittedAt: attempt.submittedAt ? normalizeDate(attempt.submittedAt) : null,
        lastSavedAt: normalizeDate(attempt.lastSavedAt),
        test: {
          ...test,
          createdAt: normalizeDate(test.createdAt),
          updatedAt: normalizeDate(test.updatedAt),
        },
      };
    })
    .filter(Boolean);
}

export async function getTestSeriesGroupsWithDocumentsViaSupabase() {
  const supabase = getSupabaseDatabaseClient();
  const { data: groups, error: groupsError } = await supabase
    .from("TestSeriesGroup")
    .select("id, title, description, orderIndex, createdAt, updatedAt")
    .returns<TestSeriesGroupRow[]>();

  if (groupsError) {
    throw new Error(`Supabase test series group lookup failed: ${groupsError.message}`);
  }

  const { data: documents, error: documentsError } = await supabase
    .from("TestSeriesDocument")
    .select("id, title, fileName, filePath, orderIndex, groupId, createdAt, updatedAt")
    .not("groupId", "is", null)
    .returns<TestSeriesDocumentRow[]>();

  if (documentsError) {
    throw new Error(`Supabase test series document lookup failed: ${documentsError.message}`);
  }

  const documentsByGroupId = new Map<string, Array<TestSeriesDocumentRow & { createdAt: Date; updatedAt: Date }>>();

  for (const document of documents ?? []) {
    if (!document.groupId) {
      continue;
    }

    const current = documentsByGroupId.get(document.groupId) ?? [];
    current.push({ ...document, createdAt: normalizeDate(document.createdAt), updatedAt: normalizeDate(document.updatedAt) });
    documentsByGroupId.set(document.groupId, current);
  }

  return sortByOrderAndCreated(
    (groups ?? []).map((group) => ({
      ...group,
      createdAt: normalizeDate(group.createdAt),
      updatedAt: normalizeDate(group.updatedAt),
      documents: sortByOrderAndCreated(documentsByGroupId.get(group.id) ?? []),
    })),
  );
}

export async function getUngroupedTestSeriesDocumentsViaSupabase() {
  const supabase = getSupabaseDatabaseClient();
  const { data, error } = await supabase
    .from("TestSeriesDocument")
    .select("id, title, fileName, filePath, orderIndex, groupId, createdAt, updatedAt")
    .is("groupId", null)
    .returns<TestSeriesDocumentRow[]>();

  if (error) {
    throw new Error(`Supabase ungrouped test series lookup failed: ${error.message}`);
  }

  return sortByOrderAndCreated(
    (data ?? []).map((document) => ({
      ...document,
      createdAt: normalizeDate(document.createdAt),
      updatedAt: normalizeDate(document.updatedAt),
    })),
  );
}

export async function getTestSeriesGroupByIdViaSupabase(groupId: string) {
  const supabase = getSupabaseDatabaseClient();
  const { data: group, error: groupError } = await supabase
    .from("TestSeriesGroup")
    .select("id, title, description, orderIndex, createdAt, updatedAt")
    .eq("id", groupId)
    .maybeSingle<TestSeriesGroupRow>();

  if (groupError) {
    throw new Error(`Supabase test series group lookup failed: ${groupError.message}`);
  }

  if (!group) {
    return null;
  }

  const { data: documents, error: documentsError } = await supabase
    .from("TestSeriesDocument")
    .select("id, title, fileName, filePath, orderIndex, groupId, createdAt, updatedAt")
    .eq("groupId", groupId)
    .returns<TestSeriesDocumentRow[]>();

  if (documentsError) {
    throw new Error(`Supabase test series documents lookup failed: ${documentsError.message}`);
  }

  return {
    ...group,
    createdAt: normalizeDate(group.createdAt),
    updatedAt: normalizeDate(group.updatedAt),
    documents: sortByOrderAndCreated(
      (documents ?? []).map((document) => ({
        ...document,
        createdAt: normalizeDate(document.createdAt),
        updatedAt: normalizeDate(document.updatedAt),
      })),
    ),
  };
}