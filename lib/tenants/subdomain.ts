/**
 * Turns whatever Frank types into the tenant's subdomain label.
 *
 * The form converts rather than rejects: "Mark's Bakery!" becomes
 * `marks-bakery`. Validation only fails when nothing usable survives, when the
 * label is reserved, or when it is too long to be a DNS label. The same
 * function runs in the browser (live preview) and on the server (authority).
 */

/** RFC 1035 caps a single DNS label at 63 octets. */
export const MAX_SUBDOMAIN_LENGTH = 63;
export const MIN_SUBDOMAIN_LENGTH = 2;

/**
 * Labels Frank cannot claim. Some collide with infrastructure people expect on
 * any domain (`www`, `mail`); others would read as Coldsnap's own surfaces.
 */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "cdn",
  "coldsnap",
  "dashboard",
  "dev",
  "docs",
  "eve",
  "ftp",
  "localhost",
  "login",
  "mail",
  "preview",
  "smtp",
  "static",
  "status",
  "vercel",
  "www",
]);

export type SubdomainResult =
  | { readonly ok: true; readonly subdomain: string }
  | { readonly ok: false; readonly subdomain: string; readonly error: string };

/** Lowercases, strips accents, and collapses everything else into hyphens. */
export function normalizeSubdomain(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function toSubdomain(input: string): SubdomainResult {
  const subdomain = normalizeSubdomain(input);

  if (subdomain.length === 0) {
    return { ok: false, subdomain, error: "Use at least one letter or number." };
  }
  if (subdomain.length < MIN_SUBDOMAIN_LENGTH) {
    return {
      ok: false,
      subdomain,
      error: `Use at least ${MIN_SUBDOMAIN_LENGTH} letters or numbers.`,
    };
  }
  if (subdomain.length > MAX_SUBDOMAIN_LENGTH) {
    return {
      ok: false,
      subdomain,
      error: `Keep it to ${MAX_SUBDOMAIN_LENGTH} characters or fewer.`,
    };
  }
  if (!DNS_LABEL.test(subdomain)) {
    // normalizeSubdomain already guarantees this; kept as the last word.
    return { ok: false, subdomain, error: "Use only letters, numbers, and hyphens." };
  }
  if (RESERVED_SUBDOMAINS.has(subdomain)) {
    return { ok: false, subdomain, error: `"${subdomain}" is reserved. Pick another name.` };
  }
  return { ok: true, subdomain };
}

/**
 * Normalizes the configured root domain (`COLDSNAP_ROOT_DOMAIN`). Accepts the
 * value with or without a scheme or trailing slash so a pasted URL works.
 */
export function normalizeRootDomain(input: string | undefined): string | null {
  if (!input) return null;
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^\.+|\.+$/g, "");
  if (host.length === 0) return null;
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((label) => DNS_LABEL.test(label))) {
    throw new Error(`COLDSNAP_ROOT_DOMAIN "${input}" is not a valid domain name.`);
  }
  return host;
}
