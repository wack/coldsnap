import { normalizeRootDomain } from "./tenants/subdomain";

/**
 * Application configuration, read from the environment on demand.
 *
 * Nothing here runs at module scope: eve evaluates authored modules at build
 * time and Next.js prerenders, and neither has the runtime environment.
 */

/** Which implementations back the external services. */
export type DriverMode = "vercel" | "memory";

export interface AppConfig {
  readonly drivers: DriverMode;
  /** e.g. `sites.frank.video`; tenants get `<subdomain>.<rootDomain>`. */
  readonly rootDomain: string | null;
  /** Prepended to the subdomain to name each tenant's Vercel project. */
  readonly projectPrefix: string;
  readonly defaultModel: string;
}

export const DEFAULT_MODEL = "openai/gpt-5.5";

export function getAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const drivers = env.COLDSNAP_DRIVERS === "memory" ? "memory" : "vercel";
  return {
    drivers,
    rootDomain: normalizeRootDomain(env.COLDSNAP_ROOT_DOMAIN),
    projectPrefix: env.COLDSNAP_PROJECT_PREFIX ?? "coldsnap-",
    defaultModel: env.COLDSNAP_DEFAULT_MODEL ?? DEFAULT_MODEL,
  };
}

/** Reads a variable the selected code path cannot run without. */
export function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is not set. See README.md for the environment Coldsnap needs.`);
  }
  return value;
}
