import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getAdminDb() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!configuredUrl || !key) throw new Error("Database is not configured. Set the Supabase URL and server-only service role key.");
  // The Supabase SDK expects the project root URL. Tolerate values copied from
  // the REST API docs (which append /rest/v1) to avoid breaking deployments.
  const url = configuredUrl.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
  if (!client) client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export function hasDbConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
