import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseStorageEnabled() {
  return Boolean(supabaseUrl && supabaseServiceRoleKey);
}

export function getSupabaseStorageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET ?? "questions";
}

export function getSupabaseServerClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getSupabaseStoragePublicUrl(objectPath: string) {
  const client = getSupabaseServerClient();
  const { data } = client.storage.from(getSupabaseStorageBucket()).getPublicUrl(objectPath);
  return data.publicUrl;
}
