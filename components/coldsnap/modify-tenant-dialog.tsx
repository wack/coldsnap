"use client";

import { useActionState } from "react";

import { modifyTenantAction, type FormState } from "@/app/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { GatewayModel } from "@/lib/models/gateway";
import { MAX_INSTRUCTIONS_LENGTH } from "@/lib/tenants/limits";

import { ModelPicker } from "./model-picker";

/** Frank describes a change; eve and Codex apply it to the site's source. */
export function ModifyTenantDialog({
  tenant,
  models,
  open,
  onOpenChange,
}: {
  tenant: { id: string; name: string; model: string };
  models: readonly GatewayModel[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    modifyTenantAction.bind(null, tenant.id),
    {},
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <form action={action} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-pixel text-sm leading-6">Modify {tenant.name}</DialogTitle>
            <DialogDescription className="text-base">
              Describe what should change. The site keeps serving its current version until the
              new one is live.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={`instructions-${tenant.id}`}>Change request</Label>
            <Textarea
              id={`instructions-${tenant.id}`}
              name="instructions"
              rows={6}
              maxLength={MAX_INSTRUCTIONS_LENGTH}
              defaultValue={state.values?.instructions}
              placeholder="Add a section with three wedding-film packages and pricing. Make the hero headline mention their anniversary."
              aria-invalid={state.fieldErrors?.instructions ? true : undefined}
              required
            />
            {state.fieldErrors?.instructions ? (
              <p className="text-sm text-destructive">{state.fieldErrors.instructions}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`model-${tenant.id}`}>Model</Label>
            <ModelPicker
              id={`model-${tenant.id}`}
              name="model"
              models={models}
              defaultValue={state.values?.model || tenant.model}
              invalid={Boolean(state.fieldErrors?.model)}
            />
            {state.fieldErrors?.model ? (
              <p className="text-sm text-destructive">{state.fieldErrors.model}</p>
            ) : null}
          </div>

          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Starting…" : "Apply change"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
