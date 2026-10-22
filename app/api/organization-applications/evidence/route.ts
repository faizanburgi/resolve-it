import { createHash, randomUUID } from "node:crypto";
import { getAdminDb, hasDbConfig } from "@/lib/db";
import { getStaffIdentity, hasSameOrigin, jsonError } from "@/lib/tide";

export const runtime = "nodejs";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function detectedType(bytes: Uint8Array) {
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return jsonError("This request must come from the Resolve It site.", 403);
  const identity = await getStaffIdentity();
  if (!identity || !identity.email || !identity.emailVerified) return jsonError("Sign in with a verified TideCloak email before uploading evidence.", 401);
  if (!hasDbConfig()) return jsonError("Database is not configured.", 503);
  let form: FormData;
  try { form = await request.formData(); } catch { return jsonError("Choose a PDF, PNG, or JPEG evidence file.", 400); }
  const officialEmail = form.get("officialEmail");
  if (typeof officialEmail !== "string" || officialEmail.trim().toLowerCase().split("@").pop() !== identity.email.split("@").pop()?.toLowerCase()) return jsonError("Use your verified organization email before uploading evidence.", 400);
  const file = form.get("evidence");
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_FILE_BYTES) return jsonError("Evidence files must be between 1 byte and 10 MB.", 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectedType(bytes);
  if (!mime || mime !== file.type) return jsonError("The file content must match a PDF, PNG, or JPEG type.", 400);
  const extension = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg";
  const applicantKey = createHash("sha256").update(identity.subject).digest("hex");
  const path = `${applicantKey}/${randomUUID()}.${extension}`;
  const { error } = await getAdminDb().storage.from("organization-evidence").upload(path, bytes, { contentType: mime, upsert: false, cacheControl: "0" });
  if (error) return jsonError("Could not securely store the verification evidence.", 503);
  return Response.json({ evidencePath: path }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
