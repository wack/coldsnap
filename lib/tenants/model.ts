/**
 * The tenant record and the progress plan Frank watches while a site builds.
 */

export type TenantStatus =
  /** The create workflow is running; the site is not reachable yet. */
  | "creating"
  /** The site is deployed and serving. */
  | "live"
  /** A modify workflow is running; the previous deployment keeps serving. */
  | "updating"
  /** Creation failed before the site went live. Frank can retry or delete. */
  | "failed"
  /** Delete was requested; teardown is in progress or needs a retry. */
  | "deleting";

export type Operation = "create" | "modify";

export type StepId =
  | "project"
  | "domain"
  | "generate"
  | "deploy"
  | "build"
  | "preview"
  | "live";

export type StepState = "pending" | "running" | "done" | "skipped" | "failed";

export interface ProgressStep {
  readonly id: StepId;
  readonly label: string;
  readonly state: StepState;
  /** One line of context: the live URL, the agent's latest activity, an error. */
  readonly detail?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
}

export interface TenantProgress {
  readonly operation: Operation;
  readonly steps: readonly ProgressStep[];
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly error?: string;
}

export interface Tenant {
  readonly id: string;
  /** What Frank typed, e.g. "Mark's Bakery". Shown as the card title. */
  readonly name: string;
  /** DNS label derived from the name, e.g. `marks-bakery`. */
  readonly subdomain: string;
  readonly description: string;
  /** The lead's email. Also the username for the site's login page. */
  readonly email: string;
  readonly password: string;
  /** Signs the tenant site's session cookies. Never shown in the UI. */
  readonly sessionSecret: string;
  /** Gateway model id used for the latest build. */
  readonly model: string;
  readonly status: TenantStatus;
  readonly progress: TenantProgress | null;
  /** Latest line of agent activity during a build, written by the eve agent. */
  readonly activity: string | null;
  readonly lastError: string | null;
  readonly vercelProjectName: string;
  readonly vercelProjectId: string | null;
  /** Custom domain when COLDSNAP_ROOT_DOMAIN is configured. */
  readonly domain: string | null;
  /** Public URL of the live site. */
  readonly url: string | null;
  readonly deploymentId: string | null;
  /** Object-store URL of the source bundle behind the live deployment. */
  readonly sourceUrl: string | null;
  readonly previewImageUrl: string | null;
  readonly workflowRunId: string | null;
  readonly agentSessionId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type NewTenant = Pick<
  Tenant,
  | "id"
  | "name"
  | "subdomain"
  | "description"
  | "email"
  | "password"
  | "sessionSecret"
  | "model"
  | "vercelProjectName"
  | "domain"
> & { readonly status: TenantStatus; readonly progress: TenantProgress | null };

export type TenantPatch = Partial<
  Omit<Tenant, "id" | "subdomain" | "sessionSecret" | "createdAt" | "updatedAt">
>;

const STEP_LABELS: Record<StepId, string> = {
  project: "Create Vercel project",
  domain: "Attach domain",
  generate: "Generate site with eve",
  deploy: "Upload to Vercel",
  build: "Build on Vercel",
  preview: "Capture preview",
  live: "Go live",
};

const OPERATION_STEPS: Record<Operation, readonly StepId[]> = {
  create: ["project", "domain", "generate", "deploy", "build", "preview", "live"],
  modify: ["generate", "deploy", "build", "preview", "live"],
};

export function planProgress(operation: Operation, now: Date): TenantProgress {
  return {
    operation,
    startedAt: now.toISOString(),
    steps: OPERATION_STEPS[operation].map((id) => ({
      id,
      label: STEP_LABELS[id],
      state: "pending" as const,
    })),
  };
}

export type StepUpdate = {
  readonly state: StepState;
  readonly detail?: string;
};

/**
 * Applies one step transition. Pure, so the same logic runs in workflow steps
 * and in tests; timestamps are taken from `now` rather than the clock.
 */
export function updateStep(
  progress: TenantProgress,
  id: StepId,
  update: StepUpdate,
  now: Date,
): TenantProgress {
  const at = now.toISOString();
  return {
    ...progress,
    steps: progress.steps.map((step) => {
      if (step.id !== id) return step;
      const next: ProgressStep = {
        ...step,
        state: update.state,
        detail: update.detail ?? (update.state === step.state ? step.detail : undefined),
      };
      if (update.state === "running") {
        return { ...next, startedAt: step.startedAt ?? at, finishedAt: undefined };
      }
      if (update.state === "pending") return next;
      return { ...next, startedAt: step.startedAt ?? at, finishedAt: at };
    }),
  };
}

/** Marks whichever step was running as failed and records the error. */
export function failProgress(progress: TenantProgress, error: string, now: Date): TenantProgress {
  const running = progress.steps.find((step) => step.state === "running");
  const failedId =
    running?.id ?? progress.steps.find((step) => step.state === "pending")?.id;
  const updated = failedId
    ? updateStep(progress, failedId, { state: "failed", detail: error }, now)
    : progress;
  return { ...updated, error, finishedAt: now.toISOString() };
}

export function finishProgress(progress: TenantProgress, now: Date): TenantProgress {
  return { ...progress, finishedAt: now.toISOString() };
}

/** Fraction of steps that are settled, for the progress meter. */
export function progressFraction(progress: TenantProgress): number {
  const settled = progress.steps.filter(
    (step) => step.state === "done" || step.state === "skipped",
  ).length;
  return progress.steps.length === 0 ? 0 : settled / progress.steps.length;
}

export function isBusy(status: TenantStatus): boolean {
  return status === "creating" || status === "updating" || status === "deleting";
}
