import { getAdminDb, hasDbConfig } from "@/lib/db";
import { getStaffIdentity, hasSameOrigin, jsonError, requestBody } from "@/lib/tide";

export async function GET(request: Request) {
  const identity = await getStaffIdentity();
  if (!identity) return jsonError("Sign in with TideCloak.", 401);
  const orgId = new URL(request.url).searchParams.get("organizationId");
  if (!hasDbConfig() || !orgId) return jsonError("Choose an organization workspace.", 400);
  const db = getAdminDb();
  const { data: member } = await db.from("organization_memberships").select("role").eq("organization_id", orgId).eq("user_subject", identity.subject).eq("status", "active").maybeSingle();
  if (!member) return jsonError("You do not have access to that organization.", 403);
  const { data, error } = await db.from("departments").select("id,name,active").eq("organization_id", orgId).order("name");
  if (error) return jsonError("Could not load departments.", 503);
  return Response.json({ departments: data ?? [], role: member.role });
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return jsonError("This request must come from the Resolve It site.", 403);
  const identity = await getStaffIdentity();
  if (!identity) return jsonError("Sign in with TideCloak.", 401);
  if (!hasDbConfig()) return jsonError("Database is not configured.", 503);
  const body = await requestBody(request);
  if (typeof body?.organizationId !== "string" || typeof body?.name !== "string" || !body.name.trim() || body.name.length > 100) return jsonError("Enter a department name under 100 characters.", 400);
  const db = getAdminDb();
  const { data: member } = await db.from("organization_memberships").select("role").eq("organization_id", body.organizationId).eq("user_subject", identity.subject).eq("status", "active").maybeSingle();
  if (member?.role !== "owner") return jsonError("Only organization owners can manage departments.", 403);
  const { error } = await db.from("departments").insert({ organization_id: body.organizationId, name: body.name.trim() });
  if (error) return jsonError("Could not add department. It may already exist.", 409);
  return Response.json({ created: true }, { status: 201 });
}
