import { promises as fs } from "node:fs";
import path from "node:path";
import { del, put } from "@vercel/blob";
import {
  getSupabaseServerClient,
  getSupabaseStorageBucket,
  getSupabaseStoragePublicUrl,
  isSupabaseStorageEnabled,
} from "@/lib/supabase";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const PUBLIC_UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");

function isBlobStorageEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function ensurePersistentStorageConfigured() {
  if (isSupabaseStorageEnabled() || isBlobStorageEnabled()) {
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Production uploads require Supabase Storage or Vercel Blob. Local filesystem storage is not supported in production.");
  }
}

function getSupabaseObjectPath(filePath: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;

  if (!supabaseUrl) {
    return null;
  }

  try {
    const parsedFileUrl = new URL(filePath);
    const parsedSupabaseUrl = new URL(supabaseUrl);

    if (parsedFileUrl.origin !== parsedSupabaseUrl.origin) {
      return null;
    }

    const pathPrefix = `/storage/v1/object/public/${getSupabaseStorageBucket()}/`;

    if (!parsedFileUrl.pathname.startsWith(pathPrefix)) {
      return null;
    }

    return decodeURIComponent(parsedFileUrl.pathname.slice(pathPrefix.length));
  } catch {
    return null;
  }
}

export function buildUploadPath(...parts: string[]) {
  return path.posix.join("uploads", ...parts);
}

export async function storeUpload(params: {
  relativePath: string;
  body: Buffer;
  contentType?: string;
}) {
  ensurePersistentStorageConfigured();

  if (isSupabaseStorageEnabled()) {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.storage.from(getSupabaseStorageBucket()).upload(params.relativePath, params.body, {
      contentType: params.contentType,
      upsert: true,
    });

    if (error) {
      throw new Error(`Supabase upload failed: ${error.message}`);
    }

    return getSupabaseStoragePublicUrl(params.relativePath);
  }

  if (isBlobStorageEnabled()) {
    const blob = await put(params.relativePath, params.body, {
      access: "public",
      addRandomSuffix: false,
      contentType: params.contentType,
    });

    return blob.url;
  }

  const absolutePath = path.join(PUBLIC_DIR, params.relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, params.body);
  return `/${params.relativePath}`;
}

export async function deleteStoredFile(filePath: string) {
  if (/^https?:\/\//i.test(filePath)) {
    const supabaseObjectPath = getSupabaseObjectPath(filePath);

    if (supabaseObjectPath && isSupabaseStorageEnabled()) {
      const supabase = getSupabaseServerClient();
      const { error } = await supabase.storage.from(getSupabaseStorageBucket()).remove([supabaseObjectPath]);

      if (error) {
        throw new Error(`Supabase delete failed: ${error.message}`);
      }

      return;
    }

    if (isBlobStorageEnabled()) {
      await del(filePath);
    }

    return;
  }

  const normalizedPath = filePath.replace(/^\//, "");
  const absolutePath = path.join(PUBLIC_DIR, normalizedPath);

  if (!absolutePath.startsWith(PUBLIC_UPLOAD_DIR)) {
    throw new Error("Refusing to delete file outside upload directory.");
  }

  await fs.rm(absolutePath, { force: true });
}
