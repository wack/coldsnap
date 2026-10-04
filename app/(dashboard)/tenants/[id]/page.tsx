import type { Metadata } from "next";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/coldsnap/auto-refresh";
import { CopyButton } from "@/components/coldsnap/copy-button";
import { PasswordField } from "@/components/coldsnap/password-field";
import { ProgressMeter, ProgressSteps } from "@/components/coldsnap/progress-steps";
import { StatusBadge } from "@/components/coldsnap/status-badge";
import { Button } from "@/components/ui/button";
import { getServices } from "@/lib/services";
import { isBusy } from "@/lib/tenants/model";
import { previewHostFor } from "@/lib/tenants/naming";
import { toTenantView } from "@/lib/tenants/view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const tenant = await getServices().tenants.get((await params).id);
  return { title: tenant?.name ?? "Site" };
}

/** Live build progress for one site, then its address and credentials. */
export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const services = getServices();
  const tenant = await services.tenants.get((await params).id);
  if (!tenant) notFound();
  const view = toTenantView(tenant, previewHostFor(tenant.subdomain, services.config));
  const busy = isBusy(view.status);
  const operation = view.progress?.operation === "modify" ? "Update" : "Build";

  return (
    <div className="mx-auto grid max-w-3xl gap-8">
      <AutoRefresh active={busy} />
      <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-accent">
        <ArrowLeftIcon className="size-4" /> All sites
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-pixel text-base leading-8 break-words sm:text-lg">{view.name}</h1>
          <p className="font-mono text-xl text-accent">{view.host}</p>
        </div>
        <StatusBadge status={view.status} className="text-xs" />
      </header>

      {view.progress ? (
        <section className="grid gap-5 border-2 bg-card p-6 shadow-pixel" aria-live="polite">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-pixel text-xs leading-6">
              {operation} {busy ? "in progress" : view.progress.error ? "failed" : "complete"}
            </h2>
            <span className="font-mono text-base text-muted-foreground">model {view.model}</span>
          </div>
          <ProgressMeter progress={view.progress} />
          <ProgressSteps progress={view.progress} />
          {busy ? (
            <p className="text-sm text-muted-foreground">
              You can leave this page. The build runs as a durable Vercel Workflow and keeps going.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-4 border-2 bg-card p-6 shadow-pixel">
        <h2 className="font-pixel text-xs leading-6">Access for the lead</h2>
        <dl className="grid gap-3 sm:grid-cols-[8rem_1fr] sm:items-center">
          <dt className="text-muted-foreground">Address</dt>
          <dd className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 flex-1 truncate font-mono text-lg">{view.url ?? `https://${view.host}`}</span>
            <CopyButton value={view.url ?? `https://${view.host}`} label="Address" />
          </dd>
          <dt className="text-muted-foreground">Username</dt>
          <dd className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 flex-1 truncate">{view.email}</span>
            <CopyButton value={view.email} label="Username" />
          </dd>
          <dt className="text-muted-foreground">Password</dt>
          <dd>
            <PasswordField password={view.password} />
          </dd>
        </dl>
        {view.url && view.status !== "creating" ? (
          <Button asChild className="w-fit">
            <a href={view.url} target="_blank" rel="noreferrer">
              <ExternalLinkIcon /> Open site
            </a>
          </Button>
        ) : null}
      </section>

      {view.previewImageUrl ? (
        <figure className="grid gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={view.previewImageUrl}
            alt={`Home page of ${view.name}`}
            className="w-full border-2 shadow-pixel"
          />
          <figcaption className="text-sm text-muted-foreground">Home page, captured when it went live.</figcaption>
        </figure>
      ) : null}
    </div>
  );
}
