import { Vercel } from "@vercel/sdk";

import { requireEnv } from "../config";
import type {
  DeploymentState,
  DeploymentStatus,
  DeploymentFile,
  VercelPlatform,
} from "./platform";

/**
 * Multi-project mode on the Vercel REST API, following the Vercel for
 * Platforms reference and its Deploy Files action.
 *
 * Needs `VERCEL_TOKEN` (an access token scoped to the team, allowed to create
 * projects) and `VERCEL_TEAM_ID`. The automatic OIDC token cannot manage
 * projects, so this is a separately provisioned secret.
 */
export class SdkVercelPlatform implements VercelPlatform {
  private readonly vercel: Vercel;
  private readonly teamId: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.vercel = new Vercel({ bearerToken: requireEnv("VERCEL_TOKEN", env) });
    this.teamId = requireEnv("VERCEL_TEAM_ID", env);
  }

  async ensureProject(name: string): Promise<{ id: string; name: string }> {
    const existing = await this.findProject(name);
    const project =
      existing ??
      (await this.vercel.projects.createProject({
        teamId: this.teamId,
        requestBody: { name, framework: "nextjs" },
      }));

    // New projects default to Vercel Authentication on deployment URLs. The
    // tenant site has its own login page, and the lead has no Vercel account,
    // so turn SSO protection off (the Deploy Files action does the same).
    await this.vercel.projects.updateProject({
      teamId: this.teamId,
      idOrName: project.id,
      requestBody: { ssoProtection: null },
    });
    return { id: project.id, name: project.name };
  }

  async upsertEnv(projectId: string, variables: Readonly<Record<string, string>>): Promise<void> {
    await this.vercel.projects.createProjectEnv({
      teamId: this.teamId,
      idOrName: projectId,
      upsert: "true",
      requestBody: Object.entries(variables).map(([key, value]) => ({
        key,
        value,
        type: "encrypted" as const,
        target: ["production" as const, "preview" as const],
      })),
    });
  }

  async addDomain(projectId: string, domain: string): Promise<void> {
    try {
      await this.vercel.projects.addProjectDomain({
        teamId: this.teamId,
        idOrName: projectId,
        requestBody: { name: domain },
      });
    } catch (error) {
      // 409 when a previous attempt already attached it to this project.
      if (statusOf(error) === 409 && (await this.projectHasDomain(projectId, domain))) return;
      throw error;
    }
  }

  async createDeployment(input: {
    projectId: string;
    projectName: string;
    files: readonly DeploymentFile[];
  }): Promise<{ id: string; url: string }> {
    const deployment = await this.vercel.deployments.createDeployment({
      teamId: this.teamId,
      skipAutoDetectionConfirmation: "1",
      requestBody: {
        name: input.projectName,
        project: input.projectId,
        target: "production",
        files: input.files.map((file) => ({ ...file })),
        projectSettings: { framework: "nextjs" },
      },
    });
    // The response type is a union; every variant of a created deployment has both fields.
    const created = deployment as { id: string; url: string };
    return { id: created.id, url: created.url };
  }

  async getDeployment(id: string): Promise<DeploymentStatus> {
    const deployment = await this.vercel.deployments.getDeployment({
      teamId: this.teamId,
      idOrUrl: id,
    });
    const record = deployment as {
      id: string;
      url: string;
      readyState?: string;
      alias?: string[];
      errorMessage?: string | null;
    };
    return {
      id: record.id,
      url: record.url,
      state: (record.readyState ?? "QUEUED") as DeploymentState,
      aliases: record.alias ?? [],
      errorMessage: record.errorMessage ?? undefined,
    };
  }

  async deleteProject(projectIdOrName: string): Promise<void> {
    try {
      await this.vercel.projects.deleteProject({
        teamId: this.teamId,
        idOrName: projectIdOrName,
      });
    } catch (error) {
      if (statusOf(error) === 404) return;
      throw error;
    }
  }

  private async findProject(name: string): Promise<{ id: string; name: string } | null> {
    try {
      const project = await this.vercel.projects.getProject({
        teamId: this.teamId,
        idOrName: name,
      });
      return { id: project.id, name: project.name };
    } catch (error) {
      if (statusOf(error) === 404) return null;
      throw error;
    }
  }

  private async projectHasDomain(projectId: string, domain: string): Promise<boolean> {
    try {
      await this.vercel.projects.getProjectDomain({
        teamId: this.teamId,
        idOrName: projectId,
        domain,
      });
      return true;
    } catch (error) {
      if (statusOf(error) === 404) return false;
      throw error;
    }
  }
}

function statusOf(error: unknown): number | undefined {
  const candidate = error as { statusCode?: unknown; status?: unknown } | null;
  const status = candidate?.statusCode ?? candidate?.status;
  return typeof status === "number" ? status : undefined;
}
