"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteTenantAction } from "@/app/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { CopyButton } from "./copy-button";

/**
 * Deleting takes down a lead's live site, so Frank confirms by typing the
 * tenant's exact name. The name sits in a box with a copy button so he can
 * paste it; Delete stays disabled until the text matches.
 */
export function DeleteTenantDialog({
  tenant,
  open,
  onOpenChange,
}: {
  tenant: { id: string; name: string; host: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matches = confirmation === tenant.name;

  function change(next: boolean) {
    if (pending) return;
    if (!next) {
      setConfirmation("");
      setError(null);
    }
    onOpenChange(next);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!matches) return;
    startTransition(async () => {
      const result = await deleteTenantAction(tenant.id, confirmation);
      if (result.ok) {
        toast.success(`Deleted ${tenant.name}`);
        change(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogContent className="border-destructive">
        <form onSubmit={submit} className="grid gap-5">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-pixel text-sm leading-6 text-destructive">
              Delete this site?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              This deletes the Vercel project behind <span className="font-mono text-lg text-foreground">{tenant.host}</span>,
              its deployments, and its saved source. The lead loses access immediately. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-2">
            <span className="text-sm text-muted-foreground">Site name</span>
            <div className="flex items-center gap-2 border-2 border-border bg-background px-3 py-1">
              <code className="min-w-0 flex-1 truncate font-mono text-lg text-foreground">{tenant.name}</code>
              <CopyButton value={tenant.name} label="Site name" />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`confirm-${tenant.id}`}>Type the site name to confirm</Label>
            <Input
              id={`confirm-${tenant.id}`}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={confirmation.length > 0 && !matches ? true : undefined}
              aria-describedby={error ? `delete-error-${tenant.id}` : undefined}
            />
            {error ? (
              <p id={`delete-error-${tenant.id}`} role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={pending}>
              Keep site
            </AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={!matches || pending}>
              {pending ? "Deleting…" : "Delete site"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
