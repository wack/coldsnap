import { describe, expect, it } from "vitest";

import { classifyBuildEvents } from "@/lib/agent/build-events";
import { renderBuildRequest, siteBuildJobSchema, type SiteBuildJob } from "@/lib/agent/job";
import { FALLBACK_MODELS, selectBuildModels } from "@/lib/models/gateway";
import { parseBundle, serializeBundle } from "@/lib/source/bundle";
import { enforceProtectedFiles, templateBundle } from "@/lib/tenant-template";

const job: SiteBuildJob = {
  version: 1,
  buildId: "b1",
  tenantId: "t1",
  kind: "modify",
  site: { name: "Mark's Bakery", subdomain: "marks-bakery", description: "Sourdough." },
  instructions: "Add a pricing section.",
  model: "openai/gpt-5.5",
  sourceUrl: "https://blob.example/sources/t1/b0.json",
  outputPathname: "sources/t1/b1.json",
};

describe("site build job", () => {
  it("validates model ids", () => {
    expect(siteBuildJobSchema.safeParse(job).success).toBe(true);
    expect(siteBuildJobSchema.safeParse({ ...job, model: "gpt-5.5" }).success).toBe(false);
    expect(siteBuildJobSchema.safeParse({ ...job, model: "openai/gpt 5" }).success).toBe(false);
  });

  it("puts Frank's words in front of the agent", () => {
    expect(renderBuildRequest(job)).toContain("Add a pricing section.");
    expect(renderBuildRequest({ ...job, kind: "create", instructions: null })).toContain("Sourdough.");
  });
});

describe("classifyBuildEvents", () => {
  it("reports progress from tool calls and tool snapshots", () => {
    expect(
      classifyBuildEvents([
        { type: "session.started" },
        { type: "actions.requested", data: { actions: [{ kind: "load-skill", callId: "1" }] } },
      ]),
    ).toEqual({ state: "running", detail: "Reading the frontend-design skill" });
    expect(
      classifyBuildEvents([
        { type: "actions.requested", data: { actions: [{ kind: "workflow-tool-call", toolName: "build_site" }] } },
        { type: "action.partial", data: { result: { output: { activity: "Running next build" } } } },
      ]),
    ).toEqual({ state: "running", detail: "Running next build" });
  });

  it("succeeds on a built result and fails on a failed one", () => {
    expect(
      classifyBuildEvents([
        { type: "result.completed", data: { result: { status: "built", summary: "Done." } } },
        { type: "session.waiting" },
      ]),
    ).toEqual({ state: "succeeded", summary: "Done." });
    expect(
      classifyBuildEvents([{ type: "result.completed", data: { result: { status: "failed", summary: "No." } } }]),
    ).toEqual({ state: "failed", error: "No." });
  });

  it("fails on turn failures, cancellation, and a result-less finish", () => {
    expect(classifyBuildEvents([{ type: "turn.failed", data: { code: "X", message: "Model error" } }])).toEqual({
      state: "failed",
      error: "Model error",
    });
    expect(classifyBuildEvents([{ type: "turn.cancelled" }])).toMatchObject({ state: "failed" });
    expect(classifyBuildEvents([{ type: "turn.started" }, { type: "session.waiting" }])).toMatchObject({
      state: "failed",
      error: expect.stringContaining("without reporting"),
    });
  });

  it("keeps waiting when the session parks before its first turn starts", () => {
    expect(classifyBuildEvents([{ type: "session.started" }, { type: "session.waiting" }])).toEqual({
      state: "running",
    });
  });
});

describe("source bundles", () => {
  it("round-trips the template", () => {
    const bundle = templateBundle();
    expect(parseBundle(serializeBundle(bundle))).toEqual(bundle);
  });

  it("rejects path traversal and duplicates", () => {
    const bad = (path: string) =>
      JSON.stringify({ version: 1, files: [{ path, content: "", encoding: "utf-8" }] });
    expect(() => parseBundle(bad("../etc/passwd"))).toThrow(/unsafe/);
    expect(() => parseBundle(bad("/abs.ts"))).toThrow(/unsafe/);
    expect(() => parseBundle(bad("app/../../x.ts"))).toThrow(/unsafe/);
    expect(() =>
      parseBundle(
        JSON.stringify({
          version: 1,
          files: [
            { path: "a.ts", content: "", encoding: "utf-8" },
            { path: "a.ts", content: "", encoding: "utf-8" },
          ],
        }),
      ),
    ).toThrow(/repeats/);
  });

  it("restores protected files and removes middleware", () => {
    const enforced = enforceProtectedFiles({
      version: 1,
      files: [
        { path: "lib/coldsnap-auth.ts", content: "hacked", encoding: "utf-8" },
        { path: "middleware.ts", content: "", encoding: "utf-8" },
        { path: "app/page.tsx", content: "page", encoding: "utf-8" },
      ],
    });
    const paths = enforced.files.map((file) => file.path);
    expect(paths).toContain("app/page.tsx");
    expect(paths).not.toContain("middleware.ts");
    expect(enforced.files.find((file) => file.path === "lib/coldsnap-auth.ts")!.content).toContain(
      "verifySessionToken",
    );
  });
});

describe("selectBuildModels", () => {
  it("keeps tool-using structured-output language models, OpenAI first", () => {
    const models = selectBuildModels({
      data: [
        { id: "zai/glm-5", name: "GLM 5", owned_by: "zai", type: "language", tags: ["tool-use", "structured-output"] },
        { id: "openai/gpt-5.5", name: "GPT-5.5", owned_by: "openai", type: "language", tags: ["tool-use", "structured-output", "reasoning"] },
        { id: "openai/text-embedding-3", owned_by: "openai", type: "embedding", tags: [] },
        { id: "acme/chatty", owned_by: "acme", type: "language", tags: ["tool-use"] },
        { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", owned_by: "anthropic", type: "language", tags: ["structured-output", "tool-use"] },
      ],
    });
    expect(models.map((model) => model.id)).toEqual([
      "openai/gpt-5.5",
      "anthropic/claude-sonnet-5",
      "zai/glm-5",
    ]);
    expect(models[0]!.recommended).toBe(true);
  });

  it("returns nothing for an unexpected payload, and the fallback list is usable", () => {
    expect(selectBuildModels({})).toEqual([]);
    expect(FALLBACK_MODELS.every((model) => siteBuildJobSchema.shape.model.safeParse(model.id).success)).toBe(true);
  });
});
