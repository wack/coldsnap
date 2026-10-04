"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRun, start } from "workflow/api";

import { requireAdmin } from "@/lib/auth/current-admin";
import { getServices } from "@/lib/services";
import { isBusy, planProgress } from "@/lib/tenants/model";
import {
  FieldError,
  createTenantSchema,
  modifyTenantSchema,
  registerTenant,
  teardownTenant,
} from "@/lib/tenants/manage";
import { createTenantWorkflow, modifyTenantWorkflow } from "@/workflows/tenant-workflows";

export type FormState = {
  readonly error?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  readonly values?: Readonly<Record<string, string>>;
};

function formValues(formData: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, String(formData.get(key) ?? "")]));
}

function zodFieldErrors(issues: readonly { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= issue.message;
  }
  return errors;
}

/** Creates the tenant record and starts the durable create workflow. */
export async function createTenantAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const values = formValues(formData, ["name", "description", "email", "model"]);
  const parsed = createTenantSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error.issues), values };

  const services = getServices();
  let tenantId: string;
  try {
    const tenant = await registerTenant(services, parsed.data);
    tenantId = tenant.id;
    const run = await start(createTenantWorkflow, [tenant.id, tenant.model]);
    await services.tenants.update(tenant.id, { workflowRunId: run.runId });
  } catch (error) {
    if (error instanceof FieldError) return { fieldErrors: { [error.field]: error.message }, values };
    console.error("Creating a tenant failed", error);
    return { error: "Coldsnap could not start the build. Try again in a moment.", values };
  }
  revalidatePath("/");
  redirect(`/tenants/${tenantId}`);
}

/** Starts the modify workflow for a live site. */
export async function modifyTenantAction(
  tenantId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const values = formValues(formData, ["instructions", "model"]);
  const parsed = modifyTenantSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error.issues), values };

  const services = getServices();
  const tenant = await services.tenants.get(tenantId);
  if (!tenant) return { error: "That site no longer exists." };
  if (isBusy(tenant.status)) return { error: "Wait for the current build to finish first.", values };
  if (!tenant.sourceUrl) return { error: "This site has no saved source to modify yet.", values };

  // Mark it updating right away so the dashboard reflects the click; the
  // workflow's first step re-plans the same progress.
  await services.tenants.update(tenantId, {
    status: "updating",
    progress: planProgress("modify", services.now()),
    lastError: null,
  });
  try {
    const run = await start(modifyTenantWorkflow, [tenantId, parsed.data.instructions, parsed.data.model]);
    await services.tenants.update(tenantId, { workflowRunId: run.runId });
  } catch (error) {
    console.error("Starting a modify failed", error);
    await services.tenants.update(tenantId, { status: "live", lastError: "The update could not start." });
    return { error: "Coldsnap could not start the update. Try again in a moment.", values };
  }
  revalidatePath("/");
  redirect(`/tenants/${tenantId}`);
}

/** Re-runs creation for a tenant whose first build failed. */
export async function retryTenantAction(tenantId: string): Promise<void> {
  await requireAdmin();
  const services = getServices();
  const tenant = await services.tenants.require(tenantId);
  if (tenant.status !== "failed") return;
  await services.tenants.update(tenantId, {
    status: "creating",
    progress: planProgress("create", services.now()),
    lastError: null,
  });
  const run = await start(createTenantWorkflow, [tenantId, tenant.model]);
  await services.tenants.update(tenantId, { workflowRunId: run.runId });
  revalidatePath("/");
  redirect(`/tenants/${tenantId}`);
}

export type DeleteResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

/** Deletes a tenant after Frank typed its exact name. */
export async function deleteTenantAction(tenantId: string, confirmation: string): Promise<DeleteResult> {
  await requireAdmin();
  const services = getServices();
  const tenant = await services.tenants.get(tenantId);
  if (!tenant) return { ok: true };
  if (confirmation !== tenant.name) {
    return { ok: false, error: "The name you typed does not match." };
  }
  try {
    await teardownTenant(services, tenantId, async (runId) => {
      await getRun(runId).cancel();
    });
  } catch (error) {
    console.error("Deleting a tenant failed", error);
    revalidatePath("/");
    return { ok: false, error: "Delete did not finish. Retry it from the card's menu." };
  }
  revalidatePath("/");
  return { ok: true };
}
