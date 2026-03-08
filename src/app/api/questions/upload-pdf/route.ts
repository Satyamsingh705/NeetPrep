import { NextResponse } from "next/server";
import { AnswerPolicy, Subject } from "@prisma/client";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { renderPdfToImageQuestions } from "@/lib/uploads";

export async function POST(request: Request) {
  try {
    const admin = await getCurrentAdmin();

    if (!admin) {
      return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const subject = formData.get("subject");
    const chapter = formData.get("chapter");
    const answerKey = formData.get("answerKey");

    if (!(file instanceof File) || typeof subject !== "string" || typeof chapter !== "string") {
      return NextResponse.json({ error: "PDF file, subject, and chapter are required." }, { status: 400 });
    }

    const rows = await renderPdfToImageQuestions({
      buffer: Buffer.from(await file.arrayBuffer()),
      subject,
      chapter,
      answerKey: typeof answerKey === "string" ? answerKey : undefined,
    });

    await prisma.question.createMany({
      data: rows.map((row) => ({
        subject: row.subject as Subject,
        chapter: row.chapter,
        type: row.type,
        prompt: row.prompt,
        ...(row.options ? { options: row.options } : {}),
        imagePath: row.imagePath,
        correctAnswers: row.correctAnswers,
        answerPolicy: row.correctAnswers.length > 1 ? AnswerPolicy.MULTIPLE : AnswerPolicy.SINGLE,
      })),
    });

    return NextResponse.json({ message: `Converted ${rows.length} PDF pages into image questions.` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PDF conversion failed." }, { status: 400 });
  }
}
