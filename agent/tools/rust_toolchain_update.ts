import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";

import { runRustToolchainChore } from "../lib/claude-code-chore";

/**
 * Drives the Rust toolchain chore through the Claude Code harness.
 *
 * This is a workflow tool so the turn is durable: the chore can outlive a
 * single function invocation while the sandbox, clone, and Claude Code session
 * all live inside one retryable step.
 */
export default defineWorkflowTool({
  description:
    "Update one repository's pinned Rust toolchain to the latest stable release, " +
    "fix any newly introduced lints, and open a pull request. Runs Claude Code in " +
    "an isolated Vercel Sandbox. Returns Claude Code's report of what it did.",
  inputSchema: z.object({
    repository: z
      .string()
      .describe("Repository in owner/name form, for example wack/multitool."),
  }),
  async execute({ repository }, _ctx) {
    "use workflow";
    return await runChore(repository);
  },
});

async function runChore(repository: string) {
  "use step";
  const report = await runRustToolchainChore(repository);
  return { repository, report };
}
