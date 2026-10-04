import { beforeEach, describe, expect, it } from "vitest";

import { describeToolCall } from "@/agent/lib/codex-build";
import { FRONTEND_DESIGN_SKILL } from "@/agent/lib/frontend-design-skill.generated";
import {
  JOB_ATTRIBUTE,
  JOB_HEADER,
  JOB_PATHNAME_PATTERN,
  MODEL_ATTRIBUTE,
  MODEL_HEADER,
  resolveSessionModel,
  siteBuildJobSchema,
  withJobAttributes,
} from "@/lib/agent/job";
import * as ops from "@/lib/pipeline/operations";
import { getServices } from "@/lib/services";
import { memoryObjects } from "@/lib/storage/memory-store";

import { createSampleTenant, resetMemoryState } from "./helpers";

const caller = {
  authenticator: "vercel-oidc",
  principalType: "service",
  principalId: "prj_123",
  attributes: { team: "frank" },
};

describe("eve channel job headers", () => {
  const job = "jobs/0f8b3c3e-2b0d-4b8f-9d50-1d2c7b8a9e01/6a1f0c55-1e7f-4f39-a0b1-9b3fd0e2c4d7.json";

  it("copies a well-formed job and model into the session's auth attributes", () => {
    const auth = withJobAttributes(
      caller,
      new Headers({ [JOB_HEADER]: job, [MODEL_HEADER]: "anthropic/claude-sonnet-5" }),
    );
    expect(auth.attributes).toEqual({
      team: "frank",
      [JOB_ATTRIBUTE]: job,
      [MODEL_ATTRIBUTE]: "anthropic/claude-sonnet-5",
    });
    expect(auth.principalId).toBe("prj_123");
  });

  it("drops malformed values instead of trusting them", () => {
    const auth = withJobAttributes(
      caller,
      new Headers({ [JOB_HEADER]: "../../etc/passwd", [MODEL_HEADER]: "not a model" }),
    );
    expect(auth.attributes).toEqual({ team: "frank" });
  });
});

describe("dynamic model selection", () => {
  it("uses Frank's model when the session carries one", () => {
    expect(resolveSessionModel({ [MODEL_ATTRIBUTE]: "zai/glm-5.3" }, "openai/gpt-5.5")).toBe("zai/glm-5.3");
  });

  it("falls back to the default for chat sessions and bad values", () => {
    expect(resolveSessionModel(undefined, "openai/gpt-5.5")).toBe("openai/gpt-5.5");
    expect(resolveSessionModel({ [MODEL_ATTRIBUTE]: ["a/b"] }, "openai/gpt-5.5")).toBe("openai/gpt-5.5");
    expect(resolveSessionModel({ [MODEL_ATTRIBUTE]: "gpt" }, "openai/gpt-5.5")).toBe("openai/gpt-5.5");
  });
});

describe("workflow → agent handoff", () => {
  beforeEach(resetMemoryState);

  it("stores a job the agent can read at a pathname the channel accepts", async () => {
    const services = getServices();
    const tenant = await createSampleTenant({ model: "zai/glm-5.3" });
    const { buildId } = await ops.beginOperation(services, tenant.id, "create", tenant.model);
    await ops.provisionProject(services, tenant.id);
    await ops.startBuild(services, tenant.id, { buildId, instructions: null });

    const jobKey = [...memoryObjects().keys()].find((key) => key.startsWith("jobs/"))!;
    expect(jobKey).toMatch(JOB_PATHNAME_PATTERN);
    const job = siteBuildJobSchema.parse(JSON.parse((await services.objects.getText(jobKey))!));
    expect(job).toMatchObject({
      kind: "create",
      model: "zai/glm-5.3",
      sourceUrl: null,
      outputPathname: `sources/${tenant.id}/${buildId}.json`,
      site: { name: "Mark's Bakery", subdomain: "marks-bakery" },
    });
  });
});

describe("Codex activity lines", () => {
  it("summarizes edits and commands for the dashboard", () => {
    expect(
      describeToolCall("apply_patch", "*** Begin Patch\n*** Update File: app/page.tsx\n*** Add File: components/hero.tsx\n"),
    ).toBe("Editing app/page.tsx, components/hero.tsx");
    expect(describeToolCall("bash", { command: "npm run build" })).toBe("Running next build");
    expect(describeToolCall("bash", { command: "npx shadcn@latest add tabs" })).toBe("Adding shadcn components");
    expect(describeToolCall("bash", { command: "ls -la\nmore" })).toBe("Running ls -la");
    expect(describeToolCall("webSearch", { query: "x" })).toBe("Using webSearch");
  });
});

describe("frontend-design skill", () => {
  it("is embedded for Codex from the eve-installed SKILL.md", () => {
    expect(FRONTEND_DESIGN_SKILL.name).toBe("frontend-design");
    expect(FRONTEND_DESIGN_SKILL.content).toContain("# Frontend Design");
    expect(FRONTEND_DESIGN_SKILL.content).not.toMatch(/^---/);
  });
});
