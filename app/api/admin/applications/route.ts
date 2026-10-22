import { getAdminDb, hasDbConfig } from "@/lib/db";
import { getStaffIdentity, hasSameOrigin, jsonError, requestBody } from "@/lib/tide";

export const runtime = "nodejs";

export async function GET() {
  const admin = await getStaffIdentity(["platform-admin"]);
  if (!admin) return jsonError("Platform administrator access is required.", 403);
  if (!hasDbConfig()) return jsonError("Database is not configured.", 503);
  try {
    const db = getAdminDb();
    const { data, error } = await db.from("organization_applications").select("id,name,category,description,verified_email,official_email,evidence_path,status,created_at").eq("status", "pending").order("created_at", { ascending: true });
    if (error) throw error;
    const applications = await Promise.all((data ?? []).map(async application => {
      const { data: signed, error: signedError } = await db.storage.from("organization-evidence").createSignedUrl(application.evidence_path, 300);
      if (signedError) throw signedError;
      const { evidence_path: _privatePath, ...visible } = application;
      return { ...visible, evidenceUrl: signed.signedUrl };
    }));
    return Response.json({ applications }, { headers: { "Cache-Control": "no-store" } });
  } catch { return jsonError("Could not load applications.", 503); }
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return jsonError("This request must come from the Resolve It site.", 403);
  const admin = await getStaffIdentity(["platform-admin"]);
  if (!admin) return jsonError("Platform administrator access is required.", 403);
  if (!hasDbConfig()) return jsonError("Database is not configured.", 503);
  const body = await requestBody(request);
  if (typeof body?.applicationId !== "string" || !["approve", "reject"].includes(body?.decision)) return jsonError("Choose an application and an approval decision.", 400);
  const db = getAdminDb();
  const { data: application, error: readError } = await db.from("organization_applications").select("*").eq("id", body.applicationId).eq("status", "pending").maybeSingle();
  if (readError) return jsonError("Could not read application.", 503);
  if (!application) return jsonError("Application is no longer pending.", 404);
  if (body.decision === "reject") {
    const { error } = await db.from("organization_applications").update({ status: "rejected", decision_note: String(body.note ?? "").slice(0, 1000), decided_at: new Date().toISOString(), decided_by: admin.subject }).eq("id", application.id).eq("status", "pending");
    if (error) return jsonError("Could not record the decision.", 503);
    return Response.json({ decided: true });
  }
  const { data: organizationId, error } = await db.rpc("approve_organization_application", { p_application_id: application.id, p_admin_subject: admin.subject, p_note: String(body.note ?? "").slice(0, 1000) });
  if (error || !organizationId) return jsonError("Could not approve this application. It may already have been reviewed.", 409);
  return Response.json({ decided: true, organizationId });
}
