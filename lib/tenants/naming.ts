import type { AppConfig } from "../config";

/**
 * Where a tenant lives on Vercel.
 *
 * In multi-project mode every tenant is its own Vercel project. With a root
 * domain configured the site answers at `<subdomain>.<rootDomain>`; without
 * one it falls back to the project's own `*.vercel.app` production alias,
 * because a `*.vercel.app` hostname cannot carry nested subdomains.
 */

/** Vercel project names are capped at 100 characters. */
const MAX_PROJECT_NAME_LENGTH = 100;

export function projectNameFor(subdomain: string, config: Pick<AppConfig, "projectPrefix">): string {
  const name = `${config.projectPrefix}${subdomain}`.toLowerCase();
  if (name.length > MAX_PROJECT_NAME_LENGTH) {
    throw new Error(`Project name "${name}" exceeds ${MAX_PROJECT_NAME_LENGTH} characters.`);
  }
  return name;
}

export function domainFor(subdomain: string, config: Pick<AppConfig, "rootDomain">): string | null {
  return config.rootDomain ? `${subdomain}.${config.rootDomain}` : null;
}

/** The hostname Frank will see in the form before submitting. */
export function previewHostFor(
  subdomain: string,
  config: Pick<AppConfig, "rootDomain" | "projectPrefix">,
): string {
  return domainFor(subdomain, config) ?? `${config.projectPrefix}${subdomain}.vercel.app`;
}

/**
 * Picks the public URL once a production deployment is ready: the custom
 * domain when there is one, else the shortest `*.vercel.app` alias (the
 * project's production alias), else the deployment's own URL.
 */
export function liveUrlFor(input: {
  readonly domain: string | null;
  readonly aliases: readonly string[];
  readonly deploymentUrl: string;
}): string {
  if (input.domain) return `https://${input.domain}`;
  const vercelAliases = input.aliases
    .filter((alias) => alias.endsWith(".vercel.app"))
    .sort((a, b) => a.length - b.length);
  const host = vercelAliases[0] ?? input.deploymentUrl;
  return host.startsWith("http") ? host : `https://${host}`;
}
