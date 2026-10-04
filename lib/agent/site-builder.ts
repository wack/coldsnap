import type { SiteBuildJob } from "./job";

export type SiteBuildStatus =
  | { readonly state: "running"; readonly detail?: string }
  | { readonly state: "succeeded"; readonly summary: string }
  | { readonly state: "failed"; readonly error: string };

/**
 * Starts and observes one agentic build. Starting returns immediately; the
 * workflow polls `check` between durable sleeps, so no function invocation
 * has to stay alive while the model works.
 */
export interface SiteBuilder {
  start(job: SiteBuildJob, jobPathname: string): Promise<{ readonly sessionId: string }>;
  check(sessionId: string): Promise<SiteBuildStatus>;
}
