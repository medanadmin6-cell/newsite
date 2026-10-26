import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, isValidAdminToken } from "@/lib/auth";

/**
 * Keeps unauthenticated visitors away from /admin before the page shell loads.
 * Every admin API route re-checks the cookie independently, so this is a
 * convenience rather than the security boundary.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/admin/login") return NextResponse.next();

  if (pathname.startsWith("/admin")) {
    if (!isValidAdminToken(req.cookies.get(ADMIN_COOKIE)?.value)) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

// Proxy always runs on the Node.js runtime, so the node:crypto token compare
// in lib/auth works here with no runtime declaration.
export const config = {
  matcher: ["/admin/:path*"],
};
