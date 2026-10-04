import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAdminSession, readAdminSession, type AdminUser } from "@/lib/auth/session";
import {
  authorizationUrl,
  exchangeCode,
  isAllowedAdmin,
  pkceChallenge,
  verifyIdToken,
} from "@/lib/auth/vercel-oauth";

const frank: AdminUser = {
  id: "user_frank123",
  name: "Frank",
  email: "frank@frankfilms.co",
  username: "frankfilms",
  picture: null,
};

describe("admin session cookie", () => {
  beforeAll(() => {
    process.env.COLDSNAP_SESSION_SECRET = "x".repeat(40);
  });

  it("round-trips the admin", async () => {
    expect(await readAdminSession(await createAdminSession(frank))).toEqual(frank);
  });

  it("rejects missing, forged, and expired sessions", async () => {
    expect(await readAdminSession(undefined)).toBeNull();
    expect(await readAdminSession("garbage")).toBeNull();
    const forged = await new SignJWT({ name: "Mallory" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user_mallory")
      .setIssuer("coldsnap")
      .setAudience("coldsnap-admin")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("y".repeat(40)));
    expect(await readAdminSession(forged)).toBeNull();
    const longAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    expect(await readAdminSession(await createAdminSession(frank, longAgo))).toBeNull();
  });
});

describe("allowlist", () => {
  afterEach(() => {
    delete process.env.COLDSNAP_ADMIN_ALLOWLIST;
  });

  it("admits Frank by Vercel user id, username, or email", () => {
    for (const entry of ["user_frank123", "FrankFilms", " frank@frankfilms.co "]) {
      expect(isAllowedAdmin(frank, { COLDSNAP_ADMIN_ALLOWLIST: `someone-else,${entry}` })).toBe(true);
    }
  });

  it("admits nobody when the allowlist is empty or does not match", () => {
    expect(isAllowedAdmin(frank, {})).toBe(false);
    expect(isAllowedAdmin(frank, { COLDSNAP_ADMIN_ALLOWLIST: "mallory" })).toBe(false);
  });
});

describe("Sign in with Vercel", () => {
  it("computes the RFC 7636 S256 challenge", async () => {
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("builds an authorization URL with PKCE, state, and nonce", async () => {
    const url = new URL(
      await authorizationUrl({
        clientId: "cl_123",
        redirectUri: "https://coldsnap.example/api/auth/callback",
        state: "s",
        nonce: "n",
        verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://vercel.com/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "cl_123",
      response_type: "code",
      scope: "openid email profile",
      state: "s",
      nonce: "n",
      code_challenge_method: "S256",
      code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    });
  });

  it("exchanges the code with the verifier and client credentials", async () => {
    let sent: URLSearchParams | undefined;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sent = init.body as URLSearchParams;
      return Response.json({ access_token: "at", id_token: "it" });
    }) as unknown as typeof fetch;

    const tokens = await exchangeCode(
      { clientId: "cl_123", clientSecret: "secret" },
      { code: "c", verifier: "v", redirectUri: "https://x/api/auth/callback" },
      fakeFetch,
    );
    expect(tokens).toEqual({ access_token: "at", id_token: "it" });
    expect(Object.fromEntries(sent!)).toEqual({
      grant_type: "authorization_code",
      client_id: "cl_123",
      client_secret: "secret",
      code: "c",
      code_verifier: "v",
      redirect_uri: "https://x/api/auth/callback",
    });
  });

  describe("ID token verification", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), alg: "RS256", kid: "k1" }] });
    const idToken = (claims: Record<string, unknown>, issuer = "https://vercel.com", audience = "cl_123") =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(issuer)
        .setAudience(audience)
        .setSubject("user_frank123")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);

    it("returns the Vercel user for a valid token", async () => {
      const token = await idToken({ nonce: "n", email: "frank@frankfilms.co", preferred_username: "frankfilms" });
      await expect(verifyIdToken(token, { clientId: "cl_123", nonce: "n" }, jwks)).resolves.toMatchObject({
        id: "user_frank123",
        email: "frank@frankfilms.co",
        username: "frankfilms",
      });
    });

    it("rejects a wrong nonce, issuer, or audience", async () => {
      await expect(
        verifyIdToken(await idToken({ nonce: "other" }), { clientId: "cl_123", nonce: "n" }, jwks),
      ).rejects.toThrow(/nonce/);
      await expect(
        verifyIdToken(await idToken({ nonce: "n" }, "https://evil.example"), { clientId: "cl_123", nonce: "n" }, jwks),
      ).rejects.toThrow();
      await expect(
        verifyIdToken(await idToken({ nonce: "n" }, undefined, "cl_other"), { clientId: "cl_123", nonce: "n" }, jwks),
      ).rejects.toThrow();
    });
  });
});
