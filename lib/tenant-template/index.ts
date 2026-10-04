import type { SourceBundle, SourceFile } from "../source/bundle";
import { TEMPLATE_FILES } from "./files.generated";

export { TEMPLATE_FILES };

/**
 * Files Coldsnap owns inside every tenant site. They implement the login gate,
 * so after the agent finishes they are restored verbatim from the template:
 * whatever the model did to them, the deployed site keeps working auth.
 */
export const PROTECTED_PATHS: readonly string[] = [
  "proxy.ts",
  "lib/coldsnap-auth.ts",
  "app/login/page.tsx",
  "app/api/coldsnap/login/route.ts",
  "app/api/coldsnap/logout/route.ts",
  "app/robots.ts",
];

/** Files that would bypass or shadow the protected proxy if present. */
export const FORBIDDEN_PATHS: readonly string[] = [
  "middleware.ts",
  "middleware.js",
  "src/middleware.ts",
  "src/middleware.js",
  "src/proxy.ts",
  "src/proxy.js",
];

export function templateBundle(): SourceBundle {
  return {
    version: 1,
    files: TEMPLATE_FILES.map((file) => ({
      path: file.path,
      content: file.content,
      encoding: "utf-8" as const,
    })),
  };
}

/**
 * Restores the protected files and drops forbidden ones. Applied by the agent
 * after Codex finishes and again by the deploy step, so a bundle from any
 * source is safe to ship.
 */
export function enforceProtectedFiles(bundle: SourceBundle): SourceBundle {
  const protectedFiles = new Map<string, SourceFile>();
  for (const path of PROTECTED_PATHS) {
    const file = TEMPLATE_FILES.find((candidate) => candidate.path === path);
    if (!file) throw new Error(`Template is missing protected file ${path}.`);
    protectedFiles.set(path, { path, content: file.content, encoding: "utf-8" });
  }
  const forbidden = new Set(FORBIDDEN_PATHS);
  const kept = bundle.files.filter(
    (file) => !protectedFiles.has(file.path) && !forbidden.has(file.path),
  );
  return { ...bundle, files: [...kept, ...protectedFiles.values()] };
}
