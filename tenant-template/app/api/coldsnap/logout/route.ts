/**
 * Coldsnap access control for this site. Managed by Coldsnap: do not edit.
 */
import { NextResponse } from "next/server";

import { LOGIN_PATH, SESSION_COOKIE } from "@/lib/coldsnap-auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL(LOGIN_PATH, request.url), 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
