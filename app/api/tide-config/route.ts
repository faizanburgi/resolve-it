import { loadTideConfig } from "@/lib/tide";

export const dynamic = "force-dynamic";

function publicConfig(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicConfig);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/(secret|password|credential|private.?key|admin.?token)/i.test(key))
    .map(([key, child]) => [key, publicConfig(child)]));
}

export async function GET() {
  const config = await loadTideConfig();
  if (!config) return Response.json({ configured: false }, { headers: { "Cache-Control": "no-store" } });
  return Response.json({ configured: true, config: publicConfig(config) }, { headers: { "Cache-Control": "no-store" } });
}
