import { describe, expect, it } from "vitest";

import { generatePassword, generateSessionSecret } from "@/lib/tenants/secrets";
import { domainFor, liveUrlFor, previewHostFor, projectNameFor } from "@/lib/tenants/naming";

describe("generatePassword", () => {
  it("produces four readable groups without look-alike characters", () => {
    for (let i = 0; i < 200; i += 1) {
      const password = generatePassword();
      expect(password).toMatch(/^[a-km-np-z2-9]{4}(-[a-km-np-z2-9]{4}){3}$/);
      expect(password).not.toMatch(/[01lio]/);
    }
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 500 }, generatePassword));
    expect(seen.size).toBe(500);
  });
});

describe("generateSessionSecret", () => {
  it("is 256 bits of hex", () => {
    expect(generateSessionSecret()).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("tenant naming", () => {
  const withDomain = { projectPrefix: "coldsnap-", rootDomain: "sites.frank.video" };
  const withoutDomain = { projectPrefix: "coldsnap-", rootDomain: null };

  it("names one Vercel project per tenant", () => {
    expect(projectNameFor("marks-bakery", withDomain)).toBe("coldsnap-marks-bakery");
  });

  it("uses a subdomain of the root domain when one is configured", () => {
    expect(domainFor("marks-bakery", withDomain)).toBe("marks-bakery.sites.frank.video");
    expect(previewHostFor("marks-bakery", withDomain)).toBe("marks-bakery.sites.frank.video");
  });

  it("falls back to the project's vercel.app address without a root domain", () => {
    expect(domainFor("marks-bakery", withoutDomain)).toBeNull();
    expect(previewHostFor("marks-bakery", withoutDomain)).toBe("coldsnap-marks-bakery.vercel.app");
  });

  it("prefers the custom domain, then the shortest vercel.app alias", () => {
    expect(
      liveUrlFor({ domain: "a.sites.frank.video", aliases: ["x.vercel.app"], deploymentUrl: "d.vercel.app" }),
    ).toBe("https://a.sites.frank.video");
    expect(
      liveUrlFor({
        domain: null,
        aliases: ["coldsnap-a-git-main-team.vercel.app", "coldsnap-a.vercel.app"],
        deploymentUrl: "coldsnap-a-123.vercel.app",
      }),
    ).toBe("https://coldsnap-a.vercel.app");
    expect(liveUrlFor({ domain: null, aliases: [], deploymentUrl: "coldsnap-a-123.vercel.app" })).toBe(
      "https://coldsnap-a-123.vercel.app",
    );
  });
});
