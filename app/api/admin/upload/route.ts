import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { uploadCrest } from "@/lib/crests";

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

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await uploadCrest(form.get("file"));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ url: result.url, path: result.path });
}
