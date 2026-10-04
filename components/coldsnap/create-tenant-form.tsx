"use client";

import { useActionState, useState } from "react";

import { createTenantAction, type FormState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { GatewayModel } from "@/lib/models/gateway";
import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from "@/lib/tenants/limits";
import { previewHostFor } from "@/lib/tenants/naming";
import { toSubdomain } from "@/lib/tenants/subdomain";
import { cn } from "@/lib/utils";

import { ModelPicker } from "./model-picker";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

/**
 * The four-field tenant form. The name is converted into a subdomain as Frank
 * types (the same function the server uses), so he sees the address before
 * submitting and invalid names are caught in place.
 */
export function CreateTenantForm({
  models,
  defaultModel,
  rootDomain,
  projectPrefix,
}: {
  models: readonly GatewayModel[];
  defaultModel: string;
  rootDomain: string | null;
  projectPrefix: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createTenantAction, {});
  const [name, setName] = useState(state.values?.name ?? "");
  const [description, setDescription] = useState(state.values?.description ?? "");
  const subdomain = toSubdomain(name);
  const nameError =
    state.fieldErrors?.name ?? (name.trim().length > 0 && !subdomain.ok ? subdomain.error : undefined);

  return (
    <form action={action} className="grid gap-7">
      <div className="grid gap-2">
        <Label htmlFor="name">Site name</Label>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_NAME_LENGTH}
          placeholder="Mark's Bakery"
          autoComplete="off"
          required
          aria-invalid={nameError ? true : undefined}
          aria-describedby="name-address name-error"
        />
        <p id="name-address" className="text-sm text-muted-foreground" aria-live="polite">
          Address:{" "}
          <span className={cn("font-mono text-lg", subdomain.ok ? "text-accent" : "text-muted-foreground")}>
            {subdomain.subdomain
              ? previewHostFor(subdomain.subdomain, { rootDomain, projectPrefix })
              : "type a name to see it"}
          </span>
        </p>
        <FieldError id="name-error" message={nameError} />
      </div>

      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <Label htmlFor="description">What should the site do?</Label>
          <span className="font-mono text-base text-muted-foreground">
            {description.length}/{MAX_DESCRIPTION_LENGTH}
          </span>
        </div>
        <Textarea
          id="description"
          name="description"
          rows={8}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={MAX_DESCRIPTION_LENGTH}
          placeholder="Mark runs a sourdough bakery in Portland turning ten this spring. Show him a brand film for the anniversary, three short social cuts of the morning bake, and a behind-the-counter series. Warm, flour-dusted, early-morning light."
          required
          aria-invalid={state.fieldErrors?.description ? true : undefined}
          aria-describedby="description-hint description-error"
        />
        <p id="description-hint" className="text-sm text-muted-foreground">
          Who the lead is, what they care about, and what you want to pitch. eve turns this into the
          site&apos;s design and copy.
        </p>
        <FieldError id="description-error" message={state.fieldErrors?.description} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">Lead&apos;s email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={state.values?.email}
          placeholder="mark@marksbakery.com"
          autoComplete="off"
          required
          aria-invalid={state.fieldErrors?.email ? true : undefined}
          aria-describedby="email-hint email-error"
        />
        <p id="email-hint" className="text-sm text-muted-foreground">
          The lead signs in to their site with this address and a generated password.
        </p>
        <FieldError id="email-error" message={state.fieldErrors?.email} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="model">Model</Label>
        <ModelPicker
          id="model"
          name="model"
          models={models}
          defaultValue={state.values?.model || defaultModel}
          invalid={Boolean(state.fieldErrors?.model)}
        />
        <p className="text-sm text-muted-foreground">
          Drives both eve&apos;s design plan and Codex. OpenAI models are Codex&apos;s native fit.
        </p>
        <FieldError id="model-error" message={state.fieldErrors?.model} />
      </div>

      {state.error ? (
        <p role="alert" className="border-l-4 border-destructive pl-3 text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" disabled={pending || !subdomain.ok}>
          {pending ? "Starting the build…" : "Build site"}
        </Button>
        <p className="text-sm text-muted-foreground">
          Takes a few minutes. You can watch every step.
        </p>
      </div>
    </form>
  );
}
