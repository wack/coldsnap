import { getAppConfig } from "../config";
import { BlobObjectStore } from "./blob-store";
import { MemoryObjectStore } from "./memory-store";
import type { ObjectStore } from "./object-store";

/**
 * The object store for the current driver mode. The eve agent uses this
 * directly instead of `getServices()`, so its bundle does not pull in the
 * Vercel SDK, Chromium, or the eve client it never calls.
 */
export function getObjectStore(): ObjectStore {
  return getAppConfig().drivers === "memory" ? new MemoryObjectStore() : new BlobObjectStore();
}
