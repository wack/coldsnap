import { siteBuildResultSchema } from "./job";
import type { SiteBuildStatus } from "./site-builder";

/** The fields of an eve stream event this module reads. */
export interface BuildStreamEvent {
  readonly type: string;
  readonly data?: unknown;
}

const SKILL_ACTIVITY = "Reading the frontend-design skill";
const TOOL_ACTIVITY: Record<string, string> = {
  build_site: "Codex is building the site in a Vercel Sandbox",
};

/**
 * Reduces a build session's event stream, read from the start, to a status.
 *
 * One session runs one job in one turn, so the first terminal signal decides
 * the outcome: a structured `result.completed`, a failure event, or the
 * session parking (`session.waiting`) without a result.
 */
export function classifyBuildEvents(events: readonly BuildStreamEvent[]): SiteBuildStatus {
  let detail: string | undefined;
  // A session can park before its first turn starts; only a park after the
  // turn began means the turn ended.
  let turnStarted = false;

  for (const event of events) {
    const data = (event.data ?? {}) as Record<string, unknown>;
    switch (event.type) {
      case "turn.started":
        turnStarted = true;
        break;
      case "actions.requested": {
        const described = describeActions(data.actions);
        if (described) detail = described;
        break;
      }
      case "action.partial": {
        const result = data.result as { output?: { activity?: unknown } } | undefined;
        if (typeof result?.output?.activity === "string") detail = result.output.activity;
        break;
      }
      case "result.completed": {
        const parsed = siteBuildResultSchema.safeParse(data.result);
        if (!parsed.success) {
          return { state: "failed", error: "The agent returned a malformed result." };
        }
        return parsed.data.status === "built"
          ? { state: "succeeded", summary: parsed.data.summary }
          : { state: "failed", error: parsed.data.summary };
      }
      case "turn.failed":
      case "session.failed":
        return { state: "failed", error: errorMessage(data) };
      case "turn.cancelled":
        return { state: "failed", error: "The agent's turn was cancelled." };
      case "session.waiting":
        if (turnStarted) {
          return { state: "failed", error: "The agent finished without reporting a result." };
        }
        break;
      case "session.completed":
        return { state: "failed", error: "The agent finished without reporting a result." };
      default:
        break;
    }
  }
  return detail ? { state: "running", detail } : { state: "running" };
}

function describeActions(actions: unknown): string | undefined {
  if (!Array.isArray(actions)) return undefined;
  let described: string | undefined;
  for (const action of actions as Array<{ kind?: unknown; toolName?: unknown }>) {
    if (action.kind === "load-skill") described = SKILL_ACTIVITY;
    if (typeof action.toolName === "string" && TOOL_ACTIVITY[action.toolName]) {
      described = TOOL_ACTIVITY[action.toolName];
    }
  }
  return described;
}

function errorMessage(data: Record<string, unknown>): string {
  const error = (data.error ?? data) as { message?: unknown; code?: unknown };
  if (typeof error.message === "string" && error.message.length > 0) return error.message;
  if (typeof error.code === "string") return `The agent failed (${error.code}).`;
  return "The agent failed.";
}
