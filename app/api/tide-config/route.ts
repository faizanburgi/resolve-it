import { loadTideConfig, type TideAdapterConfig } from "@/lib/tide";

export const dynamic = "force-dynamic";

const PRIVATE_CONFIG_KEY = /(secret|password|credential|private.?key|admin.?token|access.?token|refresh.?token|id.?token|authorization|cookie|bearer)/i;

function publicConfig(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicConfig);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !PRIVATE_CONFIG_KEY.test(key))
    .map(([key, child]) => [key, publicConfig(child)]));
}

export async function GET() {
  const config = await loadTideConfig();
  if (!config) return Response.json({ configured: false }, { headers: { "Cache-Control": "no-store" } });
  const safeConfig = publicConfig(config) as TideAdapterConfig;
  if (!Object.keys(safeConfig).length) {
    return Response.json({ configured: false }, { headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ configured: true, config: safeConfig }, { headers: { "Cache-Control": "no-store" } });
}
