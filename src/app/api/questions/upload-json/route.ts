import { NextResponse } from "next/server";
import { AnswerPolicy, QuestionType, Subject } from "@prisma/client";
import { z } from "zod";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { adminSubjectValues } from "@/lib/subject-categories";

export const runtime = "nodejs";
export const maxDuration = 60;

const optionSchema = z.object({
  key: z.enum(["A", "B", "C", "D"]),
  text: z.string().min(1),
});

const questionSchema = z.object({
  subject: z.enum(adminSubjectValues),
  chapter: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(optionSchema).length(4),
  correctAnswers: z.array(z.enum(["A", "B", "C", "D"])) .min(1).optional(),
  correctAnswer: z.enum(["A", "B", "C", "D"]).optional(),
  answerPolicy: z.nativeEnum(AnswerPolicy).optional(),
});

export async function POST(request: Request) {
  try {
    const admin = await getCurrentAdmin();

    if (!admin) {
      return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "JSON file is required." }, { status: 400 });
    }

    const content = JSON.parse(await file.text());
    const rows = z.array(questionSchema).parse(content);

    await prisma.question.createMany({
      data: rows.map((row) => {
        const correctAnswers = row.correctAnswers ?? (row.correctAnswer ? [row.correctAnswer] : []);

        return {
          subject: row.subject as Subject,
          chapter: row.chapter,
          type: QuestionType.TEXT,
          prompt: row.prompt,
          options: row.options,
          correctAnswers,
          answerPolicy: row.answerPolicy ?? (correctAnswers.length > 1 ? AnswerPolicy.MULTIPLE : AnswerPolicy.SINGLE),
        };
      }),
    });

    return NextResponse.json({ message: `Uploaded ${rows.length} text questions.` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid JSON upload." }, { status: 400 });
  }
}
