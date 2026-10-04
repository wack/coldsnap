import { FatalError } from "workflow";

import * as operations from "@/lib/pipeline/operations";
import { PipelineError } from "@/lib/pipeline/operations";
import { getServices } from "@/lib/services";

/**
 * Workflow steps. Each is a thin `"use step"` wrapper around one operation in
 * lib/pipeline/operations.ts, which holds the logic and its tests. Steps run
 * with full Node.js access, are retried up to three times on unexpected
 * errors, and record their results so a resumed workflow never repeats them.
 */

/** Runs an operation, turning known-permanent failures into FatalError. */
async function run<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PipelineError) throw new FatalError(error.message);
    throw error;
  }
}

export async function beginOperationStep(
  tenantId: string,
  operation: "create" | "modify",
  model: string,
) {
  "use step";
  return run(() => operations.beginOperation(getServices(), tenantId, operation, model));
}

export async function provisionProjectStep(tenantId: string) {
  "use step";
  return run(() => operations.provisionProject(getServices(), tenantId));
}

export async function attachDomainStep(tenantId: string) {
  "use step";
  return run(() => operations.attachDomain(getServices(), tenantId));
}

export async function startBuildStep(
  tenantId: string,
  buildId: string,
  instructions: string | null,
) {
  "use step";
  return run(() => operations.startBuild(getServices(), tenantId, { buildId, instructions }));
}

export async function checkBuildStep(tenantId: string, sessionId: string) {
  "use step";
  return run(() => operations.checkBuild(getServices(), tenantId, sessionId));
}

export async function deployBuildStep(tenantId: string, outputPathname: string) {
  "use step";
  return run(() => operations.deployBuild(getServices(), tenantId, outputPathname));
}

export async function checkDeploymentStep(tenantId: string, deploymentId: string) {
  "use step";
  return run(() => operations.checkDeployment(getServices(), tenantId, deploymentId));
}

export async function capturePreviewStep(tenantId: string, url: string, buildId: string) {
  "use step";
  return run(() => operations.capturePreview(getServices(), tenantId, { url, buildId }));
}

export async function goLiveStep(
  tenantId: string,
  url: string,
  deploymentId: string,
  sourceUrl: string,
) {
  "use step";
  return run(() => operations.goLive(getServices(), tenantId, { url, deploymentId, sourceUrl }));
}

export async function failOperationStep(tenantId: string, error: string) {
  "use step";
  return operations.failOperation(getServices(), tenantId, error);
}
