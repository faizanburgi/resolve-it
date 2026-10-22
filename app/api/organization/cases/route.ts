import { getAdminDb, hasDbConfig } from "@/lib/db";
import { getStaffIdentity, hasSameOrigin, jsonError } from "@/lib/tide";

export async function GET(request: Request) {
  const identity = await getStaffIdentity();
  if (!identity) return jsonError("Sign in with TideCloak.", 401);
  if (!hasDbConfig()) return jsonError("Database is not configured.", 503);
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("organizationId");
  if (!orgId) return jsonError("Select an organization workspace.", 400);
  try {
    const db = getAdminDb();
    const { data: member } = await db.from("organization_memberships").select("role").eq("organization_id", orgId).eq("user_subject", identity.subject).eq("status", "active").maybeSingle();
    if (!member) return jsonError("You do not have access to that organization.", 403);
    const { data, error } = await db.from("cases").select("id,category,subject,body,status,assigned_to,created_at,updated_at,department_id,departments(name),case_contacts(name,email),case_messages(id,sender_kind,message,created_at)").eq("organization_id", orgId).order("created_at", { ascending: false });
    if (error) throw error;
    if (data?.length) await db.from("case_events").insert(data.map((item: any) => ({ case_id: item.id, actor_kind: "organization", actor_subject: identity.subject, event_type: "case_accessed", visible_to_submitter: false })));
    return Response.json({ cases: data ?? [], role: member.role }, { headers: { "Cache-Control": "no-store" } });
  } catch { return jsonError("Could not load this organization’s cases.", 503); }
}

export async function PATCH(request: Request) {
  if (!hasSameOrigin(request)) return jsonError("This request must come from the Resolve It site.", 403);
  const identity = await getStaffIdentity();
  if (!identity) return jsonError("Sign in with TideCloak.", 401);
  if (!hasDbConfig()) return jsonError("Database is not configured.", 503);
  let body: any;
  try { body = await request.json(); } catch { return jsonError("Invalid request.", 400); }
  const { organizationId, caseId, status, message, assignedTo } = body ?? {};
  if (!["received", "under_review", "referred", "resolved", "closed"].includes(status) || typeof organizationId !== "string" || typeof caseId !== "string") return jsonError("Invalid case update.", 400);
  if (message && (typeof message !== "string" || message.length > 3000)) return jsonError("Keep replies under 3,000 characters.", 400);
  if (assignedTo !== undefined && assignedTo !== null && typeof assignedTo !== "string") return jsonError("Choose an active staff member.", 400);
  const db = getAdminDb();
  const { data: member } = await db.from("organization_memberships").select("role").eq("organization_id", organizationId).eq("user_subject", identity.subject).eq("status", "active").maybeSingle();
  if (!member) return jsonError("You do not have access to that organization.", 403);
  const { data: item } = await db.from("cases").select("id,status").eq("id", caseId).eq("organization_id", organizationId).maybeSingle();
  if (!item) return jsonError("Case not found.", 404);
  let assignee = "";
  if (typeof assignedTo === "string" && assignedTo) {
    const { data: target } = await db.from("organization_memberships").select("user_subject").eq("organization_id", organizationId).eq("user_subject", assignedTo).eq("status", "active").maybeSingle();
    if (!target) return jsonError("The assignee must be an active member of this organization.", 400);
    assignee = target.user_subject;
  }
  const { error } = await db.rpc("update_organization_case", { p_case_id: caseId, p_organization_id: organizationId, p_status: status, p_message: typeof message === "string" ? message.trim() : "", p_subject: identity.subject, p_assignee: assignee });
  if (error) return jsonError("Could not update the case. Confirm it still belongs to your organization.", 503);
  return Response.json({ updated: true });
}
