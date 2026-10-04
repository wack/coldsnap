import { BlobNotFoundError, del, head, list, put } from "@vercel/blob";

import type { ObjectStore, StoredObject } from "./object-store";

/**
 * Vercel Blob implementation. Reads `BLOB_READ_WRITE_TOKEN` from the
 * environment, which Vercel injects once a Blob store is connected to the
 * project.
 *
 * Objects are public so preview images render in the dashboard without a
 * proxy. Pathnames embed random tenant and build ids, so bundles are not
 * enumerable, and source bundles never contain credentials: the tenant's
 * password lives in its Vercel project's environment variables.
 */
export class BlobObjectStore implements ObjectStore {
  async put(
    pathname: string,
    body: string | Uint8Array,
    options: { readonly contentType: string },
  ): Promise<StoredObject> {
    const payload = typeof body === "string" ? body : Buffer.from(body);
    const result = await put(pathname, payload, {
      access: "public",
      contentType: options.contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return { url: result.url, pathname: result.pathname };
  }

  async head(pathname: string): Promise<StoredObject | null> {
    try {
      const result = await head(pathname);
      return { url: result.url, pathname: result.pathname };
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  }

  async getText(urlOrPathname: string): Promise<string | null> {
    const url = urlOrPathname.startsWith("https://")
      ? urlOrPathname
      : (await this.head(urlOrPathname))?.url;
    if (!url) return null;
    const response = await fetch(url, { cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Reading ${url} failed with HTTP ${response.status}.`);
    return response.text();
  }

  async deletePrefix(prefix: string): Promise<void> {
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor });
      if (page.blobs.length > 0) await del(page.blobs.map((blob) => blob.url));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  }
}
