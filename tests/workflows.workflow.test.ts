import { waitForSleep } from "@workflow/vitest";
import { beforeEach, describe, expect, it } from "vitest";
import { getRun, start, type Run } from "workflow/api";

import { getServices } from "@/lib/services";
import { memoryVercelState } from "@/lib/vercel/memory-platform";
import { createTenantWorkflow, modifyTenantWorkflow } from "@/workflows/tenant-workflows";

import { createSampleTenant, resetMemoryState } from "./helpers";

/**
 * Runs a workflow to the end, waking each durable sleep as soon as the run
 * reaches it so polling loops finish in milliseconds instead of minutes.
 * Records the tenant's progress after every wake so tests can assert that
 * Frank sees incremental progress.
 */
async function driveToCompletion(run: Run<unknown>, tenantId: string) {
  const timeline: string[] = [];
  for (let round = 0; round < 200; round += 1) {
    const status = await run.status;
    if (status === "completed" || status === "failed" || status === "cancelled") {
      return { status, timeline };
    }
    try {
      // @workflow/vitest carries its own copy of the runtime types.
      const sleepId = await waitForSleep(run as unknown as Parameters<typeof waitForSleep>[0], {
        timeout: 3_000,
        pollInterval: 20,
      });
      const tenant = await getServices().tenants.get(tenantId);
      const running = tenant?.progress?.steps.find((step) => step.state === "running");
      if (running) timeline.push(`${running.id}: ${running.detail ?? ""}`);
      await getRun(run.runId).wakeUp({ correlationIds: [sleepId] });
    } catch {
      // No pending sleep yet (a step is executing); check the status again.
    }
  }
  throw new Error("Workflow did not finish.");
}

describe("tenant workflows (Workflow SDK, in-process)", () => {
  beforeEach(async () => {
    await resetMemoryState();
  });

  it("creates a tenant site end to end and records incremental progress", async () => {
    const tenant = await createSampleTenant();
    const run = await start(createTenantWorkflow, [tenant.id, tenant.model]);

    const { status, timeline } = await driveToCompletion(run, tenant.id);
    expect(status).toBe("completed");
    expect(await run.returnValue).toEqual({ tenantId: tenant.id, status: "live" });

    const live = await getServices().tenants.require(tenant.id);
    expect(live.status).toBe("live");
    expect(live.url).toBe("https://coldsnap-marks-bakery.vercel.app");
    expect(live.progress?.steps.every((step) => step.state === "done" || step.state === "skipped")).toBe(true);

    // While waiting, the dashboard showed the agent's activity, then the build.
    expect(timeline.some((entry) => entry.startsWith("generate: Codex"))).toBe(true);
    expect(timeline.some((entry) => entry.startsWith("build:"))).toBe(true);
    expect(memoryVercelState().projects.size).toBe(1);
  });

  it("modifies a live site through a second workflow", async () => {
    const tenant = await createSampleTenant();
    await driveToCompletion(await start(createTenantWorkflow, [tenant.id, tenant.model]), tenant.id);
    const before = await getServices().tenants.require(tenant.id);

    const run = await start(modifyTenantWorkflow, [
      tenant.id,
      "Add a testimonials section.",
      "anthropic/claude-sonnet-5",
    ]);
    const { status } = await driveToCompletion(run, tenant.id);
    expect(status).toBe("completed");

    const after = await getServices().tenants.require(tenant.id);
    expect(after.status).toBe("live");
    expect(after.model).toBe("anthropic/claude-sonnet-5");
    expect(after.deploymentId).not.toBe(before.deploymentId);
    expect(after.progress?.operation).toBe("modify");
  });

  it("marks the tenant failed and fails the run when the agent fails", async () => {
    const tenant = await createSampleTenant({ name: "fail-agent studio" });
    const run = await start(createTenantWorkflow, [tenant.id, tenant.model]);

    const { status } = await driveToCompletion(run, tenant.id);
    expect(status).toBe("failed");

    const failed = await getServices().tenants.require(tenant.id);
    expect(failed.status).toBe("failed");
    expect(failed.lastError).toMatch(/simulated/);
    expect(failed.progress?.steps.find((step) => step.id === "generate")?.state).toBe("failed");
  });
});
