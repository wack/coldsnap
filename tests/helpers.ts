import { resetDatabaseForTests } from "@/lib/db/client";
import { memoryObjects } from "@/lib/storage/memory-store";
import { memoryVercelState } from "@/lib/vercel/memory-platform";
import { getServices, type Services } from "@/lib/services";
import { registerTenant, type CreateTenantInput } from "@/lib/tenants/manage";

/** Empties the shared in-memory database, object store, and fake Vercel. */
export async function resetMemoryState(): Promise<void> {
  await resetDatabaseForTests();
  memoryObjects().clear();
  const vercel = memoryVercelState();
  vercel.projects.clear();
  vercel.deployments.clear();
  vercel.sequence = 0;
  const fakeBuilds = (globalThis as Record<symbol, Map<string, unknown> | undefined>)[
    Symbol.for("coldsnap.fake-site-builder")
  ];
  fakeBuilds?.clear();
}

export const SAMPLE_INPUT: CreateTenantInput = {
  name: "Mark's Bakery",
  description:
    "A neighborhood sourdough bakery in Portland that wants a brand film and short social cuts for its tenth anniversary.",
  email: "mark@marksbakery.com",
  model: "openai/gpt-5.5",
};

export async function createSampleTenant(
  overrides: Partial<CreateTenantInput> = {},
  services: Services = getServices(),
) {
  return registerTenant(services, { ...SAMPLE_INPUT, ...overrides });
}
