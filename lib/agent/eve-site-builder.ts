import { Client, type ClientAuth } from "eve/client";

import { classifyBuildEvents, type BuildStreamEvent } from "./build-events";
import {
  JOB_HEADER,
  MODEL_HEADER,
  SITE_BUILD_RESULT_JSON_SCHEMA,
  renderBuildRequest,
  type SiteBuildJob,
} from "./job";
import type { SiteBuilder, SiteBuildStatus } from "./site-builder";

/**
 * Drives the eve site-builder agent over its HTTP API.
 *
 * The agent is mounted in this same Vercel project by `withEve`, so on Vercel
 * the workflow authenticates with the deployment's own OIDC token, which the
 * eve channel's `vercelOidc()` policy accepts for same-project callers.
 */
export class EveSiteBuilder implements SiteBuilder {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async start(job: SiteBuildJob, jobPathname: string): Promise<{ sessionId: string }> {
    const client = this.client({ [JOB_HEADER]: jobPathname, [MODEL_HEADER]: job.model });
    const { session } = await client.sessions.create({
      message: renderBuildRequest(job),
      outputSchema: SITE_BUILD_RESULT_JSON_SCHEMA,
      // The response stream is not consumed here: the workflow polls instead.
      streamReconnectPolicy: { reconnect: false },
    });
    return { sessionId: session.state.sessionId };
  }

  async check(sessionId: string): Promise<SiteBuildStatus> {
    const snapshot = await this.client().sessions.attach(sessionId).snapshot();
    return classifyBuildEvents(snapshot.events as readonly BuildStreamEvent[]);
  }

  private client(headers: Record<string, string> = {}): Client {
    const bypass = this.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    return new Client({
      host: agentHost(this.env),
      auth: agentAuth(this.env),
      headers: bypass ? { ...headers, "x-vercel-protection-bypass": bypass } : headers,
      redirect: "manual",
    });
  }
}

/**
 * Where the agent's `/eve/v1` routes are reachable from a workflow step.
 * Production uses the stable production hostname; previews call their own
 * deployment (with the automation bypass secret when protection is on).
 */
export function agentHost(env: NodeJS.ProcessEnv): string {
  if (env.COLDSNAP_AGENT_URL) return env.COLDSNAP_AGENT_URL.replace(/\/+$/, "");
  if (env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return `http://localhost:${env.PORT ?? "3000"}`;
}

function agentAuth(env: NodeJS.ProcessEnv): ClientAuth | undefined {
  if (env.COLDSNAP_AGENT_TOKEN) return { bearer: env.COLDSNAP_AGENT_TOKEN };
  if (env.VERCEL) {
    return {
      vercelOidc: {
        token: async () => {
          const { getVercelOidcToken } = await import("@vercel/oidc");
          return getVercelOidcToken();
        },
      },
    };
  }
  // Local development: the agent's localDev() policy admits the request.
  return undefined;
}
