import { timingSafeEqual, scryptSync } from "node:crypto";
import { getAdminDb, hasDbConfig } from "@/lib/db";
import { jsonError, requestBody } from "@/lib/tide";
import { consumePublicLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasDbConfig()) return jsonError("Case tracking is not configured yet.", 503);
  const body = await requestBody(request);
  if (typeof body?.code !== "string" || body.code.length > 64 || typeof body?.secret !== "string" || body.secret.length < 32 || body.secret.length > 128 || typeof body?.message !== "string" || body.message.trim().length < 1 || body.message.length > 3000) return jsonError("Enter your case credentials and a reply under 3,000 characters.", 400);
  try {
    if (!await consumePublicLimit(request, 10)) return jsonError("Too many replies from this connection. Please wait and try again.", 429);
    const db = getAdminDb();
    const { data: record } = await db.from("cases").select("id,secret_salt,secret_hash").eq("code", body.code.trim().toUpperCase()).maybeSingle();
    if (!record) return jsonError("Case code or secret is incorrect.", 404);
    const candidate = scryptSync(body.secret, record.secret_salt, 64);
    if (!timingSafeEqual(candidate, Buffer.from(record.secret_hash, "hex"))) return jsonError("Case code or secret is incorrect.", 404);
    const { error } = await db.rpc("append_submitter_reply", { p_case_id: record.id, p_message: body.message.trim() });
    if (error) throw error;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return jsonError("Your reply could not be sent. Please try again shortly.", 503); }
}
