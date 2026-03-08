import { getSubjectLabel } from "@/lib/subject-categories";

export type ResultDashboardProps = {
  attempt: {
    id: string;
    studentName: string | null;
    status: string;
    startedAt: string;
    submittedAt: string | null;
    totalTimeSpentSeconds: number;
    tabSwitchCount: number;
  };
  test: {
    id?: string;
    testCode?: string | null;
    name: string;
    totalQuestions: number;
    totalEvaluatedQuestions: number;
  };
  result: {
    score: number;
    summary: {
      totalQuestions: number;
      totalEvaluatedQuestions: number;
      evaluatedQuestions: number;
      correct: number;
      incorrect: number;
      unanswered: number;
      ignored: number;
      dropped: number;
      attempted: number;
      accuracy: number;
    };
    subjectWise: Array<{
      subject: string;
      correct: number;
      incorrect: number;
      unanswered: number;
      score: number;
      attempted: number;
      ignored: number;
      accuracy: number;
    }>;
    questionWise: Array<{
      id: string;
      orderIndex: number;
      subject: string;
      chapter: string;
      section: string;
      prompt: string | null;
      options: Array<{ key: string; text: string }> | null;
      imagePath: string | null;
      type: string;
      selectedOptions: string[];
      correctAnswers: string[];
      markedForReview: boolean;
      timeSpentSeconds: number;
      outcome: string;
      awardedMarks: number;
    }>;
  };
};

function getDisplayPrompt(prompt: string | null) {
  const normalizedPrompt = (prompt ?? "").trim();

  if (!normalizedPrompt) {
    return "Image based question";
  }

  const prefixedQuestionMatch = normalizedPrompt.match(/^(?:[^|\n]+\|\s*)+(?:Q\d+\s*[:.-]?\s*)(.+)$/i);

  if (prefixedQuestionMatch?.[1]) {
    return prefixedQuestionMatch[1].trim();
  }

  const directQuestionMatch = normalizedPrompt.match(/^Q\d+\s*[:.-]?\s*(.+)$/i);

  if (directQuestionMatch?.[1]) {
    return directQuestionMatch[1].trim();
  }

  return normalizedPrompt;
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

export function ResultDashboard({ attempt, test, result }: ResultDashboardProps) {
  return (
    <div className="flex w-full flex-col gap-6">
      <section className="panel rounded-[1.5rem] p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#b26d39]">Result</p>
            <h1 className="mt-2 text-4xl font-semibold text-[#2f241c]">{test.name}</h1>
            <p className="mt-3 text-lg leading-7 text-[#6d5a49]">Test ID {test.testCode ?? (test.id ? `TST-${test.id.slice(-8).toUpperCase()}` : "-")} · Attempt {attempt.id.slice(-8)} · {attempt.status} · Time taken {formatDuration(attempt.totalTimeSpentSeconds)}</p>
          </div>
          <div className="rounded-[1.2rem] bg-[#fff6ee] px-6 py-5 text-center">
            <div className="text-sm uppercase tracking-[0.25em] text-[#9a7557]">Total Marks</div>
            <div className="mt-2 text-5xl font-semibold text-[#d7671b]">{result.score}</div>
            <div className="mt-2 text-sm text-[#6d5a49]">Out of {test.totalEvaluatedQuestions * 4}</div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="panel rounded-[1.2rem] p-5"><div className="text-sm uppercase tracking-[0.2em] text-[#886d58]">Correct</div><div className="mt-2 text-4xl font-semibold text-[#30a451]">{result.summary.correct}</div></div>
        <div className="panel rounded-[1.2rem] p-5"><div className="text-sm uppercase tracking-[0.2em] text-[#886d58]">Incorrect</div><div className="mt-2 text-4xl font-semibold text-[#d85b58]">{result.summary.incorrect}</div></div>
        <div className="panel rounded-[1.2rem] p-5"><div className="text-sm uppercase tracking-[0.2em] text-[#886d58]">Accuracy</div><div className="mt-2 text-4xl font-semibold text-[#d7671b]">{result.summary.accuracy}%</div></div>
        <div className="panel rounded-[1.2rem] p-5"><div className="text-sm uppercase tracking-[0.2em] text-[#886d58]">Tab Switches</div><div className="mt-2 text-4xl font-semibold text-[#7d57a7]">{attempt.tabSwitchCount}</div></div>
      </section>

      <section className="panel rounded-[1.4rem] p-6">
        <h2 className="text-2xl font-semibold text-[#2f241c]">Subject-wise Performance</h2>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {result.subjectWise.map((subject) => (
            <div key={subject.subject} className="rounded-[1rem] border border-[#eadbcd] bg-[#fffdfa] p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="text-xl font-semibold text-[#2f241c]">{getSubjectLabel(subject.subject)}</div>
                <div className="text-lg font-semibold text-[#d7671b]">{subject.score} marks</div>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-[#6d5a49] md:grid-cols-4">
                <div>Correct: {subject.correct}</div>
                <div>Incorrect: {subject.incorrect}</div>
                <div>Ignored: {subject.ignored}</div>
                <div>Accuracy: {subject.accuracy}%</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel rounded-[1.4rem] p-6">
        <h2 className="text-2xl font-semibold text-[#2f241c]">Question-wise Analysis</h2>
        <div className="mt-5 max-h-[820px] overflow-y-auto pr-2">
          <div className="space-y-3">
            {result.questionWise.map((question) => (
              <div key={question.id} className="rounded-[1rem] border border-[#eadbcd] bg-[#fffdfa] p-4 text-sm text-[#5d4d40]">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="font-semibold text-[#2f241c]">Q{question.orderIndex}</div>
                  <div className="rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ backgroundColor: question.outcome === "correct" ? "#30a451" : question.outcome === "incorrect" ? "#d85b58" : question.outcome === "ignored" ? "#7d57a7" : "#8b8b8b" }}>
                    {question.outcome}
                  </div>
                </div>
                <div className="mt-3 rounded-[0.9rem] border border-[#efe3d6] bg-white p-4">
                  <div className="text-sm font-semibold text-[#2f241c]">Question</div>
                  <div className="mt-2 text-sm leading-6 text-[#4f4338]">{getDisplayPrompt(question.prompt)}</div>
                  {question.type === "IMAGE" && question.imagePath ? (
                    <div className="mt-4 overflow-hidden rounded-md border border-[#eadbcd] bg-[#fcfbf8] p-3">
                      <img src={question.imagePath} alt={`Question ${question.orderIndex}`} className="h-auto w-full object-contain" />
                    </div>
                  ) : null}
                  {question.options && question.options.length > 0 ? (
                    <div className="mt-4 space-y-2 text-sm text-[#5d4d40]">
                      {question.options.map((option) => (
                        <div key={`${question.id}-${option.key}`} className="rounded-[0.75rem] bg-[#faf5ef] px-3 py-2">
                          <span className="font-semibold text-[#2f241c]">{option.key}.</span> {option.text}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-4">
                  <span>Selected: {question.selectedOptions.join(", ") || "-"}</span>
                  <span>Correct: {question.correctAnswers.join(", ") || "-"}</span>
                  <span>Marks: {question.awardedMarks}</span>
                  <span>Time: {question.timeSpentSeconds}s</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
