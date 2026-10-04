import { defineSandbox } from "eve/sandbox";
import { VercelSandbox } from "eve/sandbox/vercel";

/**
 * Placeholder sandbox for the site-builder agent.
 *
 * eve always prepares one sandbox template for the root agent, but this agent
 * never runs commands itself: every build runs inside Codex's own Vercel
 * Sandbox, created per build in `lib/codex-build.ts`. With `defaultTools:
 * false` nothing calls `ctx.getSandbox()`, so only the template is built and
 * no live sandbox is ever started.
 */
export const environment = VercelSandbox.environment();

export default defineSandbox(() => environment.open({ networkPolicy: "deny-all" }));
