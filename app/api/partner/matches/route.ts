import { NextResponse } from "next/server";
import { currentPartner } from "@/lib/partner";
import { createCustomMatch, deleteCustomMatch, listCustomMatches, updateCustomMatch } from "@/lib/custom-matches";

export const dynamic = "force-dynamic";

/** Approved partners create and run their own fixtures. */
async function partner() {
  const row = await currentPartner();
  if (!row) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!row.approved) {
    return NextResponse.json({ error: "Your account is waiting for approval" }, { status: 403 });
  }
  return row;
}

export async function GET() {
  const who = await partner();
  if (who instanceof NextResponse) return who;

  const result = await listCustomMatches(who.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ matches: result.matches });
}

export async function POST(req: Request) {
  const who = await partner();
  if (who instanceof NextResponse) return who;

  const body = await req.json().catch(() => null);
  const result = await createCustomMatch(body, who.id, "Betvanta Special");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ match: result.match });
}

export async function PATCH(req: Request) {
  const who = await partner();
  if (who instanceof NextResponse) return who;

  const body = await req.json().catch(() => null);
  const result = await updateCustomMatch(body, who.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ match: result.match });
}

export async function DELETE(req: Request) {
  const who = await partner();
  if (who instanceof NextResponse) return who;

  const id = new URL(req.url).searchParams.get("id");
  const result = await deleteCustomMatch(id, who.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
