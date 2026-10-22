import { getAdminDb, hasDbConfig } from "@/lib/db";
import { getStaffIdentity, jsonError } from "@/lib/tide";

export async function GET(request: Request) {
  const identity = await getStaffIdentity();
  if (!identity) return jsonError("Sign in with TideCloak.", 401);
  if (!hasDbConfig()) return jsonError("Database is not configured.", 503);
  const organizationId = new URL(request.url).searchParams.get("organizationId");
  if (!organizationId) return jsonError("Choose an organization workspace.", 400);
  const db = getAdminDb();
  const { data: member } = await db.from("organization_memberships").select("id").eq("organization_id", organizationId).eq("user_subject", identity.subject).eq("status", "active").maybeSingle();
  if (!member) return jsonError("You do not have access to that organization.", 403);
  const { data, error } = await db.from("organization_memberships").select("user_subject,email,role").eq("organization_id", organizationId).eq("status", "active").order("email");
  if (error) return jsonError("Could not load organization staff.", 503);
  return Response.json({ members: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
