/**
 * Coldsnap access control for this site. Managed by Coldsnap: do not edit.
 */
import { NextResponse } from "next/server";

import {
  LOGIN_PATH,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  credentialsMatch,
  readSiteCredentials,
  safeNextPath,
} from "@/lib/coldsnap-auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const next = safeNextPath(form.get("next"));

  const credentials = readSiteCredentials();
  if (!credentials || !credentialsMatch(credentials, username, password)) {
    const retry = new URL(LOGIN_PATH, request.url);
    retry.searchParams.set("error", "1");
    if (next !== "/") retry.searchParams.set("next", next);
    return NextResponse.redirect(retry, 303);
  }

  // The lead just signed in for real. This is the activation signal Coldsnap
  // will report back to Frank (see "Analytics" in Coldsnap's future work).
  const token = await createSessionToken(credentials);
  const destination = new URL(next, request.url);
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: destination.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
