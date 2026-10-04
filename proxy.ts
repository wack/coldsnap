import { NextResponse, type NextRequest } from "next/server";

import { ADMIN_COOKIE, readAdminSession } from "@/lib/auth/session";

/**
 * Only Frank reaches the dashboard. Anonymous page requests go to /login;
 * anonymous API calls get a 401.
 *
 * Excluded from the matcher: the login page and its OAuth routes, Next.js
 * assets, the Workflow SDK's internal routes, and the eve agent's routes,
 * which carry their own authentication (agent/channels/eve.ts).
 */
export async function proxy(request: NextRequest) {
  const admin = await readAdminSession(request.cookies.get(ADMIN_COOKIE)?.value);
  if (admin) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in to Coldsnap first." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|login|api/auth/|\\.well-known/workflow/|eve/).*)",
  ],
};
