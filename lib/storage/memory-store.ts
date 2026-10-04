import type { ObjectStore, StoredObject } from "./object-store";

/**
 * In-memory object store for tests and `COLDSNAP_DRIVERS=memory`.
 *
 * URLs point at `/api/dev/objects/<pathname>`, a route that serves this store
 * only in memory mode, so preview images render in the local dashboard.
 */
export interface MemoryObject {
  readonly body: Uint8Array;
  readonly contentType: string;
}

export const MEMORY_OBJECT_URL_PREFIX = "/api/dev/objects/";

const STORE_KEY = Symbol.for("coldsnap.memory-object-store");

/** Shared across module copies (Next.js routes, Workflow step bundles). */
export function memoryObjects(): Map<string, MemoryObject> {
  const holder = globalThis as unknown as Record<symbol, Map<string, MemoryObject> | undefined>;
  holder[STORE_KEY] ??= new Map();
  return holder[STORE_KEY];
}

export class MemoryObjectStore implements ObjectStore {
  constructor(private readonly objects: Map<string, MemoryObject> = memoryObjects()) {}

  async put(
    pathname: string,
    body: string | Uint8Array,
    options: { readonly contentType: string },
  ): Promise<StoredObject> {
    const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
    this.objects.set(pathname, { body: bytes, contentType: options.contentType });
    return { url: urlFor(pathname), pathname };
  }

  async head(pathname: string): Promise<StoredObject | null> {
    return this.objects.has(pathname) ? { url: urlFor(pathname), pathname } : null;
  }

  async getText(urlOrPathname: string): Promise<string | null> {
    const pathname = urlOrPathname.startsWith(MEMORY_OBJECT_URL_PREFIX)
      ? urlOrPathname.slice(MEMORY_OBJECT_URL_PREFIX.length)
      : urlOrPathname;
    const object = this.objects.get(pathname);
    return object ? new TextDecoder().decode(object.body) : null;
  }

  async deletePrefix(prefix: string): Promise<void> {
    for (const pathname of [...this.objects.keys()]) {
      if (pathname.startsWith(prefix)) this.objects.delete(pathname);
    }
  }
}

function urlFor(pathname: string): string {
  return `${MEMORY_OBJECT_URL_PREFIX}${pathname}`;
}
