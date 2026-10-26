import { NextResponse } from "next/server";
import { checkAdminPassword, adminToken, adminEnabled, ADMIN_COOKIE, adminCookieOptions } from "@/lib/auth";

export async function POST(req: Request) {
  if (!adminEnabled()) {
    return NextResponse.json({ error: "The admin console is disabled" }, { status: 503 });
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!checkAdminPassword(body.password ?? "")) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, adminToken(), adminCookieOptions());
  return res;
}
