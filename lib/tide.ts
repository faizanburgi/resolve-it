import { cookies } from "next/headers";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { verifyTideCloakToken } from "@tidecloak/nextjs/server";

export type StaffIdentity = { subject: string; email: string | null; emailVerified: boolean; token: Record<string, any> };

export async function loadTideConfig() {
  if (process.env.TIDECLOAK_CONFIG_JSON) {
    try { return JSON.parse(process.env.TIDECLOAK_CONFIG_JSON); }
    catch { return null; }
  }
  const configPath = path.resolve(process.cwd(), process.env.TIDECLOAK_CONFIG_PATH || "tidecloak.json");
  try { return JSON.parse(await readFile(configPath, "utf8")); }
  catch { return null; }
}

export async function getStaffIdentity(requiredRoles: string[] = []): Promise<StaffIdentity | null> {
  const config = await loadTideConfig();
  if (!config) return null;
  const jar = await cookies();
  const token = jar.get("kcToken")?.value;
  if (!token) return null;
  try {
    const claims = await verifyTideCloakToken(config, token, requiredRoles);
    if (!claims || typeof claims.sub !== "string") return null;
    return { subject: claims.sub, email: typeof claims.email === "string" ? claims.email : null, emailVerified: claims.email_verified === true, token: claims };
  } catch { return null; }
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

// Browser mutations authenticated by the TideCloak cookie must come from this
// deployment origin. This is defense in depth against cross-site requests.
export function hasSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}

export async function requestBody(request: Request) {
  try { return await request.json(); }
  catch { return null; }
}
