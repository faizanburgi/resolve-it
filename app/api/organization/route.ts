import { getAdminDb, hasDbConfig } from "@/lib/db";
import { getStaffIdentity, jsonError } from "@/lib/tide";

export async function GET() {
  const identity = await getStaffIdentity();
  if (!identity) return jsonError("Sign in with TideCloak.", 401);
  if (!hasDbConfig()) return jsonError("Database is not configured.", 503);
  try {
    const { data, error } = await getAdminDb().from("organization_memberships").select("role,status,organizations(id,name,category,description,status)").eq("user_subject", identity.subject).eq("status", "active");
    if (error) throw error;
    return Response.json({ memberships: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch { return jsonError("Could not load your organization workspace.", 503); }
}
