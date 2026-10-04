import { describe, expect, it } from "vitest";

import { normalizeRootDomain, toSubdomain } from "@/lib/tenants/subdomain";

describe("toSubdomain", () => {
  it.each([
    ["marksbakery", "marksbakery"],
    ["Mark's Bakery", "marks-bakery"],
    ["  Café   Olé!! ", "cafe-ole"],
    ["Dr. Smith & Sons -- Plumbing", "dr-smith-sons-plumbing"],
    ["___acme___", "acme"],
    ["Studio 54", "studio-54"],
  ])("converts %j into %j", (input, expected) => {
    expect(toSubdomain(input)).toEqual({ ok: true, subdomain: expected });
  });

  it("rejects input with nothing usable", () => {
    expect(toSubdomain("!!!")).toMatchObject({ ok: false, error: expect.stringContaining("letter") });
  });

  it("rejects one-character labels", () => {
    expect(toSubdomain("a")).toMatchObject({ ok: false });
  });

  it("rejects labels longer than 63 characters", () => {
    expect(toSubdomain("a".repeat(64))).toMatchObject({ ok: false, error: expect.stringContaining("63") });
    expect(toSubdomain("a".repeat(63))).toMatchObject({ ok: true });
  });

  it("rejects reserved names", () => {
    expect(toSubdomain("WWW")).toMatchObject({ ok: false, error: expect.stringContaining("reserved") });
    expect(toSubdomain("admin")).toMatchObject({ ok: false });
  });
});

describe("normalizeRootDomain", () => {
  it("accepts bare hosts and pasted URLs", () => {
    expect(normalizeRootDomain("Sites.Frank.Video")).toBe("sites.frank.video");
    expect(normalizeRootDomain("https://sites.frank.video/")).toBe("sites.frank.video");
  });

  it("treats empty values as unset", () => {
    expect(normalizeRootDomain(undefined)).toBeNull();
    expect(normalizeRootDomain("  ")).toBeNull();
  });

  it("rejects values that are not domains", () => {
    expect(() => normalizeRootDomain("localhost")).toThrow(/not a valid domain/);
    expect(() => normalizeRootDomain("bad_domain.com")).toThrow();
  });
});
