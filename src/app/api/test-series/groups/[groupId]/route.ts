import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const admin = await getCurrentAdmin();

    if (!admin) {
      return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
    }

    const { groupId } = await params;
    await prisma.testSeriesGroup.delete({ where: { id: groupId } });

    return NextResponse.json({ ok: true, message: "Test series group deleted. PDFs are now ungrouped." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete test series group." }, { status: 400 });
  }
}