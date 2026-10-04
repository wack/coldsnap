import { z } from "zod";

import { MODEL_ID_PATTERN } from "../agent/job";
import type { Services } from "../services";
import { objectKeys } from "../storage/object-store";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_INSTRUCTIONS_LENGTH,
  MAX_NAME_LENGTH,
  MIN_DESCRIPTION_LENGTH,
} from "./limits";
import { planProgress, type Tenant } from "./model";
import { domainFor, projectNameFor } from "./naming";
import { SubdomainTakenError } from "./repository";
import { generatePassword, generateSessionSecret } from "./secrets";
import { toSubdomain } from "./subdomain";

export const createTenantSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the site a name.")
    .max(MAX_NAME_LENGTH, `Keep the name under ${MAX_NAME_LENGTH} characters.`),
  description: z
    .string()
    .trim()
    .min(MIN_DESCRIPTION_LENGTH, "Describe the site in at least a sentence.")
    .max(MAX_DESCRIPTION_LENGTH, `Keep the description under ${MAX_DESCRIPTION_LENGTH} characters.`),
  email: z.email("Enter the lead's email address.").trim().toLowerCase().max(254),
  model: z.string().regex(MODEL_ID_PATTERN, "Pick a model from the list."),
});

export const modifyTenantSchema = z.object({
  instructions: z
    .string()
    .trim()
    .min(5, "Describe the change you want.")
    .max(MAX_INSTRUCTIONS_LENGTH, `Keep the request under ${MAX_INSTRUCTIONS_LENGTH} characters.`),
  model: z.string().regex(MODEL_ID_PATTERN, "Pick a model from the list."),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;

/** A form-level problem to show next to one field. */
export class FieldError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "FieldError";
  }
}

/**
 * Claims the subdomain, mints the site's credentials, and stores the tenant
 * in its `creating` state. The workflow takes it from there.
 */
export async function registerTenant(services: Services, input: CreateTenantInput): Promise<Tenant> {
  const subdomain = toSubdomain(input.name);
  if (!subdomain.ok) throw new FieldError("name", subdomain.error);

  try {
    return await services.tenants.insert({
      id: crypto.randomUUID(),
      name: input.name,
      subdomain: subdomain.subdomain,
      description: input.description,
      email: input.email,
      password: generatePassword(),
      sessionSecret: generateSessionSecret(),
      model: input.model,
      vercelProjectName: projectNameFor(subdomain.subdomain, services.config),
      domain: domainFor(subdomain.subdomain, services.config),
      status: "creating",
      progress: planProgress("create", services.now()),
    });
  } catch (error) {
    if (error instanceof SubdomainTakenError) {
      throw new FieldError("name", `${error.subdomain} is already taken. Pick another name.`);
    }
    throw error;
  }
}

/**
 * Removes everything a tenant owns: its workflow run, its Vercel project
 * (which takes the deployments and domain with it), its stored files, and
 * finally its row. Each step tolerates "already gone", so a failed delete can
 * simply be retried.
 */
export async function teardownTenant(
  services: Services,
  tenantId: string,
  cancelRun: (runId: string) => Promise<void>,
): Promise<void> {
  const tenant = await services.tenants.get(tenantId);
  if (!tenant) return;
  await services.tenants.update(tenantId, { status: "deleting", lastError: null });

  try {
    if (tenant.workflowRunId) {
      await cancelRun(tenant.workflowRunId).catch(() => {
        // The run may have finished already; nothing to cancel.
      });
    }
    await services.platform.deleteProject(tenant.vercelProjectId ?? tenant.vercelProjectName);
    for (const prefix of objectKeys.tenantPrefixes(tenantId)) {
      await services.objects.deletePrefix(prefix);
    }
    await services.tenants.delete(tenantId);
  } catch (error) {
    await services.tenants.update(tenantId, {
      lastError: `Delete did not finish: ${error instanceof Error ? error.message : String(error)}`,
    });
    throw error;
  }
}
