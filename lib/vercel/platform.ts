/**
 * The slice of the Vercel API that multi-project mode needs: one Vercel
 * project per tenant, its environment, its domain, and its deployments.
 *
 * Every mutating method is idempotent so a retried workflow step can call it
 * again safely.
 */
export interface DeploymentFile {
  readonly file: string;
  readonly data: string;
  readonly encoding: "utf-8" | "base64";
}

export type DeploymentState =
  | "QUEUED"
  | "INITIALIZING"
  | "BUILDING"
  | "READY"
  | "ERROR"
  | "CANCELED";

export interface DeploymentStatus {
  readonly id: string;
  readonly state: DeploymentState;
  /** Deployment-specific hostname, without a scheme. */
  readonly url: string;
  /** Hostnames assigned to the deployment once it is promoted. */
  readonly aliases: readonly string[];
  readonly errorMessage?: string;
}

export interface VercelPlatform {
  /** Creates the project, or returns it when a previous attempt already did. */
  ensureProject(name: string): Promise<{ readonly id: string; readonly name: string }>;
  /** Creates or overwrites encrypted environment variables. */
  upsertEnv(projectId: string, variables: Readonly<Record<string, string>>): Promise<void>;
  addDomain(projectId: string, domain: string): Promise<void>;
  createDeployment(input: {
    readonly projectId: string;
    readonly projectName: string;
    readonly files: readonly DeploymentFile[];
  }): Promise<{ readonly id: string; readonly url: string }>;
  getDeployment(id: string): Promise<DeploymentStatus>;
  /** Deletes the project with its deployments and domains. Missing is fine. */
  deleteProject(projectIdOrName: string): Promise<void>;
}

export function isTerminalDeploymentState(state: DeploymentState): boolean {
  return state === "READY" || state === "ERROR" || state === "CANCELED";
}
