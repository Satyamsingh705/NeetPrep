import type { AnswerPolicy, QuestionType, Subject, TestMode } from "@prisma/client";
import type { AdminSubjectCategory } from "@/lib/subject-categories";

export type OptionKey = "A" | "B" | "C" | "D";

export type QuestionOption = {
  key: OptionKey;
  text: string;
};

export type StoredAnswer = {
  selectedOptions: OptionKey[];
  markedForReview: boolean;
  visited: boolean;
  timeSpentSeconds: number;
};

export type StoredAnswersMap = Record<string, StoredAnswer>;

export type PaletteStatus =
  | "NOT_VISITED"
  | "NOT_ANSWERED"
  | "ANSWERED"
  | "REVIEW"
  | "ANSWERED_REVIEW";

export type QuestionPayload = {
  id: string;
  subject: Subject;
  chapter: string;
  section: string;
  orderIndex: number;
  type: QuestionType;
  prompt: string | null;
  imagePath: string | null;
  options: QuestionOption[] | null;
  correctAnswers: OptionKey[];
  answerPolicy: AnswerPolicy;
};

export type TestConfigPayload = {
  name: string;
  description?: string;
  durationMinutes: number;
  correctMarks: number;
  incorrectMarks: number;
  unansweredMarks: number;
  published?: boolean;
  assignedSection?: AdminSubjectCategory;
  mode: TestMode;
  subjectConfigs?: Array<{ subject: Subject; sectionA: number; sectionB: number }>;
  questionConfigs?: Array<{ subject: Subject; chapter?: string; count: number }>;
};

export type UploadJsonQuestion = {
  subject: Subject;
  chapter: string;
  prompt: string;
  options: QuestionOption[];
  correctAnswers: OptionKey[];
  answerPolicy?: AnswerPolicy;
};
