import { getAdminDb, hasDbConfig } from "@/lib/db";
import { jsonError } from "@/lib/tide";

export const dynamic = "force-dynamic";

function errorSummary(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown };
    const code = typeof value.code === "string" ? value.code : "";
    const message = typeof value.message === "string" ? value.message : "";
    return [code, message].filter(Boolean).join(": ") || "unknown error object";
  }
  return typeof error === "string" ? error : "unknown error";
}

export async function GET() {
  if (!hasDbConfig()) return Response.json({ organizations: [] }, { headers: { "Cache-Control": "no-store" } });
  try {
    const db = getAdminDb();
    const { data: orgs, error } = await db.from("organizations").select("id,name,category,description").eq("status", "approved").order("name");
    if (error) throw error;
    const ids = (orgs ?? []).map(o => o.id);
    const { data: departments, error: depError } = ids.length ? await db.from("departments").select("id,organization_id,name").in("organization_id", ids).eq("active", true).order("name") : { data: [], error: null };
    if (depError) throw depError;
    return Response.json({ organizations: (orgs ?? []).map(o => ({ ...o, departments: (departments ?? []).filter(d => d.organization_id === o.id).map(d => ({ id: d.id, name: d.name })) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("organizations_directory_failed", errorSummary(error));
    return jsonError("The organization directory is temporarily unavailable.", 503);
  }
}
