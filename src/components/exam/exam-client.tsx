"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPaletteStatus, normalizeStoredAnswer } from "@/lib/neet";
import type { OptionKey, QuestionPayload, StoredAnswersMap } from "@/lib/types";

type ExamClientProps = {
  attemptId: string;
  studentName: string;
  test: {
    id: string;
    testCode?: string | null;
    name: string;
    durationMinutes: number;
    totalQuestions: number;
    mode: string;
  };
  initialAnswers: StoredAnswersMap;
  initialCurrentQuestionIndex: number;
  questions: QuestionPayload[];
  startedAt: string;
  initialTabSwitchCount: number;
  initialTotalTimeSpentSeconds: number;
};

const fallbackOptions: Array<{ key: OptionKey; text: string }> = [
  { key: "A", text: "Option A" },
  { key: "B", text: "Option B" },
  { key: "C", text: "Option C" },
  { key: "D", text: "Option D" },
];

function formatTimer(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function blankAnswer() {
  return {
    selectedOptions: [],
    markedForReview: false,
    visited: false,
    timeSpentSeconds: 0,
  };
}

function getDisplayPrompt(prompt: string) {
  const normalizedPrompt = prompt.trim();
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

export function ExamClient(props: ExamClientProps) {
  const router = useRouter();
  const initialQuestionIndex = props.initialCurrentQuestionIndex || 1;
  const initialQuestion = props.questions[initialQuestionIndex - 1];
  const initialRemainingSeconds = Math.max(0, props.test.durationMinutes * 60 - props.initialTotalTimeSpentSeconds);
  const [answers, setAnswers] = useState<StoredAnswersMap>(() =>
    Object.fromEntries(
      Object.entries(props.initialAnswers).map(([questionId, answer]) => {
        const normalizedAnswer = normalizeStoredAnswer(answer);

        if (questionId === initialQuestion?.id) {
          return [questionId, { ...normalizedAnswer, visited: true }];
        }

        return [questionId, normalizedAnswer];
      }),
    ),
  );
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(initialQuestionIndex);
  const [remainingSeconds, setRemainingSeconds] = useState(initialRemainingSeconds);
  const [tabSwitchCount, setTabSwitchCount] = useState(props.initialTabSwitchCount);
  const [totalTimeSpentSeconds, setTotalTimeSpentSeconds] = useState(props.initialTotalTimeSpentSeconds);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [tabWarning, setTabWarning] = useState<string | null>(null);
  const [timeWarning, setTimeWarning] = useState<string | null>(initialRemainingSeconds > 0 && initialRemainingSeconds <= 300 ? "Hurry up. Only 5 minutes remaining." : null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittedRef = useRef(false);
  const lowTimeWarningShownRef = useRef(initialRemainingSeconds > 0 && initialRemainingSeconds <= 300);
  const dirtySaveRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const latestAttemptStateRef = useRef({
    answers,
    currentQuestionIndex,
    tabSwitchCount,
    totalTimeSpentSeconds,
  });
  const questions = props.questions;
  const currentQuestion = questions[currentQuestionIndex - 1];
  const currentQuestionPrompt = getDisplayPrompt(currentQuestion.prompt ?? "");

  const saveAttempt = useCallback(async (body: object) => {
    await fetch(`/api/attempts/${props.attemptId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  }, [props.attemptId]);

  const flushAttemptSave = useCallback(async (force = false) => {
    if (submittedRef.current || saveInFlightRef.current) {
      return;
    }

    if (!force && !dirtySaveRef.current) {
      return;
    }

    saveInFlightRef.current = true;

    try {
      await saveAttempt(latestAttemptStateRef.current);
      dirtySaveRef.current = false;
    } finally {
      saveInFlightRef.current = false;
    }
  }, [saveAttempt]);

  useEffect(() => {
    latestAttemptStateRef.current = {
      answers,
      currentQuestionIndex,
      tabSwitchCount,
      totalTimeSpentSeconds,
    };
    dirtySaveRef.current = true;
  }, [answers, currentQuestionIndex, tabSwitchCount, totalTimeSpentSeconds]);

  const submitAttempt = useCallback(async (auto = false) => {
    if (submittedRef.current) {
      return;
    }

    submittedRef.current = true;
    setIsSubmitting(true);

    await flushAttemptSave(true);

    const response = await fetch(`/api/attempts/${props.attemptId}/submit${auto ? "?auto=1" : ""}`, {
      method: "POST",
      keepalive: true,
    });

    if (!response.ok) {
      submittedRef.current = false;
      setIsSubmitting(false);
      window.alert("Unable to submit attempt.");
      return;
    }

    router.replace(`/attempts/${props.attemptId}/result`);
  }, [answers, currentQuestionIndex, props.attemptId, router, saveAttempt, tabSwitchCount, totalTimeSpentSeconds]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => {
        const nextRemainingSeconds = Math.max(0, current - 1);

        if (current > 300 && nextRemainingSeconds <= 300 && nextRemainingSeconds > 0 && !lowTimeWarningShownRef.current) {
          lowTimeWarningShownRef.current = true;
          setTimeWarning("Hurry up. Only 5 minutes remaining.");
        }

        if (nextRemainingSeconds === 0 && !submittedRef.current) {
          void submitAttempt(true);
        }

        return nextRemainingSeconds;
      });
      setTotalTimeSpentSeconds((current) => current + 1);
      setAnswers((current) => ({
        ...current,
        [currentQuestion.id]: {
          ...(current[currentQuestion.id] ?? { ...blankAnswer(), visited: true }),
          visited: true,
          timeSpentSeconds: (current[currentQuestion.id]?.timeSpentSeconds ?? 0) + 1,
        },
      }));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [currentQuestion.id, submitAttempt]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void flushAttemptSave();
    }, 8000);

    return () => window.clearInterval(interval);
  }, [flushAttemptSave]);

  useEffect(() => {
    if (!timeWarning) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setTimeWarning(null);
    }, 2800);

    return () => window.clearTimeout(timeout);
  }, [timeWarning]);

  useEffect(() => {
    const leaveMessage = "First finish the test.";

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        setTabSwitchCount((current) => current + 1);
        setTabWarning("Tab switch detected. The event has been recorded.");
        window.setTimeout(() => setTabWarning(null), 2500);
      }
    };

    const handleContextMenu = (event: MouseEvent) => event.preventDefault();
    const handleClipboard = (event: ClipboardEvent) => event.preventDefault();
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (submittedRef.current) {
        return;
      }

      event.preventDefault();
      event.returnValue = leaveMessage;
    };
    const handlePopState = () => {
      if (submittedRef.current) {
        return;
      }

      window.history.pushState({ examLocked: true }, "", window.location.href);
      setTabWarning(leaveMessage);
      window.setTimeout(() => setTabWarning(null), 2500);
      window.alert(leaveMessage);
    };
    const handlePageHide = () => {
      if (!submittedRef.current) {
        void flushAttemptSave(true);
        navigator.sendBeacon(`/api/attempts/${props.attemptId}/submit?auto=1`, new Blob([], { type: "application/json" }));
      }
    };

    window.history.pushState({ examLocked: true }, "", window.location.href);
    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleClipboard);
    document.addEventListener("cut", handleClipboard);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("copy", handleClipboard);
      document.removeEventListener("cut", handleClipboard);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [flushAttemptSave, props.attemptId]);

  const counts = useMemo(() => {
    return questions.reduce(
      (accumulator, question) => {
        const answer = answers[question.id] ?? blankAnswer();
        const status = getPaletteStatus(answer);

        if (status === "ANSWERED" || status === "ANSWERED_REVIEW") {
          accumulator.answered += 1;
        }

        if (status === "REVIEW" || status === "ANSWERED_REVIEW") {
          accumulator.flagged += 1;
        }

        if (status === "NOT_VISITED" || status === "NOT_ANSWERED") {
          accumulator.pending += 1;
        }

        return accumulator;
      },
      { answered: 0, flagged: 0, pending: 0 },
    );
  }, [answers, questions]);

  function updateAnswer(mutator: (current: StoredAnswersMap) => StoredAnswersMap) {
    setAnswers((current) => mutator(current));
  }

  function goToQuestion(index: number) {
    const safeIndex = Math.max(1, Math.min(index, questions.length));
    const targetQuestion = questions[safeIndex - 1];

    setAnswers((current) => ({
      ...current,
      [targetQuestion.id]: {
        ...(current[targetQuestion.id] ?? blankAnswer()),
        visited: true,
      },
    }));

    setCurrentQuestionIndex(safeIndex);
  }

  function selectOption(option: OptionKey) {
    updateAnswer((current) => ({
      ...current,
      [currentQuestion.id]: {
        ...(current[currentQuestion.id] ?? { ...blankAnswer(), visited: true }),
        selectedOptions: [option],
        visited: true,
      },
    }));
  }

  function toggleOption(option: OptionKey) {
    updateAnswer((current) => {
      const currentAnswer = normalizeStoredAnswer(current[currentQuestion.id] ?? { ...blankAnswer(), visited: true });
      const selectedOptions = currentAnswer.selectedOptions.includes(option)
        ? currentAnswer.selectedOptions.filter((selectedOption) => selectedOption !== option)
        : [...currentAnswer.selectedOptions, option].sort();

      return {
        ...current,
        [currentQuestion.id]: {
          ...currentAnswer,
          selectedOptions,
          visited: true,
        },
      };
    });
  }

  function clearResponse() {
    updateAnswer((current) => ({
      ...current,
      [currentQuestion.id]: {
        ...(current[currentQuestion.id] ?? { ...blankAnswer(), visited: true }),
        selectedOptions: [],
        visited: true,
      },
    }));
  }

  function flagAndNext() {
    updateAnswer((current) => ({
      ...current,
      [currentQuestion.id]: {
        ...(current[currentQuestion.id] ?? { ...blankAnswer(), visited: true }),
        markedForReview: true,
        visited: true,
      },
    }));
    goToQuestion(currentQuestionIndex + 1);
  }

  const currentAnswer = normalizeStoredAnswer(answers[currentQuestion.id] ?? { ...blankAnswer(), visited: true });
  const usesMultipleAnswers = currentQuestion.answerPolicy === "MULTIPLE";
  const paletteQuestions = [...questions].sort((left, right) => left.orderIndex - right.orderIndex);
  const isLowTime = remainingSeconds > 0 && remainingSeconds <= 300;

  return (
    <div className="page-grid overflow-hidden bg-[#f4f2ed] text-[#2d241d]">
      <aside className="border-r border-[#d8d1c6] bg-[#f3f0ea] px-4 py-4">
        <div className="rounded-md border border-[#d8d1c6] bg-[#f8f6f1] px-3 py-3 text-[1rem] font-semibold text-[#d7671b] shadow-sm">
          <div className="truncate" title={props.studentName}>
            {props.studentName}
          </div>
        </div>

        <div className="mt-6 rounded-md border border-[#d8d1c6] bg-[#f8f6f1] p-3 shadow-sm">
          <div className="border-b border-[#ef785e] pb-2 text-[1rem] font-semibold text-[#d75d52]">Attempt Status</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="relative flex min-w-0 items-center justify-center rounded-md bg-[#49a84f] px-2 py-3 text-center text-white">
              <span className="text-[0.72rem] font-semibold leading-4">Answered</span>
              <span className="absolute -right-2 -top-2 inline-flex min-w-[1.7rem] items-center justify-center rounded-full bg-white px-1.5 py-0.5 text-[0.72rem] font-bold text-[#d7671b]">
                {counts.answered}
              </span>
            </div>
            <div className="relative flex min-w-0 items-center justify-center rounded-md bg-[#e4aa45] px-2 py-3 text-center text-white">
              <span className="text-[0.72rem] font-semibold leading-4">Flagged</span>
              <span className="absolute -right-2 -top-2 inline-flex min-w-[1.7rem] items-center justify-center rounded-full bg-white px-1.5 py-0.5 text-[0.72rem] font-bold text-[#d7671b]">
                {counts.flagged}
              </span>
            </div>
            <div className="relative flex min-w-0 items-center justify-center rounded-md bg-[#d85b58] px-2 py-3 text-center text-white">
              <span className="text-[0.72rem] font-semibold leading-4">Pending</span>
              <span className="absolute -right-2 -top-2 inline-flex min-w-[1.7rem] items-center justify-center rounded-full bg-white px-1.5 py-0.5 text-[0.72rem] font-bold text-[#d7671b]">
                {counts.pending}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-md border border-[#d8d1c6] bg-[#f8f6f1] p-3 shadow-sm">
          <div className="border-b border-[#d08b37] pb-2 text-[1rem] font-semibold text-[#b46916]">Questions</div>
          <div className="mt-3 max-h-[50vh] overflow-y-auto overflow-x-hidden pr-1">
            <div className="grid grid-cols-5 gap-1.5">
              {paletteQuestions.map((question) => {
                const status = getPaletteStatus(answers[question.id] ?? blankAnswer());

                return (
                  <button
                    key={question.id}
                    className={`palette-button ${question.orderIndex === currentQuestionIndex ? "active" : ""} ${status.toLowerCase().replaceAll("_", "-")}`}
                    onClick={() => goToQuestion(question.orderIndex)}
                    type="button"
                  >
                    {String(question.orderIndex).padStart(2, "0")}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex h-screen flex-col overflow-hidden bg-[#f8f6f1]">
        <div className="flex items-center justify-between border-b border-[#d8d1c6] bg-[#f8f6f1] px-4 py-2.5">
          <div className="text-[0.82rem] text-[#342a22] lg:text-[0.9rem]">
            <span className="font-semibold text-[#d7671b]">Test Name-</span> {props.test.name}
            <span className="ml-3 font-semibold text-[#8a6a52]">ID-</span> {props.test.testCode ?? `TST-${props.test.id.slice(-8).toUpperCase()}`}
          </div>
          <div className="flex items-center gap-3">
            <div className={`text-[1.2rem] font-semibold lg:text-[1.2rem] ${isLowTime ? "text-[#c63f32]" : "text-[#d7671b]"}`}>Time Remaining-</div>
            <div className={`rounded-[0.45rem] border-2 px-3 py-2 text-[1.0rem] font-bold lg:text-[1.4rem] ${isLowTime ? "border-[#c63f32] bg-[#fff1ef] text-[#c63f32]" : "border-[#df7d39] bg-[#fff7f0] text-[#d7671b]"}`}>
              {formatTimer(remainingSeconds)}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {timeWarning ? <div className="mb-4 rounded-md border border-[#efb1aa] bg-[#fff1ef] px-4 py-3 text-sm font-semibold text-[#c63f32]">{timeWarning}</div> : null}
          <div className="flex items-start gap-3">
            <div className="shrink-0 pt-1 text-[0.8rem] font-semibold leading-none text-[#dd504a]">
              Q {String(currentQuestion.orderIndex).padStart(2, "0")} of {String(props.test.totalQuestions).padStart(2, "0")}
            </div>
            <div className="max-w-[900px] text-[0.98rem] leading-7 text-[#2d241d] lg:text-[1.02rem]">
              {currentQuestion.type === "TEXT" ? currentQuestionPrompt : "Image based question"}
            </div>
          </div>

          {currentQuestion.type === "IMAGE" && currentQuestion.imagePath ? (
            <div className="mt-6 max-h-[58vh] overflow-auto rounded-md border border-[#ddd0c3] bg-white p-4">
              <img src={currentQuestion.imagePath} alt={`Question ${currentQuestion.orderIndex}`} className="mx-auto h-auto w-full object-contain" />
            </div>
          ) : null}
          <div className="mt-4 max-w-[760px]">
            <div className="text-[1.15rem] font-semibold text-[#dd504a]">Options :</div>
            {usesMultipleAnswers ? <div className="mt-1 text-[0.76rem] text-[#7a6655]">Select all correct options.</div> : null}
            <div className="mt-2 space-y-3 text-[0.96rem] leading-7 text-[#322920]">
              {(currentQuestion.options ?? fallbackOptions).map((option) => (
                <label key={option.key} className="flex cursor-pointer items-start gap-3">
                  <input
                    type={usesMultipleAnswers ? "checkbox" : "radio"}
                    name={`question-${currentQuestion.id}`}
                    checked={currentAnswer.selectedOptions.includes(option.key)}
                    onChange={() => {
                      if (usesMultipleAnswers) {
                        toggleOption(option.key);
                        return;
                      }

                      selectOption(option.key);
                    }}
                    className="mt-[0.28rem] h-4 w-4"
                  />
                  <div>{option.text}</div>
                </label>
              ))}
            </div>
          </div>

          <button type="button" className="mt-5 text-[0.95rem] text-[#42b3e9] hover:underline" onClick={clearResponse}>
            Clear Response
          </button>

          {tabWarning ? <div className="mt-4 rounded-md border border-[#efc6a5] bg-[#fff4ea] px-4 py-3 text-sm text-[#8a5a31]">{tabWarning}</div> : null}
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-[#d8d1c6] bg-[#efebe5] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button type="button" className="btn-primary min-w-[72px] px-2.5 py-1.5 text-[0.8rem]" onClick={() => goToQuestion(currentQuestionIndex - 1)}>Previous</button>
            <button type="button" className="btn-warning min-w-[72px] px-2.5 py-1.5 text-[0.8rem]" onClick={flagAndNext}>Flag</button>
            <button type="button" className="btn-primary min-w-[72px] px-2.5 py-1.5 text-[0.8rem]" onClick={() => goToQuestion(currentQuestionIndex + 1)}>Next</button>
          </div>
          <button type="button" className="btn-danger min-w-[78px] px-2.5 py-1.5 text-[0.8rem]" onClick={() => setShowSubmitDialog(true)}>End Test</button>
        </div>
      </main>

      {showSubmitDialog ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(35,24,18,0.4)] p-6">
          <div className="panel w-full max-w-xl rounded-[1.4rem] p-7">
            <h2 className="text-3xl font-semibold text-[#2f241c]">Submit Test?</h2>
            <p className="mt-3 text-lg leading-7 text-[#6d5a49]">Review the summary before submitting. Marked-for-review answers remain submitted as selected.</p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="rounded-[1rem] bg-[#effbf0] p-4 text-[#2f241c]">Answered <div className="mt-2 text-3xl font-semibold text-[#30a451]">{counts.answered}</div></div>
              <div className="rounded-[1rem] bg-[#fff7f6] p-4 text-[#2f241c]">Unanswered <div className="mt-2 text-3xl font-semibold text-[#d85b58]">{counts.pending}</div></div>
              <div className="rounded-[1rem] bg-[#faf4ff] p-4 text-[#2f241c]">Marked <div className="mt-2 text-3xl font-semibold text-[#7d57a7]">{counts.flagged}</div></div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="btn-secondary" onClick={() => setShowSubmitDialog(false)}>Cancel</button>
              <button disabled={isSubmitting} type="button" className="btn-danger" onClick={() => void submitAttempt(false)}>
                {isSubmitting ? "Submitting..." : "Confirm Submit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
