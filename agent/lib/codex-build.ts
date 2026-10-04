import { HarnessAgent } from "@ai-sdk/harness/agent";
import { createCodex } from "@ai-sdk/harness-codex";
import { createVercelNetworkSandboxSession } from "@ai-sdk/sandbox-vercel";

import { siteBuildJobSchema, type SiteBuildJob } from "../../lib/agent/job";
import { parseBundle, serializeBundle, type SourceBundle } from "../../lib/source/bundle";
import { getObjectStore } from "../../lib/storage";
import type { ObjectStore } from "../../lib/storage/object-store";
import { SqlTenantRepository } from "../../lib/tenants/repository";
import {
  FORBIDDEN_PATHS,
  PROTECTED_PATHS,
  TEMPLATE_FILES,
  enforceProtectedFiles,
  templateBundle,
} from "../../lib/tenant-template";
import { FRONTEND_DESIGN_SKILL } from "./frontend-design-skill.generated";

/** Port the Codex bridge binds inside the sandbox. */
const BRIDGE_PORT = 4000;
/** Site checkout, relative to the sandbox's default working directory. */
const SITE_DIR = "site";
/** Budget for Codex's main pass and its single repair pass. */
const CODEX_TIMEOUT_MS = Number(process.env.COLDSNAP_CODEX_TIMEOUT_MS ?? 7 * 60_000);
const REPAIR_TIMEOUT_MS = Number(process.env.COLDSNAP_CODEX_REPAIR_TIMEOUT_MS ?? 150_000);
const BUILD_TIMEOUT_MS = 4 * 60_000;

/**
 * The snapshot caches the template's installed dependencies, so it must be
 * rebuilt whenever the template's package.json changes.
 */
const BOOTSTRAP_HASH = `coldsnap-template-${hashString(
  TEMPLATE_FILES.find((file) => file.path === "package.json")?.content ?? "",
)}`;

const CODEX_INSTRUCTIONS = `You build private marketing websites for Frank, a freelance videographer. Each site is a lead magnet made for one prospective client (the "lead") to show them, concretely, what Frank's video work could do for their business.

The working directory is a Next.js 16 App Router app with Tailwind CSS v4 and shadcn/ui. Read AGENTS.md first and follow it exactly; it lists files you must not touch.

Apply the frontend-design skill. Implement the design plan in the prompt faithfully: its palette, typography, and layout. Express the palette through the theme tokens in app/globals.css and the fonts through next/font in app/layout.tsx so every page, including the login page, matches.

Write real, specific copy from the brief. No lorem ipsum, no placeholder brand names, no stock-photo URLs. Use inline SVG or CSS for imagery. The site must be responsive, accessible, and respect prefers-reduced-motion.

When you are done, run \`npm run build\` and fix every error until it passes. Do not start a dev server, deploy, or ask questions: nobody is watching this run.`;

export interface CodexBuildResult {
  readonly ok: boolean;
  readonly summary: string;
  readonly files?: number;
}

/** Writes one line of progress where the Coldsnap dashboard can see it. */
export type ActivityReporter = (activity: string) => void;

/**
 * Builds or modifies a tenant site with Codex in a Vercel Sandbox.
 *
 * Reads the job Coldsnap stored, materializes the starting source (the
 * template, or the site's current bundle), lets Codex implement the agent's
 * design plan, enforces the login gate, verifies `next build`, and writes the
 * finished source bundle to the job's output pathname.
 */
export async function buildSiteWithCodex(input: {
  readonly jobPathname: string;
  readonly designPlan: string;
  readonly notes: string | null;
}): Promise<CodexBuildResult> {
  const objects = getObjectStore();
  const job = await loadJob(objects, input.jobPathname);
  const report = activityReporter(job.tenantId);
  const startingSource = job.sourceUrl ? await loadBundle(objects, job.sourceUrl) : templateBundle();

  report("Starting a Vercel Sandbox");
  const agent = new HarnessAgent({
    harness: createCodex({ auth: await gatewayAuth(), port: BRIDGE_PORT, reasoningEffort: "medium" }),
    model: job.model,
    instructions: CODEX_INSTRUCTIONS,
    skills: [FRONTEND_DESIGN_SKILL],
    sandboxConfig: {
      workDir: SITE_DIR,
      bootstrapHash: BOOTSTRAP_HASH,
      // Runs once per snapshot: install the template's dependencies so each
      // build starts with node_modules already in place.
      onBootstrap: async ({ session, workDir, abortSignal }) => {
        const packageJson = TEMPLATE_FILES.find((file) => file.path === "package.json")!;
        await session.writeTextFile({ path: `${workDir}/package.json`, content: packageJson.content });
        await expectSuccess(
          session.run({ command: "npm install --no-audit --no-fund", workingDirectory: workDir, abortSignal }),
          "Installing template dependencies",
        );
      },
    },
  });

  const sandbox = await createVercelNetworkSandboxSession({
    runtime: "node24",
    ports: [BRIDGE_PORT],
    timeout: 20 * 60_000,
    resources: { vcpus: 4 },
    template: await agent.getSandboxTemplate(),
  });

  try {
    const siteDir = await absoluteSiteDir(sandbox);
    report("Copying the site's source into the sandbox");
    await writeSource(sandbox, siteDir, startingSource);
    await expectSuccess(
      sandbox.run({ command: "npm install --no-audit --no-fund", workingDirectory: siteDir }),
      "Installing dependencies",
    );

    const session = await agent.createSession({ sandboxSession: sandbox });
    try {
      report("Codex is reading the brief");
      let summary = await runCodex(agent, session, codexPrompt(job, input), CODEX_TIMEOUT_MS, report);

      await restoreProtectedFiles(sandbox, siteDir);
      report("Running next build");
      let build = await runBuild(sandbox, siteDir);
      if (!build.ok) {
        report("Build failed; Codex is fixing it");
        summary = await runCodex(
          agent,
          session,
          `\`npm run build\` failed. Fix the errors below, then run it again until it passes.\n\n${build.output}`,
          REPAIR_TIMEOUT_MS,
          report,
        );
        await restoreProtectedFiles(sandbox, siteDir);
        report("Running next build again");
        build = await runBuild(sandbox, siteDir);
      }
      if (!build.ok) {
        return { ok: false, summary: `next build still fails:\n${build.output.slice(-1500)}` };
      }

      report("Saving the site's source");
      const bundle = enforceProtectedFiles(await collectSource(sandbox, siteDir));
      await objects.put(job.outputPathname, serializeBundle(bundle), {
        contentType: "application/json",
      });
      report("Site built");
      return { ok: true, summary: summary.slice(0, 1200), files: bundle.files.length };
    } finally {
      await session.destroy();
    }
  } finally {
    await sandbox.destroy();
  }
}

type Agent = HarnessAgent<ReturnType<typeof createCodex>>;
type Session = Awaited<ReturnType<Agent["createSession"]>>;
type Sandbox = Awaited<ReturnType<typeof createVercelNetworkSandboxSession>>;

async function runCodex(
  agent: Agent,
  session: Session,
  prompt: string,
  timeoutMs: number,
  report: ActivityReporter,
): Promise<string> {
  const result = await agent.stream({
    session,
    prompt,
    abortSignal: AbortSignal.timeout(timeoutMs),
  });
  for await (const part of result.fullStream as AsyncIterable<{
    type: string;
    toolName?: string;
    input?: unknown;
  }>) {
    if (part.type === "tool-call" && part.toolName) {
      report(describeToolCall(part.toolName, part.input));
    }
  }
  return (await result.text).trim();
}

/** Turns a Codex tool call into one line Frank can read. */
export function describeToolCall(toolName: string, input: unknown): string {
  if (toolName === "apply_patch") {
    const patch = typeof input === "string" ? input : JSON.stringify(input ?? "");
    const files = [...patch.matchAll(/\*\*\* (?:Add|Update|Delete) File: (.+)/g)].map((m) => m[1]!.trim());
    return files.length > 0 ? `Editing ${files.slice(0, 3).join(", ")}` : "Editing files";
  }
  if (toolName === "bash") {
    const command = (input as { command?: unknown } | null)?.command;
    if (typeof command === "string") {
      if (command.includes("npm run build") || command.includes("next build")) return "Running next build";
      if (command.includes("shadcn")) return "Adding shadcn components";
      if (command.includes("npm install")) return "Installing packages";
      return `Running ${command.split("\n")[0]!.slice(0, 60)}`;
    }
  }
  if (toolName === "view_image") return "Reviewing a rendered image";
  return `Using ${toolName}`;
}

function codexPrompt(
  job: SiteBuildJob,
  input: { readonly designPlan: string; readonly notes: string | null },
): string {
  const sections = [
    job.kind === "create"
      ? `Build the site for "${job.site.name}" from the template in this directory.`
      : `Modify the existing site for "${job.site.name}" in this directory. Keep everything Frank did not ask to change.`,
    `## Frank's description of the site\n${job.site.description}`,
  ];
  if (job.kind === "modify" && job.instructions) {
    sections.push(`## Frank's change request\n${job.instructions}`);
  }
  sections.push(`## Design plan\n${input.designPlan}`);
  if (input.notes) sections.push(`## Notes\n${input.notes}`);
  sections.push("Finish by summarizing what you built or changed in two or three sentences.");
  return sections.join("\n\n");
}

async function loadJob(objects: ObjectStore, jobPathname: string): Promise<SiteBuildJob> {
  const json = await objects.getText(jobPathname);
  if (json === null) throw new Error(`Build job ${jobPathname} was not found.`);
  return siteBuildJobSchema.parse(JSON.parse(json));
}

async function loadBundle(objects: ObjectStore, url: string): Promise<SourceBundle> {
  const json = await objects.getText(url);
  if (json === null) throw new Error("The site's current source could not be read.");
  return parseBundle(json);
}

/**
 * Prefers an explicit Gateway key; on Vercel, falls back to the function's
 * OIDC token, which AI Gateway accepts for the same team.
 */
async function gatewayAuth(): Promise<{ AI_GATEWAY_API_KEY: string } | undefined> {
  if (process.env.AI_GATEWAY_API_KEY) return { AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY };
  try {
    const { getVercelOidcToken } = await import("@vercel/oidc");
    return { AI_GATEWAY_API_KEY: await getVercelOidcToken() };
  } catch {
    return undefined;
  }
}

async function absoluteSiteDir(sandbox: Sandbox): Promise<string> {
  const { stdout } = await sandbox.run({ command: "pwd" });
  return `${stdout.trim()}/${SITE_DIR}`;
}

/** Replaces everything in the site directory except installed dependencies. */
async function writeSource(sandbox: Sandbox, siteDir: string, bundle: SourceBundle): Promise<void> {
  await expectSuccess(
    sandbox.run({
      command: `mkdir -p ${siteDir} && find ${siteDir} -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +`,
    }),
    "Clearing the site directory",
  );
  for (const file of bundle.files) {
    const path = `${siteDir}/${file.path}`;
    if (file.encoding === "base64") {
      await sandbox.writeBinaryFile({ path, content: Buffer.from(file.content, "base64") });
    } else {
      await sandbox.writeTextFile({ path, content: file.content });
    }
  }
}

async function restoreProtectedFiles(sandbox: Sandbox, siteDir: string): Promise<void> {
  for (const path of PROTECTED_PATHS) {
    const file = TEMPLATE_FILES.find((candidate) => candidate.path === path)!;
    await sandbox.writeTextFile({ path: `${siteDir}/${path}`, content: file.content });
  }
  await sandbox.run({
    command: `rm -f ${FORBIDDEN_PATHS.map((path) => `'${siteDir}/${path}'`).join(" ")}`,
  });
}

async function runBuild(sandbox: Sandbox, siteDir: string): Promise<{ ok: boolean; output: string }> {
  const result = await sandbox.run({
    command: "npm run build 2>&1",
    workingDirectory: siteDir,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
    abortSignal: AbortSignal.timeout(BUILD_TIMEOUT_MS),
  });
  return { ok: result.exitCode === 0, output: `${result.stdout}${result.stderr}`.slice(-6000) };
}

/** Node script run inside the sandbox to serialize the site into a bundle. */
const COLLECT_SCRIPT = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2];
const skip = new Set(["node_modules", ".next", ".git", ".vercel", "next-env.d.ts"]);
const binary = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm|mp3|pdf)$/i;
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name) || entry.name.endsWith(".tsbuildinfo")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile()) {
      const rel = path.relative(root, full).split(path.sep).join("/");
      const isBinary = binary.test(entry.name);
      files.push({ path: rel, content: fs.readFileSync(full).toString(isBinary ? "base64" : "utf8"), encoding: isBinary ? "base64" : "utf-8" });
    }
  }
})(root);
fs.writeFileSync(process.argv[3], JSON.stringify({ version: 1, files }));
`;

async function collectSource(sandbox: Sandbox, siteDir: string): Promise<SourceBundle> {
  const scriptPath = "/tmp/coldsnap-collect.cjs";
  const outputPath = "/tmp/coldsnap-bundle.json";
  await sandbox.writeTextFile({ path: scriptPath, content: COLLECT_SCRIPT });
  await expectSuccess(
    sandbox.run({ command: `node ${scriptPath} ${siteDir} ${outputPath}` }),
    "Collecting the site's source",
  );
  const json = await sandbox.readTextFile({ path: outputPath });
  if (json === null) throw new Error("The collected source bundle is missing.");
  return parseBundle(json);
}

async function expectSuccess(
  pending: PromiseLike<{ exitCode: number; stdout: string; stderr: string }>,
  what: string,
): Promise<void> {
  const result = await pending;
  if (result.exitCode !== 0) {
    throw new Error(`${what} failed (exit ${result.exitCode}):\n${(result.stderr || result.stdout).slice(-2000)}`);
  }
}

/**
 * Throttled writer for the tenant's `activity` column, which the dashboard
 * shows under "Generate site". Only the deployed app shares a database with
 * the agent (`DATABASE_URL`); elsewhere activity goes to the log.
 */
function activityReporter(tenantId: string): ActivityReporter {
  const tenants = new SqlTenantRepository();
  let lastWrite = 0;
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const write = (activity: string) => {
    lastWrite = Date.now();
    console.info(`[coldsnap] ${tenantId}: ${activity}`);
    if (!process.env.DATABASE_URL) return;
    void tenants.setActivity(tenantId, activity).catch((error: unknown) => {
      console.warn("[coldsnap] could not record activity", error);
    });
  };
  return (activity) => {
    const wait = 3_000 - (Date.now() - lastWrite);
    if (wait <= 0) {
      write(activity);
      return;
    }
    pending = activity;
    timer ??= setTimeout(() => {
      timer = undefined;
      if (pending) write(pending);
      pending = null;
    }, wait);
  };
}

/** Short, stable FNV-1a hash for cache keys. */
function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
