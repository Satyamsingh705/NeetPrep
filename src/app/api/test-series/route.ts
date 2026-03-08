import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { storeTestSeriesPdf } from "@/lib/uploads";

const payloadSchema = z.object({
  title: z.string().trim().min(1),
  answerKeyTitle: z.string().trim().optional().or(z.literal("")),
  groupTitle: z.string().trim().optional().or(z.literal("")),
  groupDescription: z.string().trim().optional().or(z.literal("")),
  groupOrderIndex: z.coerce.number().int().min(0).optional(),
  orderIndex: z.coerce.number().int().min(0).optional(),
  answerKeyOrderIndex: z.coerce.number().int().min(0).optional(),
});

export async function POST(request: Request) {
  try {
    const admin = await getCurrentAdmin();

    if (!admin) {
      return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const answerKeyFile = formData.get("answerKeyFile");
    const payload = payloadSchema.parse({
      title: formData.get("title"),
      answerKeyTitle: formData.get("answerKeyTitle") || undefined,
      groupTitle: formData.get("groupTitle") || undefined,
      groupDescription: formData.get("groupDescription") || undefined,
      groupOrderIndex: formData.get("groupOrderIndex") || undefined,
      orderIndex: formData.get("orderIndex") || undefined,
      answerKeyOrderIndex: formData.get("answerKeyOrderIndex") || undefined,
    });

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Title and PDF file are required." }, { status: 400 });
    }

    if (answerKeyFile !== null && !(answerKeyFile instanceof File)) {
      return NextResponse.json({ error: "Invalid answer key file." }, { status: 400 });
    }

    const storedFile = await storeTestSeriesPdf({
      buffer: Buffer.from(await file.arrayBuffer()),
      originalFileName: file.name,
    });

    const storedAnswerKeyFile = answerKeyFile instanceof File
      ? await storeTestSeriesPdf({
          buffer: Buffer.from(await answerKeyFile.arrayBuffer()),
          originalFileName: answerKeyFile.name,
        })
      : null;

    const normalizedGroupTitle = payload.groupTitle?.trim();
    const existingGroup = normalizedGroupTitle
      ? await prisma.testSeriesGroup.findFirst({
          where: { title: normalizedGroupTitle },
        })
      : null;

    const group = normalizedGroupTitle
      ? existingGroup
        ? await prisma.testSeriesGroup.update({
            where: { id: existingGroup.id },
            data: {
              description: payload.groupDescription || null,
              orderIndex: payload.groupOrderIndex ?? 0,
            },
          })
        : await prisma.testSeriesGroup.create({
            data: {
              title: normalizedGroupTitle,
              description: payload.groupDescription || null,
              orderIndex: payload.groupOrderIndex ?? 0,
            },
          })
      : null;

    const documents = await prisma.$transaction(async (tx) => {
      const createdDocuments = [];

      createdDocuments.push(await tx.testSeriesDocument.create({
        data: {
          title: payload.title,
          fileName: storedFile.fileName,
          filePath: storedFile.filePath,
          orderIndex: payload.orderIndex ?? 0,
          groupId: group?.id,
        },
      }));

      if (storedAnswerKeyFile) {
        createdDocuments.push(await tx.testSeriesDocument.create({
          data: {
            title: payload.answerKeyTitle?.trim() || `${payload.title} Answer Key`,
            fileName: storedAnswerKeyFile.fileName,
            filePath: storedAnswerKeyFile.filePath,
            orderIndex: payload.answerKeyOrderIndex ?? payload.orderIndex ?? 0,
            groupId: group?.id,
          },
        }));
      }

      return createdDocuments;
    });

    return NextResponse.json({ ok: true, documents, message: storedAnswerKeyFile ? "Test series PDF and answer key uploaded." : "Test series PDF uploaded." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to upload test series PDF." }, { status: 400 });
  }
}