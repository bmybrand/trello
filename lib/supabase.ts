import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";

const SESSION_CACHE_MS = 1_800_000; // 15 min - avoid auth API rate limit
const RATE_LIMIT_BACKOFF_MS = 3_600_000; // 30 min backoff after rate limit

let sessionCache: { session: Session | null; timestamp: number } | null = null;
let pendingFetch: Promise<Session | null> | null = null;
let rateLimitedUntil = 0; // don't call auth API until this time

let clientInstance: SupabaseClient | null = null;

const isBrowser = typeof window !== "undefined";
let createClientCallCount = 0;
let createClientNewCount = 0;

export function createClient() {
  createClientCallCount++;
  if (isBrowser && clientInstance) {
    if (createClientCallCount <= 2 || createClientCallCount % 100 === 0) {
      console.log("[Supabase] createClient() cached (call #" + createClientCallCount + ")");
    }
    return clientInstance;
  }
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or Supabase anon key");
  createClientNewCount++;
  console.warn(
    "[Supabase] createClient() NEW instance (new #" + createClientNewCount + ", total #" + createClientCallCount + ")"
  );
  const client = createSupabaseClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  if (isBrowser) clientInstance = client;
  return client;
}

/** Server-side only. Uses service role key to bypass RLS. For API routes (e.g. file upload). */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const msg = "message" in err ? String((err as { message?: string }).message) : "";
  const name = "name" in err ? String((err as { name?: string }).name) : "";
  const status = "status" in err ? (err as { status?: number }).status : undefined;
  const code = "code" in err ? String((err as { code?: string }).code) : "";
  return (
    msg.toLowerCase().includes("rate limit") ||
    name === "AuthApiError" && msg.toLowerCase().includes("rate") ||
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

/** When rate limited with no cache (e.g. after reload), try to restore session from localStorage so reload doesn't log user out. */
function getSessionFromLocalStorage(): Session | null {
  if (!isBrowser || typeof localStorage === "undefined") return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.endsWith("-auth-token")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const data = JSON.parse(raw) as { current_session?: Session; session?: Session };
      const session = data?.current_session ?? data?.session ?? null;
      if (session?.user) return session as Session;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

/** Get session with cache and rate-limit handling. Avoids auth API when rate limited. */
export async function getCachedSession(): Promise<Session | null> {
  const now = Date.now();
  if (now < rateLimitedUntil) {
    if (sessionCache) return sessionCache.session;
    if (isBrowser) {
      const fromStorage = getSessionFromLocalStorage();
      if (fromStorage) {
        sessionCache = { session: fromStorage, timestamp: Date.now() };
        return fromStorage;
      }
    }
    return null;
  }
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
        rateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
        if (sessionCache) {
          sessionCache = { ...sessionCache, timestamp: Date.now() };
          if (isBrowser) console.warn("[Supabase] Rate limit; using cached session for 1 hour");
          return sessionCache.session;
        }
        const fromStorage = getSessionFromLocalStorage();
        if (fromStorage) {
          sessionCache = { session: fromStorage, timestamp: Date.now() };
          if (isBrowser) console.warn("[Supabase] Rate limit; restored session from localStorage");
          return fromStorage;
        }
        if (isBrowser) console.warn("[Supabase] Rate limit; no cached session");
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

/** Get session with one retry after delay. Use on initial load so session can rehydrate from storage. */
export async function getSessionWithRetry(retryDelayMs = 400): Promise<Session | null> {
  let session = await getCachedSession();
  if (session?.user) return session;
  if (retryDelayMs > 0 && isBrowser) {
    await new Promise((r) => setTimeout(r, retryDelayMs));
    session = await getCachedSession();
  }
  return session ?? null;
}

export function clearSessionCache() {
  sessionCache = null;
  rateLimitedUntil = 0;
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

