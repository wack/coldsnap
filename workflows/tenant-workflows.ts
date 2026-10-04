import { sleep } from "workflow";

import {
  attachDomainStep,
  beginOperationStep,
  capturePreviewStep,
  checkBuildStep,
  checkDeploymentStep,
  deployBuildStep,
  failOperationStep,
  goLiveStep,
  provisionProjectStep,
  startBuildStep,
} from "./steps";

/**
 * Durable tenant pipelines (Vercel Workflow).
 *
 * The workflow bodies only sequence steps and wait; every side effect lives
 * in ./steps.ts. Each step shows up in the run's timeline in the Vercel
 * dashboard and writes its progress to the tenant row, which is what the
 * Coldsnap dashboard renders while Frank waits.
 *
 * The deterministic steps (project, domain, deploy) and the agentic step are
 * separate: the eve agent runs in its own durable session, and the workflow
 * checks on it between sleeps instead of holding a function open for a build
 * that can take many minutes.
 */

/** How often the workflow checks on the agent. Sleeping costs nothing. */
const BUILD_POLL_INTERVAL = "15s";
/** 160 polls × 15 s ≈ 40 minutes before giving up on the agent. */
const MAX_BUILD_POLLS = 160;
const DEPLOY_POLL_INTERVAL = "10s";
/** 90 polls × 10 s = 15 minutes for Vercel to build the site. */
const MAX_DEPLOY_POLLS = 90;

export async function createTenantWorkflow(tenantId: string, model: string) {
  "use workflow";
  try {
    const { buildId } = await beginOperationStep(tenantId, "create", model);
    await provisionProjectStep(tenantId);
    await attachDomainStep(tenantId);
    await buildAndShip(tenantId, buildId, null);
    return { tenantId, status: "live" as const };
  } catch (error) {
    await failOperationStep(tenantId, errorMessage(error));
    throw error;
  }
}

export async function modifyTenantWorkflow(tenantId: string, instructions: string, model: string) {
  "use workflow";
  try {
    const { buildId } = await beginOperationStep(tenantId, "modify", model);
    await buildAndShip(tenantId, buildId, instructions);
    return { tenantId, status: "live" as const };
  } catch (error) {
    await failOperationStep(tenantId, errorMessage(error));
    throw error;
  }
}

/** Shared tail of both pipelines: agent build, deploy, preview, go live. */
async function buildAndShip(tenantId: string, buildId: string, instructions: string | null) {
  const { sessionId, outputPathname } = await startBuildStep(tenantId, buildId, instructions);

  for (let poll = 1; ; poll += 1) {
    await sleep(BUILD_POLL_INTERVAL);
    const status = await checkBuildStep(tenantId, sessionId);
    if (status.state === "succeeded") break;
    if (status.state === "failed") throw new Error(status.error);
    if (poll >= MAX_BUILD_POLLS) throw new Error("The agent did not finish within 40 minutes.");
  }

  const { deploymentId, sourceUrl } = await deployBuildStep(tenantId, outputPathname);

  let url: string;
  for (let poll = 1; ; poll += 1) {
    await sleep(DEPLOY_POLL_INTERVAL);
    const status = await checkDeploymentStep(tenantId, deploymentId);
    if (status.state === "ready") {
      url = status.url;
      break;
    }
    if (status.state === "failed") throw new Error(status.error);
    if (poll >= MAX_DEPLOY_POLLS) {
      throw new Error("Vercel did not finish building the site within 15 minutes.");
    }
  }

  await capturePreviewStep(tenantId, url, buildId);
  await goLiveStep(tenantId, url, deploymentId, sourceUrl);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
