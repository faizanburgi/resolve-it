import { randomBytes, scryptSync } from "node:crypto";
import { getAdminDb, hasDbConfig } from "@/lib/db";
import { jsonError, requestBody } from "@/lib/tide";
import { consumePublicLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasDbConfig()) return jsonError("Resolve It is not connected to its database yet.", 503);
  const body = await requestBody(request);
  if (!body || typeof body !== "object") return jsonError("Please complete the form and try again.", 400);
  const { organizationId, departmentId, category, subject, body: detail, contactName, contactEmail } = body;
  if (![organizationId, category, subject, detail].every(v => typeof v === "string" && v.trim())) return jsonError("Organization, category, summary, and description are required.", 400);
  if (subject.length > 120 || detail.length < 10 || detail.length > 5000) return jsonError("Please keep the summary under 120 characters and description between 10 and 5,000 characters.", 400);
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return jsonError("Enter a valid email address or leave it blank.", 400);
  try {
    const db = getAdminDb();
    if (!await consumePublicLimit(request, 5)) return jsonError("Too many submissions from this connection. Please wait and try again.", 429);
    const { data: org } = await db.from("organizations").select("id").eq("id", organizationId).eq("status", "approved").maybeSingle();
    if (!org) return jsonError("Choose an organization from the approved directory.", 400);
    if (departmentId) {
      const { data: dep } = await db.from("departments").select("id").eq("id", departmentId).eq("organization_id", organizationId).eq("active", true).maybeSingle();
      if (!dep) return jsonError("That department is not available for this organization.", 400);
    }
    const code = randomBytes(12).toString("hex").toUpperCase().match(/.{1,4}/g)!.join("-");
    const secret = randomBytes(32).toString("base64url");
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(secret, salt, 64).toString("hex");
    const { error } = await db.rpc("create_case_with_contact", { p_organization_id: organizationId, p_department_id: departmentId || null, p_category: category.trim().slice(0, 48), p_subject: subject.trim(), p_body: detail.trim(), p_code: code, p_secret_salt: salt, p_secret_hash: hash, p_contact_name: typeof contactName === "string" ? contactName.trim().slice(0, 120) : "", p_contact_email: typeof contactEmail === "string" ? contactEmail.trim().slice(0, 254) : "" });
    if (error) throw error;
    return Response.json({ code, secret }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch { return jsonError("We could not submit your concern right now. Please try again shortly.", 503); }
}
