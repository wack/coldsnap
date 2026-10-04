import { createRemoteJWKSet, jwtVerify } from "jose";

import { requireEnv } from "../config";
import type { AdminUser } from "./session";

/**
 * Sign in with Vercel: OAuth 2.0 authorization code flow with PKCE (S256),
 * `state` against CSRF and `nonce` against ID-token replay. Endpoints come
 * from https://vercel.com/.well-known/openid-configuration.
 */
export const VERCEL_ISSUER = "https://vercel.com";
const AUTHORIZE_URL = "https://vercel.com/oauth/authorize";
const TOKEN_URL = "https://api.vercel.com/login/oauth/token";
const REVOKE_URL = "https://api.vercel.com/login/oauth/token/revoke";
const JWKS = createRemoteJWKSet(new URL("https://vercel.com/.well-known/jwks"));

export const OAUTH_COOKIES = {
  state: "coldsnap_oauth_state",
  nonce: "coldsnap_oauth_nonce",
  verifier: "coldsnap_oauth_verifier",
} as const;

export const CALLBACK_PATH = "/api/auth/callback";

export interface OAuthClient {
  readonly clientId: string;
  readonly clientSecret: string;
}

export function oauthClient(env: NodeJS.ProcessEnv = process.env): OAuthClient {
  return {
    clientId: requireEnv("NEXT_PUBLIC_VERCEL_APP_CLIENT_ID", env),
    clientSecret: requireEnv("VERCEL_APP_CLIENT_SECRET", env),
  };
}

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function randomToken(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export async function authorizationUrl(input: {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly nonce: string;
  readonly verifier: string;
}): Promise<string> {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: input.state,
    nonce: input.nonce,
    code_challenge: await pkceChallenge(input.verifier),
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE_URL}?${params}`;
}

interface TokenResponse {
  readonly access_token: string;
  readonly id_token: string;
}

export async function exchangeCode(
  client: OAuthClient,
  input: { readonly code: string; readonly verifier: string; readonly redirectUri: string },
  fetchImpl: typeof fetch = fetch,
): Promise<TokenResponse> {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code: input.code,
      code_verifier: input.verifier,
      redirect_uri: input.redirectUri,
    }),
  });
  if (!response.ok) {
    throw new Error(`Vercel rejected the authorization code (HTTP ${response.status}).`);
  }
  return (await response.json()) as TokenResponse;
}

/** Verifies the ID token's signature, issuer, audience, expiry, and nonce. */
export async function verifyIdToken(
  idToken: string,
  input: { readonly clientId: string; readonly nonce: string },
  keys: Parameters<typeof jwtVerify>[1] = JWKS,
): Promise<AdminUser> {
  const { payload } = await jwtVerify(idToken, keys as typeof JWKS, {
    issuer: VERCEL_ISSUER,
    audience: input.clientId,
    algorithms: ["RS256"],
  });
  if (payload.nonce !== input.nonce) throw new Error("ID token nonce mismatch.");
  if (!payload.sub) throw new Error("ID token has no subject.");
  const username = typeof payload.preferred_username === "string" ? payload.preferred_username : null;
  return {
    id: payload.sub,
    name: typeof payload.name === "string" ? payload.name : (username ?? "Frank"),
    email: typeof payload.email === "string" ? payload.email : null,
    username,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}

/** Best effort: Coldsnap never uses the Vercel access token after login. */
export async function revokeToken(
  client: OAuthClient,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const credentials = Buffer.from(`${client.clientId}:${client.clientSecret}`).toString("base64");
  await fetchImpl(REVOKE_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}` },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}

/**
 * Only Frank gets in. `COLDSNAP_ADMIN_ALLOWLIST` lists Vercel user ids,
 * usernames, or emails, comma separated. An empty list admits nobody.
 */
export function isAllowedAdmin(
  user: AdminUser,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const allowed = new Set(
    (env.COLDSNAP_ADMIN_ALLOWLIST ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
  return [user.id, user.username, user.email]
    .filter((value): value is string => Boolean(value))
    .some((value) => allowed.has(value.toLowerCase()));
}
