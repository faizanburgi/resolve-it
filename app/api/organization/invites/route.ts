import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getAdminDb, hasDbConfig } from "@/lib/db";
import { getStaffIdentity, hasSameOrigin, jsonError, requestBody } from "@/lib/tide";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return jsonError("This request must come from the Resolve It site.", 403);
  const identity = await getStaffIdentity();
  if (!identity) return jsonError("Sign in with TideCloak.", 401);
  if (!hasDbConfig()) return jsonError("Database is not configured.", 503);
  const body = await requestBody(request);
  if (typeof body?.organizationId !== "string" || typeof body?.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return jsonError("Enter a valid staff email.", 400);
  const db = getAdminDb();
  const { data: owner } = await db.from("organization_memberships").select("role").eq("organization_id", body.organizationId).eq("user_subject", identity.subject).eq("status", "active").maybeSingle();
  if (owner?.role !== "owner") return jsonError("Only organization owners can invite staff.", 403);
  const token = randomBytes(32).toString("base64url");
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(token, salt, 64).toString("hex");
  const { error } = await db.from("organization_invites").insert({ organization_id: body.organizationId, invited_email: body.email.toLowerCase(), token_salt: salt, token_hash: hash, created_by: identity.subject, expires_at: new Date(Date.now() + 7 * 86400_000).toISOString() });
  if (error) return jsonError("Could not create the staff invitation.", 503);
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return Response.json({ inviteUrl: `${origin}/organization?invite=${encodeURIComponent(token)}`, expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString() }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  if (!hasSameOrigin(request)) return jsonError("This request must come from the Resolve It site.", 403);
  const identity = await getStaffIdentity();
  if (!identity) return jsonError("Sign in with TideCloak to accept the invitation.", 401);
  if (!identity.email || !identity.emailVerified) return jsonError("Your TideCloak account needs a verified email address.", 403);
  if (!hasDbConfig()) return jsonError("Database is not configured.", 503);
  const body = await requestBody(request);
  if (typeof body?.token !== "string" || body.token.length < 32) return jsonError("Invalid invitation.", 400);
  const db = getAdminDb();
  const { data: invites } = await db.from("organization_invites").select("*").is("accepted_at", null).gt("expires_at", new Date().toISOString()).eq("invited_email", identity.email.toLowerCase());
  const invite = (invites ?? []).find((item: any) => {
    const candidate = scryptSync(body.token, item.token_salt, 64);
    return timingSafeEqual(candidate, Buffer.from(item.token_hash, "hex"));
  });
  if (!invite) return jsonError("That invitation is invalid, expired, already used, or belongs to a different email.", 403);
  const { data: accepted, error } = await db.rpc("accept_organization_invite", { p_invite_id: invite.id, p_subject: identity.subject, p_email: identity.email });
  if (error || !accepted) return jsonError("That invitation is no longer available.", 409);
  return Response.json({ accepted: true });
}
