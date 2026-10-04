import { describe, expect, it } from "vitest";

import {
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  credentialsMatch,
  readSiteCredentials,
  safeNextPath,
  verifySessionToken,
  type SiteCredentials,
} from "@/tenant-template/lib/coldsnap-auth";

const credentials: SiteCredentials = {
  username: "lead@example.com",
  password: "abcd-efgh-jkmn-pqrs",
  secret: "0123456789abcdef0123456789abcdef",
};

describe("tenant site login gate", () => {
  it("reads credentials from the environment and fails closed when any is missing", () => {
    expect(
      readSiteCredentials({
        COLDSNAP_SITE_USERNAME: " Lead@Example.com ",
        COLDSNAP_SITE_PASSWORD: "pw",
        COLDSNAP_SITE_SECRET: "s",
      }),
    ).toEqual({ username: "lead@example.com", password: "pw", secret: "s" });
    expect(readSiteCredentials({ COLDSNAP_SITE_USERNAME: "a", COLDSNAP_SITE_PASSWORD: "b" })).toBeNull();
  });

  it("matches the email case-insensitively and the password exactly", () => {
    expect(credentialsMatch(credentials, "LEAD@example.com ", "abcd-efgh-jkmn-pqrs")).toBe(true);
    expect(credentialsMatch(credentials, "lead@example.com", "ABCD-efgh-jkmn-pqrs")).toBe(false);
    expect(credentialsMatch(credentials, "someone@else.com", "abcd-efgh-jkmn-pqrs")).toBe(false);
    expect(credentialsMatch(credentials, "lead@example.com", "")).toBe(false);
  });

  it("accepts its own session tokens", async () => {
    const token = await createSessionToken(credentials);
    expect(await verifySessionToken(token, credentials)).toBe(true);
  });

  it("rejects tampered, foreign, and malformed tokens", async () => {
    const token = await createSessionToken(credentials);
    const [payload, signature] = token.split(".");
    const forgedPayload = btoa(JSON.stringify({ u: "lead@example.com", iat: 1 })).replace(/=+$/, "");

    expect(await verifySessionToken(`${forgedPayload}.${signature}`, credentials)).toBe(false);
    expect(await verifySessionToken(`${payload}.${signature}x`, credentials)).toBe(false);
    expect(await verifySessionToken(token, { ...credentials, secret: "another-secret" })).toBe(false);
    expect(await verifySessionToken("not-a-token", credentials)).toBe(false);
    expect(await verifySessionToken(`${token}.extra`, credentials)).toBe(false);
  });

  it("signs everyone out when the password rotates", async () => {
    const token = await createSessionToken(credentials);
    expect(await verifySessionToken(token, { ...credentials, password: "new-pass-word-1234" })).toBe(false);
  });

  it("expires tokens after 30 days", async () => {
    const issued = Date.UTC(2026, 0, 1);
    const token = await createSessionToken(credentials, issued);
    const justBefore = issued + (SESSION_MAX_AGE_SECONDS - 1) * 1000;
    const justAfter = issued + (SESSION_MAX_AGE_SECONDS + 1) * 1000;
    expect(await verifySessionToken(token, credentials, justBefore)).toBe(true);
    expect(await verifySessionToken(token, credentials, justAfter)).toBe(false);
  });

  it("only redirects to same-site paths after login", () => {
    expect(safeNextPath("/pricing?x=1")).toBe("/pricing?x=1");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
