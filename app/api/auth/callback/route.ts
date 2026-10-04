import { NextResponse, type NextRequest } from "next/server";

import { ADMIN_COOKIE, adminCookieOptions, createAdminSession } from "@/lib/auth/session";
import {
  CALLBACK_PATH,
  OAUTH_COOKIES,
  exchangeCode,
  isAllowedAdmin,
  oauthClient,
  revokeToken,
  verifyIdToken,
} from "@/lib/auth/vercel-oauth";

/**
 * Finishes Sign in with Vercel. Checks `state`, exchanges the code with the
 * PKCE verifier, verifies the ID token (signature, issuer, audience, nonce),
 * admits only allowlisted Vercel users, and swaps Vercel's tokens for a
 * Coldsnap session cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const fail = (reason: string) => {
    const response = NextResponse.redirect(new URL(`/login?error=${reason}`, origin));
    clearOAuthCookies(response);
    return response;
  };

  if (searchParams.get("error")) return fail("denied");
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get(OAUTH_COOKIES.state)?.value;
  const nonce = request.cookies.get(OAUTH_COOKIES.nonce)?.value;
  const verifier = request.cookies.get(OAUTH_COOKIES.verifier)?.value;
  if (!code || !state || !expectedState || state !== expectedState || !nonce || !verifier) {
    return fail("expired");
  }

  try {
    const client = oauthClient();
    const tokens = await exchangeCode(client, {
      code,
      verifier,
      redirectUri: `${origin}${CALLBACK_PATH}`,
    });
    const user = await verifyIdToken(tokens.id_token, { clientId: client.clientId, nonce });
    await revokeToken(client, tokens.access_token);
    if (!isAllowedAdmin(user)) return fail("not-allowed");

    const response = NextResponse.redirect(new URL("/", origin));
    response.cookies.set(
      ADMIN_COOKIE,
      await createAdminSession(user),
      adminCookieOptions(request.nextUrl.protocol === "https:"),
    );
    clearOAuthCookies(response);
    return response;
  } catch (error) {
    console.error("Sign in with Vercel failed", error);
    return fail("failed");
  }
}

function clearOAuthCookies(response: NextResponse) {
  for (const name of Object.values(OAUTH_COOKIES)) {
    response.cookies.set(name, "", { path: "/api/auth", maxAge: 0 });
  }
}
