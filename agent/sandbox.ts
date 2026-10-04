import { defineSandbox } from "eve/sandbox";
import { VercelSandbox } from "eve/sandbox/vercel";

/**
 * Placeholder sandbox for the dispatching agent.
 *
 * eve always prepares one sandbox template for the root agent, but this agent
 * never runs commands: every chore executes inside the Claude Code harness's
 * own Vercel Sandbox, created per chore in `lib/claude-code-chore.ts`. With
 * `defaultTools: false` nothing here calls `ctx.getSandbox()`, so only the
 * template is built and no live sandbox is ever started.
 */
export const environment = VercelSandbox.environment();

export default defineSandbox(() => environment.open({ networkPolicy: "deny-all" }));
