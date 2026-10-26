import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-guard";
import { randomBytes } from "crypto";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"];

/**
 * Operator image upload, used for team crests on custom matches.
 *
 * The bucket is public because a crest is rendered on the board for everyone;
 * signing a URL per crest per page view would be waste. Nothing private is
 * accepted here — the route is admin-only and the filename is generated, so a
 * caller cannot choose where the file lands or overwrite an existing one.
 */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose an image" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That image is over 2MB" }, { status: 413 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "Use a PNG, JPG, WebP, GIF or SVG" }, { status: 415 });
  }

  const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `crests/${Date.now().toString(36)}-${randomBytes(4).toString("hex")}.${ext}`;

  const { error } = await supabase.storage
    .from("team-crests")
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });

  if (error) {
    console.error("[upload] failed", path, error);
    return NextResponse.json({ error: "Could not upload that image" }, { status: 500 });
  }

  const { data } = supabase.storage.from("team-crests").getPublicUrl(path);

  return NextResponse.json({ url: data.publicUrl, path });
}
