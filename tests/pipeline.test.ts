import { beforeEach, describe, expect, it } from "vitest";

import * as ops from "@/lib/pipeline/operations";
import { getServices, type Services } from "@/lib/services";
import { parseBundle, serializeBundle } from "@/lib/source/bundle";
import { memoryObjects } from "@/lib/storage/memory-store";
import { PROTECTED_PATHS, TEMPLATE_FILES } from "@/lib/tenant-template";
import { FieldError, registerTenant, teardownTenant } from "@/lib/tenants/manage";
import { memoryVercelState } from "@/lib/vercel/memory-platform";

import { SAMPLE_INPUT, createSampleTenant, resetMemoryState } from "./helpers";

/**
 * Drives the same operations the workflow sequences, in the same order,
 * without the Workflow runtime. tests/workflows.workflow.test.ts runs the
 * real durable workflows on top of these.
 */
async function runPipeline(
  services: Services,
  tenantId: string,
  operation: "create" | "modify",
  instructions: string | null = null,
) {
  const tenant = await services.tenants.require(tenantId);
  const { buildId } = await ops.beginOperation(services, tenantId, operation, tenant.model);
  if (operation === "create") {
    await ops.provisionProject(services, tenantId);
    await ops.attachDomain(services, tenantId);
  }
  const { sessionId, outputPathname } = await ops.startBuild(services, tenantId, {
    buildId,
    instructions,
  });
  const progressSnapshots: string[] = [];
  for (;;) {
    const status = await ops.checkBuild(services, tenantId, sessionId);
    const generate = (await services.tenants.require(tenantId)).progress?.steps.find(
      (step) => step.id === "generate",
    );
    progressSnapshots.push(generate?.detail ?? "");
    if (status.state === "succeeded") break;
    if (status.state === "failed") throw new Error(status.error);
  }
  const { deploymentId, sourceUrl } = await ops.deployBuild(services, tenantId, outputPathname);
  let url = "";
  for (;;) {
    const status = await ops.checkDeployment(services, tenantId, deploymentId);
    if (status.state === "ready") {
      url = status.url;
      break;
    }
    if (status.state === "failed") throw new Error(status.error);
  }
  await ops.capturePreview(services, tenantId, { url, buildId });
  await ops.goLive(services, tenantId, { url, deploymentId, sourceUrl });
  return { progressSnapshots, deploymentId };
}

describe("tenant pipeline", () => {
  let services: Services;

  beforeEach(async () => {
    await resetMemoryState();
    services = getServices();
  });

  it("registers a tenant with a derived subdomain and fresh credentials", async () => {
    const tenant = await createSampleTenant();
    expect(tenant).toMatchObject({
      name: "Mark's Bakery",
      subdomain: "marks-bakery",
      email: "mark@marksbakery.com",
      status: "creating",
      vercelProjectName: "coldsnap-marks-bakery",
      domain: null,
    });
    expect(tenant.password).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
    expect(tenant.sessionSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(tenant.progress?.steps.map((step) => step.state)).toEqual(Array(7).fill("pending"));
  });

  it("refuses a second tenant with the same subdomain", async () => {
    await createSampleTenant();
    await expect(createSampleTenant({ name: "marks bakery" })).rejects.toBeInstanceOf(FieldError);
  });

  it("rejects names that cannot become a subdomain", async () => {
    await expect(registerTenant(services, { ...SAMPLE_INPUT, name: "www" })).rejects.toThrow(/reserved/);
  });

  it("takes a new tenant from registration to live", async () => {
    const tenant = await createSampleTenant();
    const { progressSnapshots, deploymentId } = await runPipeline(services, tenant.id, "create");

    const live = await services.tenants.require(tenant.id);
    expect(live.status).toBe("live");
    expect(live.url).toBe("https://coldsnap-marks-bakery.vercel.app");
    expect(live.deploymentId).toBe(deploymentId);
    expect(live.previewImageUrl).toMatch(/^\/api\/dev\/objects\/previews\//);
    expect(live.progress?.finishedAt).toBeDefined();
    expect(live.progress?.steps.map((step) => [step.id, step.state])).toEqual([
      ["project", "done"],
      ["domain", "skipped"],
      ["generate", "done"],
      ["deploy", "done"],
      ["build", "done"],
      ["preview", "done"],
      ["live", "done"],
    ]);
    // Frank sees the agent's activity change while it works.
    expect(new Set(progressSnapshots.filter(Boolean)).size).toBeGreaterThan(2);

    // The Vercel project carries the login gate's configuration.
    const project = [...memoryVercelState().projects.values()][0]!;
    expect(project).toMatchObject({ name: "coldsnap-marks-bakery", ssoProtection: null });
    expect(project.env).toEqual({
      COLDSNAP_SITE_USERNAME: "mark@marksbakery.com",
      COLDSNAP_SITE_PASSWORD: live.password,
      COLDSNAP_SITE_SECRET: live.sessionSecret,
      COLDSNAP_SITE_NAME: "Mark's Bakery",
    });

    // The deployment is the template plus the generated page, with auth intact.
    const files = memoryVercelState().deployments.get(deploymentId)!.files;
    const page = files.find((file) => file.file === "app/page.tsx")!;
    expect(page.data).toContain("Mark's Bakery");
    for (const path of PROTECTED_PATHS) {
      const shipped = files.find((file) => file.file === path);
      expect(shipped?.data).toBe(TEMPLATE_FILES.find((file) => file.path === path)!.content);
    }
  });

  it("attaches a subdomain of the root domain when one is configured", async () => {
    const configured: Services = {
      ...services,
      config: { ...services.config, rootDomain: "sites.frank.video" },
    };
    const tenant = await registerTenant(configured, SAMPLE_INPUT);
    expect(tenant.domain).toBe("marks-bakery.sites.frank.video");

    await runPipeline(configured, tenant.id, "create");
    const live = await services.tenants.require(tenant.id);
    expect(live.url).toBe("https://marks-bakery.sites.frank.video");
    expect([...memoryVercelState().projects.values()][0]!.domains).toEqual([
      "marks-bakery.sites.frank.video",
    ]);
  });

  it("modifies a live site starting from its stored source", async () => {
    const tenant = await createSampleTenant();
    await runPipeline(services, tenant.id, "create");
    const before = await services.tenants.require(tenant.id);

    await runPipeline(services, tenant.id, "modify", "Add a section about wedding films.");
    const after = await services.tenants.require(tenant.id);

    expect(after.status).toBe("live");
    expect(after.sourceUrl).not.toBe(before.sourceUrl);
    expect(after.progress?.operation).toBe("modify");
    const bundle = parseBundle((await services.objects.getText(after.sourceUrl!))!);
    const page = bundle.files.find((file) => file.path === "app/page.tsx")!;
    expect(page.content).toContain("wedding films");
  });

  it("restores the login gate even if the agent's bundle tampered with it", async () => {
    const tenant = await createSampleTenant();
    const { buildId } = await ops.beginOperation(services, tenant.id, "create", tenant.model);
    await ops.provisionProject(services, tenant.id);
    const tampered = serializeBundle({
      version: 1,
      files: [
        ...TEMPLATE_FILES.filter((file) => file.path !== "proxy.ts").map((file) => ({
          ...file,
          encoding: "utf-8" as const,
        })),
        { path: "proxy.ts", content: "export function proxy() {}", encoding: "utf-8" },
        { path: "middleware.ts", content: "export function middleware() {}", encoding: "utf-8" },
      ],
    });
    const pathname = `sources/${tenant.id}/${buildId}.json`;
    await services.objects.put(pathname, tampered, { contentType: "application/json" });

    const { deploymentId } = await ops.deployBuild(services, tenant.id, pathname);
    const files = memoryVercelState().deployments.get(deploymentId)!.files;
    expect(files.find((file) => file.file === "proxy.ts")!.data).toContain("verifySessionToken");
    expect(files.some((file) => file.file === "middleware.ts")).toBe(false);
  });

  it("fails a create cleanly when the agent cannot build the site", async () => {
    const tenant = await createSampleTenant({ name: "fail-agent studio" });
    await expect(runPipeline(services, tenant.id, "create")).rejects.toThrow(/simulated/);
    await ops.failOperation(services, tenant.id, "Codex could not make next build pass (simulated).");

    const failed = await services.tenants.require(tenant.id);
    expect(failed.status).toBe("failed");
    expect(failed.lastError).toMatch(/simulated/);
    const generate = failed.progress?.steps.find((step) => step.id === "generate");
    expect(generate).toMatchObject({ state: "failed" });
    expect(failed.progress?.steps.find((step) => step.id === "deploy")?.state).toBe("pending");
  });

  it("keeps a live site live when a modify fails", async () => {
    const tenant = await createSampleTenant();
    await runPipeline(services, tenant.id, "create");
    await ops.beginOperation(services, tenant.id, "modify", tenant.model);
    await ops.failOperation(services, tenant.id, "The agent failed.");

    const after = await services.tenants.require(tenant.id);
    expect(after.status).toBe("live");
    expect(after.url).toBe("https://coldsnap-marks-bakery.vercel.app");
    expect(after.lastError).toBe("The agent failed.");
  });

  it("reports a failed Vercel build", async () => {
    const tenant = await createSampleTenant({ name: "fail-build films" });
    await expect(runPipeline(services, tenant.id, "create")).rejects.toThrow(/simulated failure/);
  });

  it("does not start a second agent run when the start step is retried", async () => {
    const tenant = await createSampleTenant();
    const { buildId } = await ops.beginOperation(services, tenant.id, "create", tenant.model);
    await ops.provisionProject(services, tenant.id);
    const first = await ops.startBuild(services, tenant.id, { buildId, instructions: null });
    const retried = await ops.startBuild(services, tenant.id, { buildId, instructions: null });
    expect(retried).toEqual(first);

    // A new operation starts a new run.
    const next = await ops.beginOperation(services, tenant.id, "create", tenant.model);
    const fresh = await ops.startBuild(services, tenant.id, { buildId: next.buildId, instructions: null });
    expect(fresh.sessionId).not.toBe(first.sessionId);
  });

  it("refuses to deploy when the agent saved nothing", async () => {
    const tenant = await createSampleTenant();
    await ops.beginOperation(services, tenant.id, "create", tenant.model);
    await ops.provisionProject(services, tenant.id);
    await expect(ops.deployBuild(services, tenant.id, "sources/missing.json")).rejects.toBeInstanceOf(
      ops.PipelineError,
    );
  });

  it("deletes the project, stored files, and row", async () => {
    const tenant = await createSampleTenant();
    await runPipeline(services, tenant.id, "create");
    const cancelled: string[] = [];
    await services.tenants.update(tenant.id, { workflowRunId: "wrun_123" });

    await teardownTenant(services, tenant.id, async (runId) => {
      cancelled.push(runId);
    });

    expect(cancelled).toEqual(["wrun_123"]);
    expect(await services.tenants.get(tenant.id)).toBeNull();
    expect(memoryVercelState().projects.size).toBe(0);
    expect(memoryVercelState().deployments.size).toBe(0);
    expect([...memoryObjects().keys()].filter((key) => key.includes(tenant.id))).toEqual([]);
  });

  it("can delete a tenant whose creation never reached Vercel", async () => {
    const tenant = await createSampleTenant();
    await teardownTenant(services, tenant.id, async () => {});
    expect(await services.tenants.get(tenant.id)).toBeNull();
  });
});
