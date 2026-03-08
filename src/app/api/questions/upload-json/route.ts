import { NextResponse } from "next/server";
import { AnswerPolicy, Prisma, QuestionType, Subject } from "@prisma/client";
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

const tableSchema = z.object({
  caption: z.string().min(1).optional(),
  headers: z.array(z.string()).min(1).optional(),
  rows: z.array(z.array(z.string()).min(1)).min(1),
}).superRefine((table, context) => {
  const expectedColumnCount = table.headers?.length ?? table.rows[0]?.length ?? 0;

  if (expectedColumnCount === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Table must have at least one column." });
    return;
  }

  table.rows.forEach((row, index) => {
    if (row.length !== expectedColumnCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Table row ${index + 1} must contain ${expectedColumnCount} columns.`,
      });
    }
  });
});

const questionSchema = z.object({
  subject: z.enum(adminSubjectValues),
  chapter: z.string().min(1),
  prompt: z.string().min(1),
  table: tableSchema.optional(),
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
    const normalizedContent = Array.isArray(content) ? content : [content];
    const rows = z.array(questionSchema).parse(normalizedContent);

    await prisma.question.createMany({
      data: rows.map((row) => {
        const correctAnswers = row.correctAnswers ?? (row.correctAnswer ? [row.correctAnswer] : []);

        return {
          subject: row.subject as Subject,
          chapter: row.chapter,
          type: QuestionType.TEXT,
          prompt: row.prompt,
          metadata: row.table ? { table: row.table } : Prisma.JsonNull,
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
