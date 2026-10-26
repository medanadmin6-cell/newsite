import { cookies } from "next/headers";
import { ADMIN_COOKIE, isValidAdminToken } from "./auth";

/**
 * The admin cookie check for route handlers.
 *
 * This lives apart from lib/auth so that module stays free of next/headers and
 * can be imported by middleware, which runs before a request context exists.
 */
export async function requireAdmin(): Promise<boolean> {
  const jar = await cookies();
  return isValidAdminToken(jar.get(ADMIN_COOKIE)?.value);
}
