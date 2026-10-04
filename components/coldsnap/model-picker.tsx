"use client";

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useMemo, useState } from "react";

import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { Button } from "@/components/ui/button";
import type { GatewayModel } from "@/lib/models/gateway";

/**
 * Every search word must appear in the model's name or id. cmdk's default
 * fuzzy scoring matches scattered letters, which ranks unrelated model ids
 * above the one Frank typed.
 */
function matchModel(value: string, search: string): number {
  const haystack = value.toLowerCase();
  return search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word))
    ? 1
    : 0;
}

/** Provider logos come from models.dev; hide one quietly if it cannot load. */
function hideBrokenLogo(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.style.visibility = "hidden";
}

/**
 * Searchable model picker (AI Elements' ModelSelector) over the AI Gateway
 * catalog. Submits the chosen Gateway model id through a hidden input.
 */
export function ModelPicker({
  id,
  name,
  models,
  defaultValue,
  invalid,
}: {
  id: string;
  name: string;
  models: readonly GatewayModel[];
  defaultValue: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const selected = models.find((model) => model.id === value);

  const groups = useMemo(() => {
    const recommended = models.filter((model) => model.recommended);
    const byProvider = new Map<string, GatewayModel[]>();
    for (const model of models.filter((candidate) => !candidate.recommended)) {
      byProvider.set(model.provider, [...(byProvider.get(model.provider) ?? []), model]);
    }
    return [
      { heading: "Recommended for Codex", models: recommended },
      ...[...byProvider].map(([provider, list]) => ({ heading: provider, models: list })),
    ].filter((group) => group.models.length > 0);
  }, [models]);

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <ModelSelector open={open} onOpenChange={setOpen}>
        <ModelSelectorTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={invalid || undefined}
            className="h-10 w-full justify-between px-3 font-sans text-base"
          >
            <span className="flex min-w-0 items-center gap-2">
              {selected ? <ModelSelectorLogo provider={selected.provider} className="size-4 invert" onError={hideBrokenLogo} /> : null}
              <span className="truncate">{selected?.name ?? value}</span>
              <span className="truncate font-mono text-base text-muted-foreground">{value}</span>
            </span>
            <ChevronsUpDownIcon className="opacity-60" />
          </Button>
        </ModelSelectorTrigger>
        <ModelSelectorContent title="Choose a model" className="sm:max-w-xl" filter={matchModel}>
          <ModelSelectorInput placeholder="Search models" />
          <ModelSelectorList className="max-h-96">
            <ModelSelectorEmpty>No model matches that search.</ModelSelectorEmpty>
            {groups.map((group) => (
              <ModelSelectorGroup key={group.heading} heading={group.heading}>
                {group.models.map((model) => (
                  <ModelSelectorItem
                    key={model.id}
                    value={`${model.name} ${model.id}`}
                    onSelect={() => {
                      setValue(model.id);
                      setOpen(false);
                    }}
                  >
                    <ModelSelectorLogo provider={model.provider} className="size-4 invert" onError={hideBrokenLogo} />
                    <ModelSelectorName>{model.name}</ModelSelectorName>
                    <span className="font-mono text-base text-muted-foreground">{model.id}</span>
                    {model.id === value ? <CheckIcon className="text-success" /> : null}
                  </ModelSelectorItem>
                ))}
              </ModelSelectorGroup>
            ))}
          </ModelSelectorList>
        </ModelSelectorContent>
      </ModelSelector>
    </>
  );
}
