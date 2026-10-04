import { PlusIcon } from "lucide-react";
import Link from "next/link";

import { AutoRefresh } from "@/components/coldsnap/auto-refresh";
import { SnowflakeMark } from "@/components/coldsnap/logo";
import { TenantCard } from "@/components/coldsnap/tenant-card";
import { Button } from "@/components/ui/button";
import { fetchBuildModels } from "@/lib/models/gateway";
import { getServices } from "@/lib/services";
import { isBusy } from "@/lib/tenants/model";
import { previewHostFor } from "@/lib/tenants/naming";
import { toTenantView } from "@/lib/tenants/view";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const services = getServices();
  const [tenants, { models }] = await Promise.all([services.tenants.list(), fetchBuildModels()]);
  const views = tenants.map((tenant) =>
    toTenantView(tenant, previewHostFor(tenant.subdomain, services.config)),
  );
  const live = views.filter((tenant) => tenant.status === "live").length;

  return (
    <>
      <AutoRefresh active={views.some((tenant) => isBusy(tenant.status))} />
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-pixel text-base leading-8 sm:text-lg">Lead sites</h1>
          <p className="text-muted-foreground">
            {views.length === 0
              ? "Nothing built yet."
              : `${views.length} ${views.length === 1 ? "site" : "sites"}, ${live} live. Click a card to open the site.`}
          </p>
        </div>
      </div>

      {views.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
          {views.map((tenant) => (
            <li key={tenant.id}>
              <TenantCard tenant={tenant} models={models} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function EmptyState() {
  return (
    <section className="mx-auto flex max-w-lg flex-col items-center gap-6 border-2 border-dashed border-border px-6 py-16 text-center">
      <SnowflakeMark className="size-16" />
      <div className="grid gap-2">
        <h2 className="font-pixel text-xs leading-6">No lead sites yet</h2>
        <p className="text-muted-foreground">
          Describe a lead and what you want to pitch them. eve designs the site, Codex builds it,
          and it goes live on its own Vercel project with a private login.
        </p>
      </div>
      <Button asChild size="lg">
        <Link href="/tenants/new">
          <PlusIcon /> Build the first site
        </Link>
      </Button>
    </section>
  );
}
