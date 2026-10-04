import { NextResponse, type NextRequest } from "next/server";

import {
  ADMIN_COOKIE,
  DEV_ADMIN,
  adminCookieOptions,
  createAdminSession,
  devLoginEnabled,
} from "@/lib/auth/session";

/** Local development only (`next dev` with COLDSNAP_DEV_LOGIN=1). */
export async function POST(request: NextRequest) {
  if (!devLoginEnabled()) return new NextResponse(null, { status: 404 });
  const response = NextResponse.redirect(new URL("/", request.nextUrl.origin), 303);
  response.cookies.set(ADMIN_COOKIE, await createAdminSession(DEV_ADMIN), adminCookieOptions(false));
  return response;
}
