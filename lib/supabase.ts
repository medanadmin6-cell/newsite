import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client, using the service-role key. This key bypasses
 * row-level security, so it must never reach the browser: every read and write
 * in this app happens inside a route handler or a server component.
 *
 * Returns null when the environment is not configured, so the fixture feed can
 * still degrade to upstream-only rather than failing outright.
 */
let cached: SupabaseClient | null | undefined;

export function db(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.warn("[supabase] not configured — database features are disabled");
    cached = null;
    return cached;
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Same client, but throws where the caller genuinely cannot proceed without it. */
export function dbOrThrow(): SupabaseClient {
  const client = db();
  if (!client) throw new Error("Database is not configured");
  return client;
}
