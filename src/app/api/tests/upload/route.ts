import { NextResponse } from "next/server";
import { AnswerPolicy, Prisma, QuestionType, Subject } from "@prisma/client";
import { z } from "zod";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { createTestFromUploadedQuestions } from "@/lib/test-builder";
import { deleteStoredFile } from "@/lib/storage";
import { adminSubjectValues } from "@/lib/subject-categories";
import { renderPdfToImageQuestions, storeImageQuestionFiles } from "@/lib/uploads";

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

const jsonQuestionSchema = z.object({
  subject: z.enum(adminSubjectValues).optional(),
  chapter: z.string().min(1).optional(),
  prompt: z.string().min(1),
  table: tableSchema.optional(),
  options: z.array(optionSchema).length(4),
  correctAnswers: z.array(z.enum(["A", "B", "C", "D"])).min(1).optional(),
  correctAnswer: z.enum(["A", "B", "C", "D"]).optional(),
  answerPolicy: z.nativeEnum(AnswerPolicy).optional(),
});

const metaSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  durationMinutes: z.coerce.number().min(1),
  correctMarks: z.coerce.number(),
  incorrectMarks: z.coerce.number(),
  unansweredMarks: z.coerce.number(),
  published: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  assignedSection: z.enum(adminSubjectValues),
  pdfAnswerKey: z.string().optional(),
});

export async function POST(request: Request) {
  const uploadedFilePaths: string[] = [];

  try {
    const admin = await getCurrentAdmin();

    if (!admin) {
      return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
    }

    const formData = await request.formData();
    const jsonFile = formData.get("jsonFile");
    const zipFile = formData.get("zipFile");
    const pdfFile = formData.get("pdfFile");

    if (!(jsonFile instanceof File) && !(zipFile instanceof File) && !(pdfFile instanceof File)) {
      return NextResponse.json({ error: "At least one upload file is required." }, { status: 400 });
    }

    const payload = metaSchema.parse({
      name: formData.get("name"),
      description: formData.get("description") || undefined,
      durationMinutes: formData.get("durationMinutes"),
      correctMarks: formData.get("correctMarks"),
      incorrectMarks: formData.get("incorrectMarks"),
      unansweredMarks: formData.get("unansweredMarks"),
      published: formData.get("published") || undefined,
      assignedSection: formData.get("assignedSection"),
      pdfAnswerKey: formData.get("pdfAnswerKey") || undefined,
    });

    const parsedJsonContent = jsonFile instanceof File
      ? JSON.parse(await jsonFile.text())
      : [];

    const parsedJsonRows = jsonFile instanceof File
      ? z.array(jsonQuestionSchema).parse(Array.isArray(parsedJsonContent) ? parsedJsonContent : [parsedJsonContent])
      : [];

    const chapterLabel = payload.name.trim();
    const assignedSubject = payload.assignedSection as Subject;

    const zipRows = zipFile instanceof File
      ? await storeImageQuestionFiles({
          buffer: Buffer.from(await zipFile.arrayBuffer()),
          subject: assignedSubject,
          chapter: chapterLabel,
        })
      : [];

    const pdfRows = pdfFile instanceof File
      ? await renderPdfToImageQuestions({
          buffer: Buffer.from(await pdfFile.arrayBuffer()),
          subject: assignedSubject,
          chapter: chapterLabel,
          answerKey: payload.pdfAnswerKey,
        })
      : [];

    uploadedFilePaths.push(
      ...zipRows.map((row) => row.imagePath),
      ...pdfRows.map((row) => row.imagePath),
    );

    const questionData = [
      ...parsedJsonRows.map((row) => {
        const correctAnswers = row.correctAnswers ?? (row.correctAnswer ? [row.correctAnswer] : []);

        return {
          subject: (row.subject ?? payload.assignedSection) as Subject,
          chapter: row.chapter ?? chapterLabel,
          type: QuestionType.TEXT,
          prompt: row.prompt,
          metadata: row.table ? { table: row.table } : Prisma.JsonNull,
          options: row.options,
          imagePath: null,
          correctAnswers,
          answerPolicy: row.answerPolicy ?? (correctAnswers.length > 1 ? AnswerPolicy.MULTIPLE : AnswerPolicy.SINGLE),
        };
      }),
      ...zipRows.map((row) => ({
        subject: row.subject as Subject,
        chapter: row.chapter,
        type: row.type,
        prompt: row.prompt,
        metadata: Prisma.JsonNull,
        options: row.options ?? Prisma.JsonNull,
        imagePath: row.imagePath,
        correctAnswers: row.correctAnswers,
        answerPolicy: row.correctAnswers.length > 1 ? AnswerPolicy.MULTIPLE : AnswerPolicy.SINGLE,
      })),
      ...pdfRows.map((row) => ({
        subject: row.subject as Subject,
        chapter: row.chapter,
        type: row.type,
        prompt: row.prompt,
        metadata: Prisma.JsonNull,
        options: row.options ?? Prisma.JsonNull,
        imagePath: row.imagePath,
        correctAnswers: row.correctAnswers,
        answerPolicy: row.correctAnswers.length > 1 ? AnswerPolicy.MULTIPLE : AnswerPolicy.SINGLE,
      })),
    ];

    const { createdQuestions, test } = await prisma.$transaction(async (tx) => {
      const createdRows = await tx.question.createManyAndReturn({
        data: questionData,
        select: {
          id: true,
          subject: true,
          chapter: true,
        },
      });

      const createdTest = await createTestFromUploadedQuestions(tx, payload, createdRows);

      return {
        createdQuestions: createdRows,
        test: createdTest,
      };
    }, {
      maxWait: 10_000,
      timeout: 20_000,
    });

    return NextResponse.json({
      message: `Created test ${test.name} with ${createdQuestions.length} uploaded questions.`,
      test,
    });
  } catch (error) {
    await Promise.all(uploadedFilePaths.map((filePath) => deleteStoredFile(filePath).catch(() => undefined)));

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create test from upload." }, { status: 400 });
  }
}
