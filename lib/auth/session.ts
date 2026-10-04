import { SignJWT, jwtVerify } from "jose";

/**
 * Coldsnap's own admin session, minted after Sign in with Vercel succeeds.
 *
 * Vercel's tokens are not kept: once the ID token proves who Frank is, the
 * app issues a short HS256 JWT in an httpOnly cookie and revokes the Vercel
 * access token. That keeps the dashboard independent of Vercel's token
 * lifetimes and never stores a credential that can act on Frank's account.
 */
export const ADMIN_COOKIE = "coldsnap_admin";
export const ADMIN_SESSION_SECONDS = 60 * 60 * 24 * 7;
const ISSUER = "coldsnap";
const AUDIENCE = "coldsnap-admin";

export interface AdminUser {
  /** Vercel user id (`sub`). */
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly username: string | null;
  readonly picture: string | null;
}

/** Only `next dev` may fall back to a built-in key; production fails closed. */
const DEVELOPMENT_ONLY_SECRET = "coldsnap-development-only-session-secret-0000";

function signingKey(env: NodeJS.ProcessEnv = process.env): Uint8Array {
  const secret =
    env.COLDSNAP_SESSION_SECRET ??
    (env.NODE_ENV === "development" ? DEVELOPMENT_ONLY_SECRET : undefined);
  if (!secret || secret.length < 32) {
    throw new Error("COLDSNAP_SESSION_SECRET must be set to at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

/** Whether the deployment can mint sessions at all (shown on the login page). */
export function sessionSecretConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    signingKey(env);
    return true;
  } catch {
    return false;
  }
}

/**
 * `COLDSNAP_DEV_LOGIN=1` adds a one-click login to `next dev` so the dashboard
 * can be exercised without a Sign in with Vercel app. Never in production.
 */
export function devLoginEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "development" && env.COLDSNAP_DEV_LOGIN === "1";
}

export const DEV_ADMIN: AdminUser = {
  id: "dev-frank",
  name: "Frank (dev)",
  email: "frank@example.com",
  username: "frank",
  picture: null,
};

export async function createAdminSession(user: AdminUser, now: Date = new Date()): Promise<string> {
  return new SignJWT({
    name: user.name,
    email: user.email,
    username: user.username,
    picture: user.picture,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + ADMIN_SESSION_SECONDS)
    .sign(signingKey());
}

export async function readAdminSession(token: string | undefined): Promise<AdminUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      name: typeof payload.name === "string" ? payload.name : "Frank",
      email: typeof payload.email === "string" ? payload.email : null,
      username: typeof payload.username === "string" ? payload.username : null,
      picture: typeof payload.picture === "string" ? payload.picture : null,
    };
  } catch {
    return null;
  }
}

export function adminCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: ADMIN_SESSION_SECONDS,
  };
}
