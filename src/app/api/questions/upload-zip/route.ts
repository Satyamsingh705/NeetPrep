import { NextResponse } from "next/server";
import { AnswerPolicy, Subject } from "@prisma/client";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { storeImageQuestionFiles } from "@/lib/uploads";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    if (!(file instanceof File) || typeof subject !== "string" || typeof chapter !== "string") {
      return NextResponse.json({ error: "ZIP file, subject, and chapter are required." }, { status: 400 });
    }

    const rows = await storeImageQuestionFiles({
      buffer: Buffer.from(await file.arrayBuffer()),
      subject,
      chapter,
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

    return NextResponse.json({ message: `Uploaded ${rows.length} image questions.` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ZIP upload failed." }, { status: 400 });
  }
}
