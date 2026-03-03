import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";

const SESSION_CACHE_MS = 60_000; // 60s to reduce auth API calls and avoid rate limit

let sessionCache: { session: Session | null; timestamp: number } | null = null;
let pendingFetch: Promise<Session | null> | null = null;

let clientInstance: SupabaseClient | null = null;

export function createClient() {
  if (typeof window !== "undefined" && clientInstance) return clientInstance;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or Supabase anon key");
  const client = createSupabaseClient(url, key);
  if (typeof window !== "undefined") clientInstance = client;
  return client;
}

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const msg = "message" in err ? String((err as { message?: string }).message) : "";
  const status = "status" in err ? (err as { status?: number }).status : undefined;
  const code = "code" in err ? String((err as { code?: string }).code) : "";
  return (
    msg.toLowerCase().includes("rate limit") ||
    status === 429 ||
    code === "over_request_rate_limit"
  );
}

function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const msg = "message" in err ? String((err as { message?: string }).message) : "";
  return (
    msg === "Failed to fetch" ||
    msg.toLowerCase().includes("failed to fetch") ||
    msg.toLowerCase().includes("network error") ||
    msg.toLowerCase().includes("load failed")
  );
}

/** Get session with cache and rate-limit handling. Falls back to cached session on rate limit. */
export async function getCachedSession(): Promise<Session | null> {
  const now = Date.now();
  if (sessionCache && now - sessionCache.timestamp < SESSION_CACHE_MS) {
    return sessionCache.session;
  }
  if (pendingFetch) {
    return pendingFetch;
  }
  const doFetch = async (): Promise<Session | null> => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      sessionCache = { session, timestamp: Date.now() };
      return session;
    } catch (err) {
      if (isRateLimitError(err)) {
        if (sessionCache) {
          // Extend cache so we don't retry immediately
          sessionCache = { ...sessionCache, timestamp: Date.now() };
          return sessionCache.session;
        }
        return null;
      }
      if (isNetworkError(err)) {
        if (sessionCache) return sessionCache.session;
        return null;
      }
      throw err;
    } finally {
      pendingFetch = null;
    }
  };
  pendingFetch = doFetch();
  return pendingFetch;
}

export function clearSessionCache() {
  sessionCache = null;
  clientInstance = null;
}

const COVERS_BUCKET = "covers";

/** Upload a cover image to Supabase Storage. Requires a bucket named "covers" with public read access. */
export async function uploadCoverImage(
  file: File
): Promise<{ url: string | null; error: Error | null }> {
  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { data, error } = await supabase.storage
    .from(COVERS_BUCKET)
    .upload(path, file, { upsert: false });
  if (error) return { url: null, error };
  const {
    data: { publicUrl },
  } = supabase.storage.from(COVERS_BUCKET).getPublicUrl(data.path);
  return { url: publicUrl, error: null };
}

