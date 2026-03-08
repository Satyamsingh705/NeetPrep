import { NextResponse } from "next/server";
import { submitAttempt } from "@/lib/data";
import { getCurrentStudentRecord } from "@/lib/student-auth";

export const runtime = "nodejs";
export const preferredRegion = "bom1";

async function handleSubmit(request: Request, params: Promise<{ attemptId: string }>) {
  try {
    const { attemptId } = await params;
    const student = await getCurrentStudentRecord();

    if (!student) {
      return NextResponse.json({ error: "Student login required." }, { status: 401 });
    }

    const url = new URL(request.url);
    const autoSubmitted = url.searchParams.get("auto") === "1";
    await submitAttempt(attemptId, autoSubmitted, student.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to submit attempt." }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  return handleSubmit(request, params);
}
