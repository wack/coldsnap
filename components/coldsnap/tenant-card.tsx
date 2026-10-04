"use client";

import {
  ActivityIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  MailIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { retryTenantAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { GatewayModel } from "@/lib/models/gateway";
import type { TenantView } from "@/lib/tenants/view";
import { cn } from "@/lib/utils";

import { CopyButton } from "./copy-button";
import { DeleteTenantDialog } from "./delete-tenant-dialog";
import { ModifyTenantDialog } from "./modify-tenant-dialog";
import { PasswordField } from "./password-field";
import { ProgressMeter } from "./progress-steps";
import { StatusBadge } from "./status-badge";

export function TenantCard({ tenant, models }: { tenant: TenantView; models: readonly GatewayModel[] }) {
  const [dialog, setDialog] = useState<"modify" | "delete" | null>(null);
  const [retrying, startRetry] = useTransition();

  // A live site opens in a new tab; anything still building opens its progress.
  const opensSite = tenant.url !== null && tenant.status !== "creating" && tenant.status !== "deleting";
  const progressHref = `/tenants/${tenant.id}`;
  const busy = tenant.status === "creating" || tenant.status === "updating" || tenant.status === "deleting";
  const runningStep = tenant.progress?.steps.find((step) => step.state === "running");

  return (
    <article
      className={cn(
        "group relative flex flex-col border-2 bg-card shadow-pixel transition-[transform,border-color,box-shadow] duration-100",
        "hover:-translate-y-0.5 hover:border-primary hover:shadow-neon focus-within:border-primary",
        tenant.status === "failed" && "border-destructive/70",
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden border-b-2 bg-background">
        {tenant.previewImageUrl ? (
          // Preview images live in Blob (or the dev store); a plain img keeps
          // them free of image-optimization config.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenant.previewImageUrl}
            alt={`Home page of ${tenant.name}`}
            className={cn("size-full object-cover object-top", busy && "opacity-40")}
            loading="lazy"
          />
        ) : (
          <NoSignal />
        )}
        <StatusBadge status={tenant.status} className="absolute top-3 left-3" />
        {busy && tenant.progress ? (
          <div className="absolute inset-x-3 bottom-3 grid gap-2 border-2 border-border bg-popover/95 p-3">
            <ProgressMeter progress={tenant.progress} />
            <p className="truncate text-sm">
              {runningStep ? runningStep.label : tenant.status === "deleting" ? "Deleting" : "Starting"}
              {runningStep?.detail ? (
                <span className="ml-2 font-mono text-base text-muted-foreground">{runningStep.detail}</span>
              ) : null}
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 p-4">
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 flex-1 font-pixel text-xs leading-5 break-words">
            {opensSite ? (
              <a
                href={tenant.url!}
                target="_blank"
                rel="noreferrer"
                className="outline-none after:absolute after:inset-0 after:content-['']"
              >
                {tenant.name}
              </a>
            ) : (
              <Link href={progressHref} className="outline-none after:absolute after:inset-0 after:content-['']">
                {tenant.name}
              </Link>
            )}
          </h2>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="relative z-10 -mt-1 -mr-1"
                aria-label={`Actions for ${tenant.name}`}
              >
                <EllipsisVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="truncate font-mono text-base">{tenant.host}</DropdownMenuLabel>
              {tenant.url ? (
                <DropdownMenuItem asChild>
                  <a href={tenant.url} target="_blank" rel="noreferrer">
                    <ExternalLinkIcon /> Open site
                  </a>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <Link href={progressHref}>
                  <ActivityIcon /> Build details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!tenant.canModify} onSelect={() => setDialog("modify")}>
                <PencilIcon /> Modify site…
              </DropdownMenuItem>
              {tenant.status === "failed" ? (
                <DropdownMenuItem
                  disabled={retrying}
                  onSelect={() => startRetry(() => retryTenantAction(tenant.id))}
                >
                  <RotateCcwIcon /> Retry build
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
                <Trash2Icon /> {tenant.status === "deleting" ? "Retry delete…" : "Delete site…"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="-mt-1 truncate font-mono text-lg leading-5 text-muted-foreground">{tenant.host}</p>

        <dl className="grid gap-1.5 text-sm">
          <div className="relative z-10 flex items-center gap-2">
            <dt>
              <MailIcon className="size-4 text-muted-foreground" aria-hidden />
              <span className="sr-only">Email</span>
            </dt>
            <dd className="min-w-0 flex-1 truncate">{tenant.email}</dd>
            <CopyButton value={tenant.email} label="Email" />
          </div>
          <div className="relative z-10 flex items-center gap-2">
            <dt>
              <KeyRoundIcon className="size-4 text-muted-foreground" aria-hidden />
              <span className="sr-only">Password</span>
            </dt>
            <dd className="min-w-0 flex-1">
              <PasswordField password={tenant.password} />
            </dd>
          </div>
        </dl>

        {tenant.lastError ? (
          <p className="border-l-4 border-destructive pl-2 text-sm text-destructive">{tenant.lastError}</p>
        ) : null}
      </div>

      {tenant.canModify ? (
        <ModifyTenantDialog
          tenant={tenant}
          models={models}
          open={dialog === "modify"}
          onOpenChange={(open) => setDialog(open ? "modify" : null)}
        />
      ) : null}
      <DeleteTenantDialog
        tenant={tenant}
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
      />
    </article>
  );
}

/** Placeholder until a preview exists: a test card with static. */
function NoSignal() {
  const bars = ["#ece8ff", "#ffd319", "#05d9e8", "#3dff8b", "#ff2a6d", "#ff4d5e", "#3d2275"];
  return (
    <div className="flex size-full flex-col" aria-hidden>
      <div className="flex flex-[3]">
        {bars.map((color) => (
          <span key={color} className="flex-1 opacity-70" style={{ background: color }} />
        ))}
      </div>
      <div className="flex flex-1 items-center justify-center bg-background font-pixel text-[0.6rem] text-muted-foreground">
        no signal
      </div>
    </div>
  );
}
