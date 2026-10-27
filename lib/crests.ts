import { randomBytes } from "crypto";
import { db } from "./supabase";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"];

/**
 * A public team crest. The filename is generated, so a caller cannot choose
 * where the file lands or overwrite an existing one.
 */
export async function uploadCrest(file: unknown) {
  const supabase = db();
  if (!supabase) return { ok: false as const, status: 503, error: "Service unavailable" };

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, status: 400, error: "Choose an image" };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false as const, status: 413, error: "That image is over 2MB" };
  }
  if (!ALLOWED.includes(file.type)) {
    return { ok: false as const, status: 415, error: "Use a PNG, JPG, WebP, GIF or SVG" };
  }

  const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `crests/${Date.now().toString(36)}-${randomBytes(4).toString("hex")}.${ext}`;

  const { error } = await supabase.storage
    .from("team-crests")
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });

  if (error) {
    console.error("[upload] failed", path, error);
    return { ok: false as const, status: 500, error: "Could not upload that image" };
  }

  const { data } = supabase.storage.from("team-crests").getPublicUrl(path);
  return { ok: true as const, url: data.publicUrl, path };
}
