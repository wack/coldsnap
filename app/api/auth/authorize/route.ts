import { NextResponse, type NextRequest } from "next/server";

import {
  CALLBACK_PATH,
  OAUTH_COOKIES,
  authorizationUrl,
  oauthClient,
  randomToken,
} from "@/lib/auth/vercel-oauth";

/** Starts Sign in with Vercel: PKCE, state, and nonce, then off to Vercel. */
export async function GET(request: NextRequest) {
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken(48);
  const url = await authorizationUrl({
    clientId: oauthClient().clientId,
    redirectUri: `${request.nextUrl.origin}${CALLBACK_PATH}`,
    state,
    nonce,
    verifier,
  });

  const response = NextResponse.redirect(url);
  const options = {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax" as const,
    path: "/api/auth",
    maxAge: 10 * 60,
  };
  response.cookies.set(OAUTH_COOKIES.state, state, options);
  response.cookies.set(OAUTH_COOKIES.nonce, nonce, options);
  response.cookies.set(OAUTH_COOKIES.verifier, verifier, options);
  return response;
}
