import { createHash } from "node:crypto";
import { getAdminDb, hasDbConfig } from "@/lib/db";
import { getStaffIdentity, hasSameOrigin, jsonError, requestBody } from "@/lib/tide";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return jsonError("This request must come from the Resolve It site.", 403);
  const identity = await getStaffIdentity();
  if (!identity) return jsonError("Sign in with TideCloak before applying.", 401);
  if (!identity.email || !identity.emailVerified) return jsonError("Your TideCloak account must have a verified email address.", 403);
  if (!hasDbConfig()) return jsonError("Resolve It is not connected to its database yet.", 503);
  const body = await requestBody(request);
  const required = [body?.name, body?.category, body?.officialEmail, body?.evidencePath];
  if (!required.every(v => typeof v === "string" && v.trim())) return jsonError("Organization name, type, official email, and private evidence upload are required.", 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.officialEmail)) return jsonError("Enter a valid official organization email.", 400);
  const applicantKey = createHash("sha256").update(identity.subject).digest("hex");
  if (typeof body.evidencePath !== "string" || !new RegExp(`^${applicantKey}/[a-f0-9-]{36}\\.(pdf|png|jpg)$`).test(body.evidencePath)) return jsonError("Upload your verification evidence before submitting.", 400);
  const verifiedDomain = identity.email.split("@").pop()?.toLowerCase();
  const officialDomain = body.officialEmail.trim().split("@").pop()?.toLowerCase();
  if (!verifiedDomain || verifiedDomain !== officialDomain) return jsonError("Apply using a TideCloak account verified with the organization’s official email domain.", 400);
  try {
    const db = getAdminDb();
    const { data: existing } = await db.from("organization_applications").select("id").eq("requested_by", identity.subject).in("status", ["pending", "approved"]).maybeSingle();
    if (existing) return jsonError("You already have an active or pending organization application.", 409);
    const { error } = await db.from("organization_applications").insert({ requested_by: identity.subject, verified_email: identity.email, name: body.name.trim().slice(0, 180), category: body.category.trim().slice(0, 80), description: (body.description ?? "").trim().slice(0, 1000), official_email: body.officialEmail.trim().slice(0, 254), evidence_path: body.evidencePath });
    if (error) throw error;
    return Response.json({ submitted: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch { return jsonError("Your application could not be submitted right now.", 503); }
}

export async function GET() {
  const identity = await getStaffIdentity();
  if (!identity) return jsonError("Sign in with TideCloak.", 401);
  if (!hasDbConfig()) return jsonError("Database is not configured.", 503);
  try {
    const { data, error } = await getAdminDb().from("organization_applications").select("id,name,category,description,status,created_at,organization_id").eq("requested_by", identity.subject).order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ applications: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch { return jsonError("Could not load your applications.", 503); }
}
