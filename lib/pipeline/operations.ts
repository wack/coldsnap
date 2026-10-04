import { SESSION_COOKIE, createSessionToken } from "../../tenant-template/lib/coldsnap-auth";
import { siteBuildJobSchema, type SiteBuildJob } from "../agent/job";
import type { Services } from "../services";
import { parseBundle, toDeploymentFiles } from "../source/bundle";
import { objectKeys } from "../storage/object-store";
import { enforceProtectedFiles } from "../tenant-template";
import {
  failProgress,
  finishProgress,
  planProgress,
  updateStep,
  type Operation,
  type StepId,
  type StepUpdate,
  type Tenant,
} from "../tenants/model";
import { liveUrlFor } from "../tenants/naming";

/**
 * The tenant pipeline's individual operations.
 *
 * Each function is one durable workflow step: it takes plain serializable
 * arguments, does its side effects through `Services`, records progress on the
 * tenant row, and returns plain data. Keeping them free of the Workflow
 * runtime means they unit-test against the in-memory services directly.
 * Every operation is safe to retry.
 */

/** A failure that retrying cannot fix. The workflow wrapper maps it to FatalError. */
export class PipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelineError";
  }
}

async function setStep(
  services: Services,
  tenant: Tenant,
  id: StepId,
  update: StepUpdate,
): Promise<Tenant> {
  if (!tenant.progress) return tenant;
  return services.tenants.update(tenant.id, {
    progress: updateStep(tenant.progress, id, update, services.now()),
  });
}

export async function beginOperation(
  services: Services,
  tenantId: string,
  operation: Operation,
  model: string,
): Promise<{ buildId: string }> {
  await services.tenants.update(tenantId, {
    status: operation === "create" ? "creating" : "updating",
    progress: planProgress(operation, services.now()),
    model,
    lastError: null,
    activity: null,
  });
  return { buildId: crypto.randomUUID() };
}

export async function provisionProject(services: Services, tenantId: string): Promise<void> {
  let tenant = await services.tenants.require(tenantId);
  tenant = await setStep(services, tenant, "project", { state: "running" });

  const project = await services.platform.ensureProject(tenant.vercelProjectName);
  // The tenant site's login gate reads these at runtime (tenant-template/lib/coldsnap-auth.ts).
  await services.platform.upsertEnv(project.id, {
    COLDSNAP_SITE_USERNAME: tenant.email,
    COLDSNAP_SITE_PASSWORD: tenant.password,
    COLDSNAP_SITE_SECRET: tenant.sessionSecret,
    COLDSNAP_SITE_NAME: tenant.name,
  });

  tenant = await services.tenants.update(tenantId, { vercelProjectId: project.id });
  await setStep(services, tenant, "project", { state: "done", detail: project.name });
}

export async function attachDomain(services: Services, tenantId: string): Promise<void> {
  let tenant = await services.tenants.require(tenantId);
  const domain = tenant.domain;
  if (!domain) {
    await setStep(services, tenant, "domain", {
      state: "skipped",
      detail: "No root domain configured, so the site uses its vercel.app address.",
    });
    return;
  }
  tenant = await setStep(services, tenant, "domain", { state: "running", detail: domain });
  await services.platform.addDomain(requireProjectId(tenant), domain);
  await setStep(services, tenant, "domain", { state: "done", detail: domain });
}

export async function startBuild(
  services: Services,
  tenantId: string,
  input: { readonly buildId: string; readonly instructions: string | null },
): Promise<{ sessionId: string; outputPathname: string }> {
  let tenant = await services.tenants.require(tenantId);
  tenant = await setStep(services, tenant, "generate", {
    state: "running",
    detail: "Starting the eve agent",
  });

  const outputPathname = objectKeys.source(tenantId, input.buildId);
  const job: SiteBuildJob = siteBuildJobSchema.parse({
    version: 1,
    buildId: input.buildId,
    tenantId,
    kind: input.instructions === null ? "create" : "modify",
    site: { name: tenant.name, subdomain: tenant.subdomain, description: tenant.description },
    instructions: input.instructions,
    model: tenant.model,
    sourceUrl: input.instructions === null ? null : tenant.sourceUrl,
    outputPathname,
  });
  if (job.kind === "modify" && !job.sourceUrl) {
    throw new PipelineError("This site has no stored source to modify. Recreate it instead.");
  }

  const jobPathname = objectKeys.job(tenantId, input.buildId);
  await services.objects.put(jobPathname, JSON.stringify(job), {
    contentType: "application/json",
  });
  const { sessionId } = await services.siteBuilder.start(job, jobPathname);
  await services.tenants.update(tenantId, { agentSessionId: sessionId });
  return { sessionId, outputPathname };
}

export type BuildCheck =
  | { readonly state: "running" }
  | { readonly state: "succeeded" }
  | { readonly state: "failed"; readonly error: string };

export async function checkBuild(
  services: Services,
  tenantId: string,
  sessionId: string,
): Promise<BuildCheck> {
  const status = await services.siteBuilder.check(sessionId);
  const tenant = await services.tenants.require(tenantId);

  if (status.state === "running") {
    // The agent writes fine-grained activity straight to the tenant row; fall
    // back to what the event stream says when it has not reported yet.
    const detail = tenant.activity ?? status.detail ?? "The agent is working";
    const current = tenant.progress?.steps.find((step) => step.id === "generate");
    if (current?.detail !== detail) {
      await setStep(services, tenant, "generate", { state: "running", detail });
    }
    return { state: "running" };
  }
  if (status.state === "failed") return { state: "failed", error: status.error };

  await setStep(services, tenant, "generate", { state: "done", detail: status.summary });
  return { state: "succeeded" };
}

export async function deployBuild(
  services: Services,
  tenantId: string,
  outputPathname: string,
): Promise<{ deploymentId: string; sourceUrl: string }> {
  let tenant = await services.tenants.require(tenantId);
  tenant = await setStep(services, tenant, "deploy", { state: "running" });

  const stored = await services.objects.head(outputPathname);
  if (!stored) {
    throw new PipelineError("The agent finished, but it did not save the site's source.");
  }
  const json = await services.objects.getText(stored.url);
  if (json === null) throw new PipelineError("The site's source could not be read back.");
  // Defense in depth: the agent already restored the login gate, but the
  // deploy step never ships a bundle without it.
  const bundle = enforceProtectedFiles(parseBundle(json));

  const deployment = await services.platform.createDeployment({
    projectId: requireProjectId(tenant),
    projectName: tenant.vercelProjectName,
    files: toDeploymentFiles(bundle),
  });

  tenant = await setStep(services, tenant, "deploy", {
    state: "done",
    detail: `${bundle.files.length} files uploaded`,
  });
  await setStep(services, tenant, "build", { state: "running", detail: "Queued" });
  return { deploymentId: deployment.id, sourceUrl: stored.url };
}

export type DeploymentCheck =
  | { readonly state: "building" }
  | { readonly state: "ready"; readonly url: string }
  | { readonly state: "failed"; readonly error: string };

export async function checkDeployment(
  services: Services,
  tenantId: string,
  deploymentId: string,
): Promise<DeploymentCheck> {
  const deployment = await services.platform.getDeployment(deploymentId);
  const tenant = await services.tenants.require(tenantId);

  if (deployment.state === "READY") {
    const url = liveUrlFor({
      domain: tenant.domain,
      aliases: deployment.aliases,
      deploymentUrl: deployment.url,
    });
    await setStep(services, tenant, "build", { state: "done", detail: url });
    return { state: "ready", url };
  }
  if (deployment.state === "ERROR" || deployment.state === "CANCELED") {
    return {
      state: "failed",
      error: deployment.errorMessage ?? `The Vercel build ended in ${deployment.state}.`,
    };
  }
  const detail = deployment.state === "BUILDING" ? "Building" : "Queued";
  const current = tenant.progress?.steps.find((step) => step.id === "build");
  if (current?.detail !== detail) {
    await setStep(services, tenant, "build", { state: "running", detail });
  }
  return { state: "building" };
}

/**
 * Screenshots the live home page. A preview is nice to have, never a reason
 * to fail the run, so errors mark the step skipped instead of throwing.
 */
export async function capturePreview(
  services: Services,
  tenantId: string,
  input: { readonly url: string; readonly buildId: string },
): Promise<void> {
  let tenant = await services.tenants.require(tenantId);
  tenant = await setStep(services, tenant, "preview", { state: "running" });
  try {
    const value = await createSessionToken({
      username: tenant.email.trim().toLowerCase(),
      password: tenant.password,
      secret: tenant.sessionSecret,
    });
    const shot = await services.screenshots.capture({
      url: input.url,
      siteName: tenant.name,
      cookie: { name: SESSION_COOKIE, value },
    });
    const stored = await services.objects.put(
      objectKeys.preview(tenantId, input.buildId, shot.extension),
      shot.bytes,
      { contentType: shot.contentType },
    );
    tenant = await services.tenants.update(tenantId, { previewImageUrl: stored.url });
    await setStep(services, tenant, "preview", { state: "done" });
  } catch (error) {
    await setStep(services, tenant, "preview", {
      state: "skipped",
      detail: `Preview unavailable: ${messageOf(error)}`,
    });
  }
}

export async function goLive(
  services: Services,
  tenantId: string,
  input: { readonly url: string; readonly deploymentId: string; readonly sourceUrl: string },
): Promise<void> {
  const tenant = await services.tenants.require(tenantId);
  const now = services.now();
  const progress = tenant.progress
    ? finishProgress(updateStep(tenant.progress, "live", { state: "done", detail: input.url }, now), now)
    : null;
  await services.tenants.update(tenantId, {
    status: "live",
    progress,
    url: input.url,
    deploymentId: input.deploymentId,
    sourceUrl: input.sourceUrl,
    activity: null,
    lastError: null,
  });
}

/**
 * Records a failed run. A failed create leaves the tenant `failed` (Frank can
 * retry or delete it); a failed modify leaves the previous deployment serving.
 */
export async function failOperation(
  services: Services,
  tenantId: string,
  error: string,
): Promise<void> {
  const tenant = await services.tenants.get(tenantId);
  if (!tenant || tenant.status === "deleting") return;
  await services.tenants.update(tenantId, {
    status: tenant.url ? "live" : "failed",
    progress: tenant.progress ? failProgress(tenant.progress, error, services.now()) : null,
    lastError: error,
    activity: null,
  });
}

function requireProjectId(tenant: Tenant): string {
  if (!tenant.vercelProjectId) {
    throw new PipelineError("The tenant has no Vercel project yet.");
  }
  return tenant.vercelProjectId;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
