import { DEFAULT_MODEL } from "../config";

/**
 * The models Frank can pick from, sourced from the Vercel AI Gateway catalog.
 *
 * The agent needs tool calling (to drive Codex) and structured output (to
 * report its result), so only language models tagged with both qualify.
 * OpenAI models are flagged as recommended because Codex is built around
 * them; others route through the Gateway's OpenAI-compatible API and may be
 * less reliable inside Codex.
 */
export const GATEWAY_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";

export interface GatewayModel {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly contextWindow: number | null;
  readonly recommended: boolean;
}

interface RawGatewayModel {
  id?: unknown;
  name?: unknown;
  owned_by?: unknown;
  type?: unknown;
  tags?: unknown;
  context_window?: unknown;
}

const REQUIRED_TAGS = ["tool-use", "structured-output"];

export function selectBuildModels(payload: unknown): GatewayModel[] {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  return (data as RawGatewayModel[])
    .filter(
      (model) =>
        typeof model.id === "string" &&
        model.type === "language" &&
        Array.isArray(model.tags) &&
        REQUIRED_TAGS.every((tag) => (model.tags as unknown[]).includes(tag)),
    )
    .map((model) => {
      const id = model.id as string;
      const provider = typeof model.owned_by === "string" ? model.owned_by : id.split("/")[0]!;
      return {
        id,
        name: typeof model.name === "string" && model.name ? model.name : id,
        provider,
        contextWindow: typeof model.context_window === "number" ? model.context_window : null,
        recommended: provider === "openai",
      };
    })
    .sort((a, b) =>
      a.recommended !== b.recommended
        ? a.recommended
          ? -1
          : 1
        : a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name),
    );
}

/** Used when the catalog cannot be fetched (offline development). */
export const FALLBACK_MODELS: readonly GatewayModel[] = [
  { id: DEFAULT_MODEL, name: "GPT-5.5", provider: "openai", contextWindow: null, recommended: true },
  { id: "openai/gpt-5.4-mini", name: "GPT-5.4 mini", provider: "openai", contextWindow: null, recommended: true },
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", provider: "anthropic", contextWindow: null, recommended: false },
];

export async function fetchBuildModels(): Promise<{
  models: readonly GatewayModel[];
  fromCatalog: boolean;
}> {
  try {
    const response = await fetch(GATEWAY_MODELS_URL, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const models = selectBuildModels(await response.json());
    if (models.length === 0) throw new Error("The catalog listed no usable models.");
    return { models, fromCatalog: true };
  } catch {
    return { models: FALLBACK_MODELS, fromCatalog: false };
  }
}
