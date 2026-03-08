import path from "node:path";
import { randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { OptionKey } from "@/lib/types";
import { buildUploadPath, storeUpload } from "@/lib/storage";

type ZipEntry = AdmZip.IZipEntry;

class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");

    return { canvas, context };
  }

  reset(target: ReturnType<NodeCanvasFactory["create"]>, width: number, height: number) {
    target.canvas.width = width;
    target.canvas.height = height;
  }

  destroy(target: ReturnType<NodeCanvasFactory["create"]>) {
    target.canvas.width = 0;
    target.canvas.height = 0;
  }
}

function parseAnswerKey(value: string): OptionKey[] {
  return value
    .split(/[,|\s]+/)
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry): entry is OptionKey => ["A", "B", "C", "D"].includes(entry));
}

export function parseImageFilename(fileName: string) {
  const normalized = path.parse(fileName).name;
  const match = normalized.match(/^q(\d+)_([A-D])(?:_([A-D](?:[-_][A-D])*))?$/i);

  if (!match) {
    return null;
  }

  const questionNumber = Number(match[1]);
  const primaryAnswer = match[2].toUpperCase();
  const extraAnswers = match[3] ? parseAnswerKey(match[3].replaceAll("-", ",").replaceAll("_", ",")) : [];

  return {
    questionNumber,
    correctAnswers: Array.from(new Set([primaryAnswer, ...extraAnswers])) as OptionKey[],
  };
}

export async function storeImageQuestionFiles(params: {
  buffer: Buffer;
  subject: string;
  chapter: string;
}) {
  const zip = new AdmZip(params.buffer);
  const chapterSlug = params.chapter.toLowerCase().replace(/\s+/g, "-");
  const imageEntries = zip
    .getEntries()
    .filter(
      (entry: ZipEntry) =>
        !entry.isDirectory
        && !entry.entryName.startsWith("__MACOSX/")
        && !path.basename(entry.entryName).startsWith("._")
        && /\.(png|jpe?g|webp)$/i.test(entry.entryName),
    );

  if (imageEntries.length === 0) {
    throw new Error("No valid image question files found in ZIP.");
  }

  return Promise.all(
    imageEntries.map(async (entry: ZipEntry) => {
      const parsed = parseImageFilename(path.basename(entry.entryName));

      if (!parsed) {
        throw new Error(`Invalid image filename: ${entry.entryName}. Expected q<number>_<answer>.png`);
      }

      const extension = path.extname(entry.entryName).toLowerCase();
      const storedName = `${randomUUID()}${extension}`;
      const storedRelativePath = buildUploadPath(
        params.subject.toLowerCase(),
        chapterSlug,
        storedName,
      );

      const imagePath = await storeUpload({
        relativePath: storedRelativePath,
        body: entry.getData(),
      });

      return {
        subject: params.subject,
        chapter: params.chapter,
        type: "IMAGE" as const,
        prompt: null,
        options: null,
        imagePath,
        correctAnswers: parsed.correctAnswers,
      };
    }),
  );
}

export async function renderPdfToImageQuestions(params: {
  buffer: Buffer;
  subject: string;
  chapter: string;
  answerKey?: string;
}) {
  const chapterSlug = params.chapter.toLowerCase().replace(/\s+/g, "-");
  const document = await pdfjsLib.getDocument({ data: new Uint8Array(params.buffer), useWorkerFetch: false }).promise;
  const suppliedAnswers = params.answerKey ? params.answerKey.split(/[\s,]+/).map((entry) => entry.trim().toUpperCase()) : [];
  const canvasFactory = new NodeCanvasFactory();

  const rows = [] as Array<{
    subject: string;
    chapter: string;
    type: "IMAGE";
    prompt: null;
    options: null;
    imagePath: string;
    correctAnswers: OptionKey[];
  }>;

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.6 });
    const nodeCanvas = canvasFactory.create(viewport.width, viewport.height);

    await page.render({
      canvas: nodeCanvas.canvas as never,
      canvasContext: nodeCanvas.context as never,
      viewport,
    }).promise;

    const fileName = `${randomUUID()}.png`;
    const relativePath = buildUploadPath(
      params.subject.toLowerCase(),
      chapterSlug,
      "pdf-pages",
      fileName,
    );

    const imagePath = await storeUpload({
      relativePath,
      body: nodeCanvas.canvas.toBuffer("image/png"),
      contentType: "image/png",
    });
    canvasFactory.destroy(nodeCanvas);

    const answer = suppliedAnswers[pageNumber - 1];

    rows.push({
      subject: params.subject,
      chapter: params.chapter,
      type: "IMAGE",
      prompt: null,
      options: null,
      imagePath,
      correctAnswers: ["A", "B", "C", "D"].includes(answer) ? [answer as OptionKey] : [],
    });
  }

  return rows;
}

export async function storeTestSeriesPdf(params: {
  buffer: Buffer;
  originalFileName: string;
}) {
  const extension = path.extname(params.originalFileName).toLowerCase() || ".pdf";
  const storedName = `${randomUUID()}${extension}`;
  const relativePath = buildUploadPath("test-series", storedName);
  const filePath = await storeUpload({
    relativePath,
    body: params.buffer,
    contentType: "application/pdf",
  });

  return {
    fileName: storedName,
    filePath,
  };
}
