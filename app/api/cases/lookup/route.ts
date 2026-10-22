import { timingSafeEqual, scryptSync } from "node:crypto";
import { getAdminDb, hasDbConfig } from "@/lib/db";
import { jsonError, requestBody } from "@/lib/tide";
import { consumePublicLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasDbConfig()) return jsonError("Case tracking is not configured yet.", 503);
  const body = await requestBody(request);
  if (typeof body?.code !== "string" || body.code.length > 64 || typeof body?.secret !== "string" || body.secret.length < 32 || body.secret.length > 128) return jsonError("Enter the case code and secret.", 400);
  try {
    if (!await consumePublicLimit(request, 30)) return jsonError("Too many attempts. Please wait and try again.", 429);
    const db = getAdminDb();
    const { data: record, error } = await db.from("cases").select("id,code,secret_salt,secret_hash,subject,category,status,created_at").eq("code", body.code.trim().toUpperCase()).maybeSingle();
    if (error) throw error;
    if (!record) return jsonError("Case code or secret is incorrect.", 404);
    const candidate = scryptSync(body.secret, record.secret_salt, 64);
    if (!timingSafeEqual(candidate, Buffer.from(record.secret_hash, "hex"))) return jsonError("Case code or secret is incorrect.", 404);
    const { data: updates, error: updateError } = await db.from("case_events").select("event_type,public_message,created_at").eq("case_id", record.id).eq("visible_to_submitter", true).order("created_at", { ascending: true });
    if (updateError) throw updateError;
    const { data: messages, error: messagesError } = await db.from("case_messages").select("sender_kind,message,created_at").eq("case_id", record.id).order("created_at", { ascending: true });
    if (messagesError) throw messagesError;
    return Response.json({ case: { subject: record.subject, category: record.category, status: record.status, updates: (updates ?? []).map(u => ({ status: u.event_type, message: u.public_message, created_at: u.created_at })), messages: messages ?? [] } }, { headers: { "Cache-Control": "no-store" } });
  } catch { return jsonError("We could not open the private case inbox right now.", 503); }
}
