import { parseBundle, replaceFile, serializeBundle, type SourceBundle } from "../source/bundle";
import type { ObjectStore } from "../storage/object-store";
import { enforceProtectedFiles, templateBundle } from "../tenant-template";
import type { SiteBuildJob } from "./job";
import type { SiteBuilder, SiteBuildStatus } from "./site-builder";

/**
 * Stand-in for the eve agent in tests and `COLDSNAP_DRIVERS=memory`.
 *
 * It reports a few rounds of activity, then writes a real source bundle (the
 * template plus a generated home page) to the job's output pathname, exactly
 * where the eve agent would. A site whose name contains "fail-agent" fails,
 * so tests can drive the agent failure path.
 */
interface FakeBuild {
  readonly job: SiteBuildJob;
  checks: number;
}

const ACTIVITY = [
  "Reading the frontend-design skill",
  "Planning palette, type, and layout",
  "Codex is writing app/page.tsx",
  "Running next build",
];

const STATE_KEY = Symbol.for("coldsnap.fake-site-builder");

function builds(): Map<string, FakeBuild> {
  const holder = globalThis as unknown as Record<symbol, Map<string, FakeBuild> | undefined>;
  holder[STATE_KEY] ??= new Map();
  return holder[STATE_KEY];
}

export class FakeSiteBuilder implements SiteBuilder {
  constructor(
    private readonly objects: ObjectStore,
    private readonly checksBeforeDone: number = ACTIVITY.length,
  ) {}

  async start(job: SiteBuildJob): Promise<{ sessionId: string }> {
    const sessionId = `fake_${job.buildId}`;
    if (!builds().has(sessionId)) builds().set(sessionId, { job, checks: 0 });
    return { sessionId };
  }

  async check(sessionId: string): Promise<SiteBuildStatus> {
    const build = builds().get(sessionId);
    if (!build) return { state: "failed", error: `Unknown build session ${sessionId}.` };
    build.checks += 1;
    if (build.checks <= this.checksBeforeDone) {
      return { state: "running", detail: ACTIVITY[(build.checks - 1) % ACTIVITY.length] };
    }
    if (build.job.site.name.includes("fail-agent")) {
      return { state: "failed", error: "Codex could not make next build pass (simulated)." };
    }
    const base = build.job.sourceUrl
      ? parseBundle((await this.objects.getText(build.job.sourceUrl)) ?? "")
      : templateBundle();
    const bundle = enforceProtectedFiles(withGeneratedPage(base, build.job));
    await this.objects.put(build.job.outputPathname, serializeBundle(bundle), {
      contentType: "application/json",
    });
    return {
      state: "succeeded",
      summary:
        build.job.kind === "create"
          ? `Built a one-page site for ${build.job.site.name}.`
          : `Applied the requested change to ${build.job.site.name}.`,
    };
  }
}

function withGeneratedPage(bundle: SourceBundle, job: SiteBuildJob): SourceBundle {
  const changes = job.kind === "modify" && job.instructions ? job.instructions : null;
  const page = `export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-6 py-24">
      <h1 className="text-5xl font-semibold tracking-tight">{${JSON.stringify(job.site.name)}}</h1>
      <p className="text-lg text-muted-foreground">{${JSON.stringify(job.site.description)}}</p>
      ${changes ? `<p className="text-sm">{${JSON.stringify(`Latest change: ${changes}`)}}</p>` : ""}
    </main>
  );
}
`;
  return replaceFile(bundle, { path: "app/page.tsx", content: page, encoding: "utf-8" });
}
