/**
 * Durable file storage for source bundles, build jobs, and preview images.
 *
 * Every key Coldsnap writes is unique (it embeds a tenant or build id), so
 * nothing is ever overwritten and CDN caching of Blob URLs is never stale.
 */
export interface StoredObject {
  readonly url: string;
  readonly pathname: string;
}

export interface ObjectStore {
  put(
    pathname: string,
    body: string | Uint8Array,
    options: { readonly contentType: string },
  ): Promise<StoredObject>;
  /** Resolves a pathname to its public URL, or `null` when nothing is stored there. */
  head(pathname: string): Promise<StoredObject | null>;
  /** Reads a stored text object by URL or pathname. `null` when missing. */
  getText(urlOrPathname: string): Promise<string | null>;
  /** Removes every object whose pathname starts with `prefix`. */
  deletePrefix(prefix: string): Promise<void>;
}

/** Key layout. Kept in one place so teardown can find everything a tenant owns. */
export const objectKeys = {
  tenantPrefixes(tenantId: string): string[] {
    return [`sources/${tenantId}/`, `jobs/${tenantId}/`, `previews/${tenantId}/`];
  },
  source(tenantId: string, buildId: string): string {
    return `sources/${tenantId}/${buildId}.json`;
  },
  job(tenantId: string, buildId: string): string {
    return `jobs/${tenantId}/${buildId}.json`;
  },
  preview(tenantId: string, buildId: string, extension: string): string {
    return `previews/${tenantId}/${buildId}.${extension}`;
  },
};
