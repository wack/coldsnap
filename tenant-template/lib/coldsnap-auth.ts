/**
 * Coldsnap access control for this site. Managed by Coldsnap: do not edit.
 *
 * The site is private to one lead. They sign in once with their email address
 * and the password Coldsnap generated; a signed cookie keeps them signed in
 * for 30 days. Credentials come from the project's environment variables, so
 * Frank can rotate the password without rebuilding the site.
 *
 * Uses only Web Crypto so it runs in the proxy and in route handlers alike.
 */

export const SESSION_COOKIE = "coldsnap_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const LOGIN_PATH = "/login";
export const LOGIN_ACTION_PATH = "/api/coldsnap/login";
export const LOGOUT_ACTION_PATH = "/api/coldsnap/logout";

/** Clock skew tolerated for tokens issued slightly in the future. */
const MAX_FUTURE_SKEW_SECONDS = 60;

export interface SiteCredentials {
  readonly username: string;
  readonly password: string;
  /** Signs session cookies. */
  readonly secret: string;
}

export function readSiteCredentials(
  env: Record<string, string | undefined> = process.env,
): SiteCredentials | null {
  const username = env.COLDSNAP_SITE_USERNAME;
  const password = env.COLDSNAP_SITE_PASSWORD;
  const secret = env.COLDSNAP_SITE_SECRET;
  if (!username || !password || !secret) return null;
  return { username: normalizeUsername(username), password, secret };
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Compares in time independent of where the strings first differ. */
function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return difference === 0;
}

export function credentialsMatch(
  credentials: SiteCredentials,
  username: string,
  password: string,
): boolean {
  const userOk = constantTimeEqual(normalizeUsername(username), credentials.username);
  const passwordOk = constantTimeEqual(password.trim(), credentials.password);
  return userOk && passwordOk;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
}

/**
 * The signing key mixes in the password, so rotating the password signs
 * everyone out without touching the secret.
 */
async function sign(payload: string, credentials: SiteCredentials): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`${credentials.secret}:${credentials.password}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function createSessionToken(
  credentials: SiteCredentials,
  now: number = Date.now(),
): Promise<string> {
  const payload = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({ u: credentials.username, iat: Math.floor(now / 1000) }),
    ),
  );
  return `${payload}.${await sign(payload, credentials)}`;
}

export async function verifySessionToken(
  token: string,
  credentials: SiteCredentials,
  now: number = Date.now(),
): Promise<boolean> {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return false;
  if (!constantTimeEqual(signature, await sign(payload, credentials))) return false;

  let claims: { u?: unknown; iat?: unknown };
  try {
    claims = JSON.parse(base64UrlDecode(payload));
  } catch {
    return false;
  }
  if (claims.u !== credentials.username || typeof claims.iat !== "number") return false;
  const nowSeconds = Math.floor(now / 1000);
  if (claims.iat > nowSeconds + MAX_FUTURE_SKEW_SECONDS) return false;
  return nowSeconds - claims.iat <= SESSION_MAX_AGE_SECONDS;
}

/** Only same-site absolute paths; anything else falls back to the home page. */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next === LOGIN_PATH || next.startsWith(`${LOGIN_PATH}?`)) return "/";
  return next;
}
