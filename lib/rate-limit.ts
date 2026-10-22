import { createHmac } from "node:crypto";
import { getAdminDb } from "@/lib/db";

export async function consumePublicLimit(request: Request, max: number, windowSeconds = 3600) {
  const secret = process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return false;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const key = createHmac("sha256", secret).update(ip).digest("hex");
  const { data, error } = await getAdminDb().rpc("consume_public_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  if (error) throw error;
  return Boolean(data);
}
