import { NextResponse } from "next/server";
import { currentPartner } from "@/lib/partner";
import { uploadCrest } from "@/lib/crests";

export const dynamic = "force-dynamic";

/** Crest upload for a partner building a custom match. */
export async function POST(req: Request) {
  const partner = await currentPartner();
  if (!partner) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!partner.approved) {
    return NextResponse.json({ error: "Your account is waiting for approval" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const file = form.get("file");
  const result = await uploadCrest(file);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ url: result.url, path: result.path });
}
