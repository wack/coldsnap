import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";

import { JOB_ATTRIBUTE } from "../../lib/agent/job";
import { buildSiteWithCodex } from "../lib/codex-build";

/**
 * Hands the agent's design plan to Codex, which builds the site in a Vercel
 * Sandbox and saves its source where the Coldsnap workflow expects it.
 *
 * A workflow tool so the turn is durable: the build can outlive a single
 * function invocation while the sandbox and the Codex session live inside one
 * retryable step. Everything about the job (brief, starting source, output
 * location, model) comes from the job Coldsnap attached to the session, never
 * from the model's arguments.
 */
export default defineWorkflowTool({
  description:
    "Build (or modify) this session's Coldsnap site. Runs Codex in an isolated Vercel " +
    "Sandbox on the job Coldsnap attached to the session, verifies `next build`, and saves " +
    "the source for deployment. Call it exactly once, after loading the frontend-design " +
    "skill and writing the design plan. Returns whether the build succeeded and a summary.",
  inputSchema: z.object({
    designPlan: z
      .string()
      .min(40)
      .describe(
        "The design plan from the frontend-design skill: palette as 4-6 named hex values, " +
          "typefaces and roles, layout concept with alignment, the single memorable hero " +
          "moment, and principles. For a modify job, describe the change and how it fits the " +
          "existing design.",
      ),
    notes: z
      .string()
      .optional()
      .describe("Anything else Codex should know: copy direction, sections, constraints."),
  }),
  async *execute({ designPlan, notes }, ctx) {
    "use workflow";
    const jobPathname = ctx.session.auth.initiator?.attributes[JOB_ATTRIBUTE];
    if (typeof jobPathname !== "string") {
      return {
        ok: false,
        summary:
          "No Coldsnap build job is attached to this session. Sites are built from the " +
          "Coldsnap dashboard, not from chat.",
      };
    }
    yield { activity: "Codex is building the site in a Vercel Sandbox" };
    return await runBuild(jobPathname, designPlan, notes ?? null);
  },
});

async function runBuild(jobPathname: string, designPlan: string, notes: string | null) {
  "use step";
  return buildSiteWithCodex({ jobPathname, designPlan, notes });
}
