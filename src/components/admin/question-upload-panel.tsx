"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminSubjectOptions } from "@/lib/subject-categories";

type ChapterSummary = {
  subject: string;
  chapter: string;
};

export function QuestionUploadPanel({ chapters }: { chapters: ChapterSummary[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitForm(endpoint: string, formData: FormData) {
    setIsSubmitting(true);
    setMessage("Uploading...");

    try {
      const response = await fetch(endpoint, { method: "POST", body: formData });
      const payload = await response.json().catch(() => ({} as { error?: string; message?: string }));

      if (!response.ok) {
        throw new Error(payload.error ?? "Upload failed.");
      }

      setMessage(payload.message ?? "Upload complete.");
      router.refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[1rem] border border-[#eadbcd] bg-[#fffaf5] px-4 py-3 text-sm text-[#705e50]">
        <strong className="text-[#c56727]">Question metadata:</strong> every upload stores subject, chapter, question type, and correct answer. ZIP filenames must follow the pattern <span className="font-semibold">q12_B.png</span> or <span className="font-semibold">q12_A_B.png</span> for multi-correct. PDF upload can also take an optional comma-separated answer key like <span className="font-semibold">A,B,C,D</span>.
      </div>

      <section className="panel rounded-[1.2rem] p-5">
        <h3 className="text-xl font-semibold text-[#2f241c]">JSON Upload for Text Questions</h3>
        <p className="mt-2 text-sm leading-6 text-[#6d5a49]">Upload an array of questions with options and answers. Use <span className="font-semibold">correctAnswers</span> like <span className="font-semibold">[&quot;A&quot;, &quot;C&quot;]</span> for multi-correct questions.</p>
        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const wasSuccessful = await submitForm("/api/questions/upload-json", formData);

            if (wasSuccessful) {
              event.currentTarget.reset();
            }
          }}
        >
          <input required type="file" name="file" accept="application/json" className="rounded-lg border border-[#dacdbf] bg-white px-3 py-3" />
          <button disabled={isSubmitting} className="btn-primary w-fit" type="submit">Upload JSON</button>
        </form>
      </section>

      <section className="panel rounded-[1.2rem] p-5">
        <h3 className="text-xl font-semibold text-[#2f241c]">ZIP Upload for Image Questions</h3>
        <form
          className="mt-4 grid gap-4 md:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const wasSuccessful = await submitForm("/api/questions/upload-zip", formData);

            if (wasSuccessful) {
              event.currentTarget.reset();
            }
          }}
        >
          <label className="flex flex-col gap-2 text-sm text-[#705e50]">
            Subject
            <select name="subject" required className="rounded-lg border border-[#dacdbf] bg-white px-3 py-3">
              {adminSubjectOptions.map((subject) => (
                <option key={subject.value} value={subject.value}>{subject.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-[#705e50]">
            Chapter
            <input name="chapter" required placeholder="e.g. Electrostatics" className="rounded-lg border border-[#dacdbf] bg-white px-3 py-3" />
          </label>
          <label className="md:col-span-2 flex flex-col gap-2 text-sm text-[#705e50]">
            ZIP File
            <input required type="file" name="file" accept="application/zip,.zip" className="rounded-lg border border-[#dacdbf] bg-white px-3 py-3" />
          </label>
          <button disabled={isSubmitting} className="btn-primary w-fit" type="submit">Upload ZIP</button>
        </form>
      </section>

      <section className="panel rounded-[1.2rem] p-5">
        <h3 className="text-xl font-semibold text-[#2f241c]">PDF to Image Questions</h3>
        <form
          className="mt-4 grid gap-4 md:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const wasSuccessful = await submitForm("/api/questions/upload-pdf", formData);

            if (wasSuccessful) {
              event.currentTarget.reset();
            }
          }}
        >
          <label className="flex flex-col gap-2 text-sm text-[#705e50]">
            Subject
            <select name="subject" required className="rounded-lg border border-[#dacdbf] bg-white px-3 py-3">
              {adminSubjectOptions.map((subject) => (
                <option key={subject.value} value={subject.value}>{subject.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-[#705e50]">
            Chapter
            <input name="chapter" required placeholder="e.g. Entire Paper 2026" className="rounded-lg border border-[#dacdbf] bg-white px-3 py-3" />
          </label>
          <label className="md:col-span-2 flex flex-col gap-2 text-sm text-[#705e50]">
            Optional Answer Key
            <input name="answerKey" placeholder="A,B,C,D... one answer per PDF page" className="rounded-lg border border-[#dacdbf] bg-white px-3 py-3" />
          </label>
          <label className="md:col-span-2 flex flex-col gap-2 text-sm text-[#705e50]">
            PDF File
            <input required type="file" name="file" accept="application/pdf" className="rounded-lg border border-[#dacdbf] bg-white px-3 py-3" />
          </label>
          <button disabled={isSubmitting} className="btn-primary w-fit" type="submit">Convert PDF</button>
        </form>
      </section>

      <section className="panel rounded-[1.2rem] p-5">
        <h3 className="text-xl font-semibold text-[#2f241c]">Existing Chapters</h3>
        <div className="mt-4 flex flex-wrap gap-2">
          {chapters.map((chapter) => (
            <span key={`${chapter.subject}-${chapter.chapter}`} className="rounded-full bg-[#f3ece3] px-3 py-1 text-sm text-[#6f5d4d]">
              {chapter.subject} · {chapter.chapter}
            </span>
          ))}
        </div>
      </section>

      {message ? <div className="rounded-[1rem] border border-[#e0d2c4] bg-white px-4 py-3 text-sm text-[#6d5a49]">{message}</div> : null}
    </div>
  );
}
