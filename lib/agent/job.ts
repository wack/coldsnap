import { z } from "zod";

/**
 * The contract between the Coldsnap workflow and the eve site-builder agent.
 *
 * The workflow writes the job to the object store and passes its pathname to
 * eve in a request header. The agent's build tool reads the job from there
 * instead of trusting anything the model repeats back, so the brief, the
 * source to start from, and the destination of the result cannot drift.
 */
export const JOB_HEADER = "x-coldsnap-job";
export const MODEL_HEADER = "x-coldsnap-model";

/** Session auth attributes the eve channel copies the headers into. */
export const JOB_ATTRIBUTE = "coldsnap:job";
export const MODEL_ATTRIBUTE = "coldsnap:model";

/** Gateway model ids look like `provider/model-name`. */
export const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*$/;

/** Job pathnames are written by Coldsnap: `jobs/<tenant id>/<build id>.json`. */
export const JOB_PATHNAME_PATTERN = /^jobs\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.json$/;

type AuthAttributes = Readonly<Record<string, string | readonly string[]>>;

/**
 * Copies the job and model headers of an authenticated eve request into the
 * session's auth attributes. Values that do not match the expected shapes are
 * dropped rather than trusted.
 */
export function withJobAttributes<T extends { readonly attributes: AuthAttributes }>(
  auth: T,
  headers: Headers,
): T {
  const attributes: Record<string, string | readonly string[]> = { ...auth.attributes };
  const job = headers.get(JOB_HEADER);
  const model = headers.get(MODEL_HEADER);
  if (job && JOB_PATHNAME_PATTERN.test(job)) attributes[JOB_ATTRIBUTE] = job;
  if (model && MODEL_ID_PATTERN.test(model)) attributes[MODEL_ATTRIBUTE] = model;
  return { ...auth, attributes };
}

/** The model a session runs on: Frank's pick when present, else the default. */
export function resolveSessionModel(attributes: AuthAttributes | undefined, fallback: string): string {
  const requested = attributes?.[MODEL_ATTRIBUTE];
  return typeof requested === "string" && MODEL_ID_PATTERN.test(requested) ? requested : fallback;
}

export const siteBuildJobSchema = z.object({
  version: z.literal(1),
  buildId: z.string().min(1),
  tenantId: z.string().min(1),
  kind: z.enum(["create", "modify"]),
  site: z.object({
    name: z.string().min(1),
    subdomain: z.string().min(1),
    description: z.string(),
  }),
  /** Frank's change request for a modify run. */
  instructions: z.string().nullable(),
  model: z.string().regex(MODEL_ID_PATTERN),
  /** Bundle to start from. `null` starts from the template. */
  sourceUrl: z.string().nullable(),
  /** Object-store pathname where the agent must write the finished bundle. */
  outputPathname: z.string().min(1),
});

export type SiteBuildJob = z.infer<typeof siteBuildJobSchema>;

/** What the agent returns as its structured turn result. */
export const siteBuildResultSchema = z.object({
  status: z.enum(["built", "failed"]),
  summary: z.string(),
});

export type SiteBuildResult = z.infer<typeof siteBuildResultSchema>;

/** JSON Schema sent as the eve turn's `outputSchema`. */
export const SITE_BUILD_RESULT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["built", "failed"] },
    summary: {
      type: "string",
      description: "Two or three sentences on what was built or changed, or why it failed.",
    },
  },
  required: ["status", "summary"],
} as const;

/** The human-readable message that starts the agent's turn. */
export function renderBuildRequest(job: SiteBuildJob): string {
  if (job.kind === "create") {
    return [
      `Build a new lead-magnet website for "${job.site.name}".`,
      "",
      "Frank's description of the site:",
      job.site.description,
    ].join("\n");
  }
  return [
    `Modify the existing website for "${job.site.name}".`,
    "",
    "Frank's change request:",
    job.instructions ?? "",
    "",
    "Original description of the site, for context:",
    job.site.description,
  ].join("\n");
}
