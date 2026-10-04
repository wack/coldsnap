import type { DeploymentFile } from "../vercel/platform";

/**
 * A tenant site's complete source, stored as one JSON object per build.
 *
 * A bundle is the source of truth for a site: the deploy step uploads it to
 * Vercel and the next modify run starts from it. Binary files (images the
 * agent adds to `public/`) are base64-encoded.
 */
export interface SourceFile {
  readonly path: string;
  readonly content: string;
  readonly encoding: "utf-8" | "base64";
}

export interface SourceBundle {
  readonly version: 1;
  readonly files: readonly SourceFile[];
}

/** Hard ceiling so a runaway build cannot push an enormous deployment. */
export const MAX_BUNDLE_BYTES = 20 * 1024 * 1024;

const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@()[\]+\- /]+$/;

export function parseBundle(json: string): SourceBundle {
  const value = JSON.parse(json) as Partial<SourceBundle>;
  if (value.version !== 1 || !Array.isArray(value.files)) {
    throw new Error("Not a Coldsnap source bundle.");
  }
  const seen = new Set<string>();
  for (const file of value.files) {
    if (
      typeof file?.path !== "string" ||
      typeof file.content !== "string" ||
      (file.encoding !== "utf-8" && file.encoding !== "base64")
    ) {
      throw new Error("Source bundle contains a malformed file entry.");
    }
    if (!SAFE_PATH.test(file.path)) {
      throw new Error(`Source bundle contains an unsafe path: ${file.path}`);
    }
    if (seen.has(file.path)) throw new Error(`Source bundle repeats ${file.path}.`);
    seen.add(file.path);
  }
  return value as SourceBundle;
}

export function serializeBundle(bundle: SourceBundle): string {
  const json = JSON.stringify(bundle);
  if (json.length > MAX_BUNDLE_BYTES) {
    throw new Error(`Source bundle is ${json.length} bytes; the limit is ${MAX_BUNDLE_BYTES}.`);
  }
  return json;
}

export function toDeploymentFiles(bundle: SourceBundle): DeploymentFile[] {
  return bundle.files.map((file) => ({
    file: file.path,
    data: file.content,
    encoding: file.encoding,
  }));
}

export function replaceFile(bundle: SourceBundle, file: SourceFile): SourceBundle {
  return {
    ...bundle,
    files: [...bundle.files.filter((existing) => existing.path !== file.path), file],
  };
}
