import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ADMIN_COOKIE, readAdminSession, type AdminUser } from "./session";

/** The signed-in admin, or `null`. */
export async function getAdmin(): Promise<AdminUser | null> {
  const store = await cookies();
  return readAdminSession(store.get(ADMIN_COOKIE)?.value);
}

/**
 * For pages and server actions. The proxy already turns anonymous requests
 * away, but every action re-checks because actions are reachable endpoints.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  return admin;
}
