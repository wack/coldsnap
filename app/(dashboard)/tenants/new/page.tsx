import type { Metadata } from "next";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { CreateTenantForm } from "@/components/coldsnap/create-tenant-form";
import { getAppConfig } from "@/lib/config";
import { fetchBuildModels } from "@/lib/models/gateway";

export const metadata: Metadata = { title: "New site" };

export default async function NewTenantPage() {
  const config = getAppConfig();
  const { models, fromCatalog } = await fetchBuildModels();
  const defaultModel = models.some((model) => model.id === config.defaultModel)
    ? config.defaultModel
    : models[0]!.id;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/" className="mb-6 inline-flex items-center gap-2 text-muted-foreground hover:text-accent">
        <ArrowLeftIcon className="size-4" /> All sites
      </Link>
      <section className="border-2 bg-card p-6 shadow-pixel sm:p-8">
        <h1 className="font-pixel text-sm leading-7 sm:text-base">New lead site</h1>
        <p className="mt-2 mb-8 text-muted-foreground">
          eve plans the design with the frontend-design skill, Codex builds it in a Vercel Sandbox,
          and Coldsnap ships it to a new Vercel project behind a private login.
        </p>
        {!fromCatalog ? (
          <p className="mb-6 border-2 border-warning p-3 text-sm text-warning">
            The AI Gateway model catalog could not be reached, so a short built-in list is shown.
          </p>
        ) : null}
        <CreateTenantForm
          models={models}
          defaultModel={defaultModel}
          rootDomain={config.rootDomain}
          projectPrefix={config.projectPrefix}
        />
      </section>
    </div>
  );
}
