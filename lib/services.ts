import { EveSiteBuilder } from "./agent/eve-site-builder";
import { FakeSiteBuilder } from "./agent/fake-site-builder";
import type { SiteBuilder } from "./agent/site-builder";
import { getAppConfig, type AppConfig } from "./config";
import {
  ChromiumScreenshotter,
  PlaceholderScreenshotter,
  type Screenshotter,
} from "./preview/screenshotter";
import { BlobObjectStore } from "./storage/blob-store";
import { MemoryObjectStore } from "./storage/memory-store";
import type { ObjectStore } from "./storage/object-store";
import { SqlTenantRepository, type TenantRepository } from "./tenants/repository";
import { MemoryVercelPlatform } from "./vercel/memory-platform";
import type { VercelPlatform } from "./vercel/platform";
import { SdkVercelPlatform } from "./vercel/sdk-platform";

/**
 * Every external dependency Coldsnap talks to, behind an interface.
 *
 * `COLDSNAP_DRIVERS=memory` swaps Vercel, Blob, the eve agent, and Chromium
 * for in-memory doubles, so the full create, modify, and delete flows run
 * locally and in tests without credentials. The database is chosen
 * separately (Neon when `DATABASE_URL` is set, PGlite otherwise).
 */
export interface Services {
  readonly config: AppConfig;
  readonly tenants: TenantRepository;
  readonly objects: ObjectStore;
  readonly platform: VercelPlatform;
  readonly siteBuilder: SiteBuilder;
  readonly screenshots: Screenshotter;
  readonly now: () => Date;
}

export function getServices(env: NodeJS.ProcessEnv = process.env): Services {
  const config = getAppConfig(env);
  const tenants = new SqlTenantRepository();
  const now = () => new Date();

  if (config.drivers === "memory") {
    const objects = new MemoryObjectStore();
    return {
      config,
      tenants,
      objects,
      platform: new MemoryVercelPlatform(),
      siteBuilder: new FakeSiteBuilder(objects),
      screenshots: new PlaceholderScreenshotter(),
      now,
    };
  }

  // Constructed lazily so a page that only lists tenants does not require
  // VERCEL_TOKEN to be present.
  let platform: VercelPlatform | undefined;
  return {
    config,
    tenants,
    objects: new BlobObjectStore(),
    get platform() {
      platform ??= new SdkVercelPlatform(env);
      return platform;
    },
    siteBuilder: new EveSiteBuilder(env),
    screenshots: new ChromiumScreenshotter(),
    now,
  };
}
