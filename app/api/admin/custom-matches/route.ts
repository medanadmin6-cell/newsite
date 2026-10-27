import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createCustomMatch, deleteCustomMatch, listCustomMatches, updateCustomMatch } from "@/lib/custom-matches";

export const dynamic = "force-dynamic";

/** Operator fixtures: create, run and finalise. */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const result = await listCustomMatches(null);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ matches: result.matches });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const result = await createCustomMatch(body, null, "3btafric Special");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ match: result.match });
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const result = await updateCustomMatch(body, null);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ match: result.match });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  const result = await deleteCustomMatch(id, null);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
