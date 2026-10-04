import type {
  DeploymentFile,
  DeploymentState,
  DeploymentStatus,
  VercelPlatform,
} from "./platform";

/**
 * In-memory Vercel for tests and `COLDSNAP_DRIVERS=memory`.
 *
 * Deployments advance one state per `getDeployment` call (QUEUED → BUILDING →
 * READY) so polling loops exercise their waiting path. A project whose name
 * contains `fail-build` produces deployments that end in ERROR, which lets a
 * test drive the failure path without a special API.
 */
export interface MemoryProject {
  id: string;
  name: string;
  env: Record<string, string>;
  domains: string[];
  ssoProtection: null;
}

export interface MemoryDeployment {
  id: string;
  projectId: string;
  url: string;
  files: DeploymentFile[];
  polls: number;
  failing: boolean;
}

export interface MemoryVercelState {
  projects: Map<string, MemoryProject>;
  deployments: Map<string, MemoryDeployment>;
  sequence: number;
}

const STATE_KEY = Symbol.for("coldsnap.memory-vercel");

export function memoryVercelState(): MemoryVercelState {
  const holder = globalThis as unknown as Record<symbol, MemoryVercelState | undefined>;
  holder[STATE_KEY] ??= { projects: new Map(), deployments: new Map(), sequence: 0 };
  return holder[STATE_KEY];
}

const PROGRESSION: readonly DeploymentState[] = ["QUEUED", "BUILDING", "READY"];

export class MemoryVercelPlatform implements VercelPlatform {
  constructor(private readonly state: MemoryVercelState = memoryVercelState()) {}

  async ensureProject(name: string): Promise<{ id: string; name: string }> {
    for (const project of this.state.projects.values()) {
      if (project.name === name) return { id: project.id, name: project.name };
    }
    const id = `prj_${this.next()}`;
    this.state.projects.set(id, { id, name, env: {}, domains: [], ssoProtection: null });
    return { id, name };
  }

  async upsertEnv(projectId: string, variables: Readonly<Record<string, string>>): Promise<void> {
    Object.assign(this.project(projectId).env, variables);
  }

  async addDomain(projectId: string, domain: string): Promise<void> {
    const project = this.project(projectId);
    if (!project.domains.includes(domain)) project.domains.push(domain);
  }

  async createDeployment(input: {
    projectId: string;
    projectName: string;
    files: readonly DeploymentFile[];
  }): Promise<{ id: string; url: string }> {
    const project = this.project(input.projectId);
    const id = `dpl_${this.next()}`;
    const url = `${project.name}-${id.slice(4)}.vercel.app`;
    this.state.deployments.set(id, {
      id,
      projectId: project.id,
      url,
      files: [...input.files],
      polls: 0,
      failing: project.name.includes("fail-build"),
    });
    return { id, url };
  }

  async getDeployment(id: string): Promise<DeploymentStatus> {
    const deployment = this.state.deployments.get(id);
    if (!deployment) throw new Error(`Deployment ${id} does not exist.`);
    deployment.polls += 1;
    const step = Math.min(deployment.polls - 1, PROGRESSION.length - 1);
    const state: DeploymentState =
      deployment.failing && step === PROGRESSION.length - 1 ? "ERROR" : PROGRESSION[step]!;
    const project = this.project(deployment.projectId);
    return {
      id,
      url: deployment.url,
      state,
      aliases: state === "READY" ? [`${project.name}.vercel.app`, ...project.domains] : [],
      errorMessage: state === "ERROR" ? "Build failed: simulated failure." : undefined,
    };
  }

  async deleteProject(projectIdOrName: string): Promise<void> {
    for (const project of this.state.projects.values()) {
      if (project.id === projectIdOrName || project.name === projectIdOrName) {
        this.state.projects.delete(project.id);
        for (const [id, deployment] of this.state.deployments) {
          if (deployment.projectId === project.id) this.state.deployments.delete(id);
        }
      }
    }
  }

  private project(projectId: string): MemoryProject {
    const project = this.state.projects.get(projectId);
    if (!project) throw new Error(`Project ${projectId} does not exist.`);
    return project;
  }

  private next(): string {
    this.state.sequence += 1;
    return this.state.sequence.toString(36).padStart(6, "0");
  }
}
