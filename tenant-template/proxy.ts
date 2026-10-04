/**
 * Coldsnap access control for this site. Managed by Coldsnap: do not edit.
 *
 * Every page requires a valid session cookie except the login page and the
 * login endpoint. Visitors without one are sent to /login and returned to the
 * page they asked for after signing in.
 */
import { NextResponse, type NextRequest } from "next/server";

import {
  LOGIN_ACTION_PATH,
  LOGIN_PATH,
  SESSION_COOKIE,
  readSiteCredentials,
  verifySessionToken,
} from "./lib/coldsnap-auth";

const PUBLIC_PATHS = new Set([LOGIN_PATH, LOGIN_ACTION_PATH]);

function withPrivateHeaders(response: NextResponse): NextResponse {
  response.headers.set("x-robots-tag", "noindex, nofollow");
  return response;
}

export async function proxy(request: NextRequest) {
  const credentials = readSiteCredentials();
  if (!credentials) {
    // Fail closed: a site without credentials is never served.
    return new NextResponse("This site is not ready yet.", {
      status: 503,
      headers: { "x-robots-tag": "noindex, nofollow" },
    });
  }

  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return withPrivateHeaders(NextResponse.next());

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await verifySessionToken(token, credentials))) {
    return withPrivateHeaders(NextResponse.next());
  }

  const login = new URL(LOGIN_PATH, request.url);
  if (pathname !== "/" || search) login.searchParams.set("next", `${pathname}${search}`);
  return withPrivateHeaders(NextResponse.redirect(login));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
