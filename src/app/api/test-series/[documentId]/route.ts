import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { deleteStoredFile } from "@/lib/storage";

export async function DELETE(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const admin = await getCurrentAdmin();

    if (!admin) {
      return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
    }

    const { documentId } = await params;
    const document = await prisma.testSeriesDocument.delete({ where: { id: documentId } });
    await deleteStoredFile(document.filePath);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete test series PDF." }, { status: 400 });
  }
}