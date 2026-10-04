import type { ClaudeCodeAuthenticationMode } from "@ai-sdk/harness-claude-code";
import { z } from "zod";

/** AI Gateway's Anthropic-compatible endpoint. Takes no `/v1` suffix. */
const GATEWAY_CLAUDE_CODE_URL = "https://ai-gateway.vercel.sh/claude-code";

/**
 * The only inference provider allowed to serve the chore's model.
 *
 * `only` pins routing rather than merely preferring it, so a DigitalOcean
 * outage fails the run instead of silently falling back to Z.ai, Fireworks, or
 * any of the other providers that also serve this model. That is deliberate:
 * which vendor sees a private repository's source is a decision worth failing
 * loudly over. Switch to `order` if failover ever matters more than pinning.
 */
const INFERENCE_PROVIDER = "digitalocean";

/**
 * One way of paying for a chore's model tokens.
 *
 * The three fields are exactly what differs between the two payment routes.
 * `model` belongs here because a mode determines who pays, and who pays
 * determines which models are purchasable: a Claude subscription cannot buy
 * GLM tokens, and Gateway credits have no reason to buy Claude at list price.
 * Keeping them together means one environment variable can never select an
 * unpayable combination.
 *
 * `auth` reuses the adapter's own `ClaudeCodeAuthenticationMode`, which already
 * abstracts over credential discovery. It covers only the credential
 * environment, though, so it cannot express the model or the request-shaping
 * variables a non-Anthropic model needs. This interface composes it with those.
 */
export interface ColdsnapAuthMode {
  /** Identifies the mode in logs, since nobody watches a cron job run. */
  readonly name: ColdsnapAuthModeName;
  /** Credentials, handed to `createClaudeCode({ auth })`. */
  readonly auth: ClaudeCodeAuthenticationMode;
  /** Extra Claude Code environment variables for this route. */
  readonly env: Readonly<Record<string, string>>;
  /** The gateway model slug this route can actually pay for. */
  readonly model: string;
}

export type ColdsnapAuthModeName = (typeof MODE_NAMES)[number];

const MODE_NAMES = ["gateway-credits", "subscription"] as const;

/** Selected when `COLDSNAP_AUTH_MODE` is unset. */
const DEFAULT_MODE: ColdsnapAuthModeName = "gateway-credits";

/**
 * Pays with AI Gateway credits, running GLM 5.3 Flash on DigitalOcean.
 *
 * Supplying `AI_GATEWAY_API_KEY` in the `auth` record routes the adapter down
 * its `pickGateway()` branch, which derives `ANTHROPIC_API_KEY` and
 * `ANTHROPIC_BASE_URL` from these two variables. That branch returns only the
 * gateway variables and drops `CLAUDE_CODE_OAUTH_TOKEN`, which is correct here
 * and exactly wrong for `subscription` mode below.
 */
function gatewayCredits({ gatewayKey }: { gatewayKey: string }): ColdsnapAuthMode {
  return {
    name: "gateway-credits",
    auth: {
      AI_GATEWAY_API_KEY: gatewayKey,
      AI_GATEWAY_BASE_URL: GATEWAY_CLAUDE_CODE_URL,
    },
    env: {
      /*
       * GLM is not an Anthropic model. Claude Code adds `anthropic-beta`
       * headers and beta tool-schema fields that only Anthropic accepts, and a
       * third-party provider rejects the request rather than ignoring them.
       */
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: "1",
      /*
       * The Agent SDK exposes no provider-routing option, so gateway
       * `providerOptions` travel as a JSON blob merged into every request body.
       */
      CLAUDE_CODE_EXTRA_BODY: JSON.stringify({
        providerOptions: { gateway: { only: [INFERENCE_PROVIDER] } },
      }),
    },
    model: "zai/glm-5.3-flash",
  };
}

/**
 * Pays with the Claude Max subscription, kept for swapping back.
 *
 * The subscription token authorizes the model; it does not authorize the
 * gateway hop that observes and routes the request. Because the `auth` record
 * must stay free of `AI_GATEWAY_API_KEY` — its presence would trigger
 * `pickGateway()` and discard the subscription token — the gateway key travels
 * as a custom header instead. The token itself is brokered: the sandbox process
 * only ever sees a placeholder, which the adapter swaps for the real value at
 * the network boundary.
 */
function subscription({
  gatewayKey,
  oauthToken,
}: {
  gatewayKey: string;
  oauthToken: string;
}): ColdsnapAuthMode {
  return {
    name: "subscription",
    auth: {
      CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
      ANTHROPIC_BASE_URL: GATEWAY_CLAUDE_CODE_URL,
    },
    env: {
      ANTHROPIC_CUSTOM_HEADERS: `x-ai-gateway-api-key: Bearer ${gatewayKey}`,
    },
    model: "anthropic/claude-sonnet-5",
  };
}

const MISSING_OAUTH_TOKEN =
  "COLDSNAP_AUTH_MODE=subscription needs CLAUDE_CODE_OAUTH_TOKEN. Generate one " +
  "with `claude setup-token` and store it in the Vercel project environment.";

/**
 * Validates the environment for the selected mode, then dispatches to it.
 *
 * The discriminated union does both jobs: each branch demands only the
 * credentials its own route needs, so `subscription` mode fails fast on a
 * missing OAuth token while `gateway-credits` mode never mentions one. The
 * transform then narrows on the same discriminant to build the concrete
 * implementor, which is the only thing callers ever see.
 */
const coldsnapAuthModeSchema = z
  .discriminatedUnion("COLDSNAP_AUTH_MODE", [
    z.object({
      COLDSNAP_AUTH_MODE: z.literal("gateway-credits"),
      AI_GATEWAY_API_KEY: z.string().min(1).optional(),
      VERCEL_OIDC_TOKEN: z.string().min(1).optional(),
    }),
    z.object({
      COLDSNAP_AUTH_MODE: z.literal("subscription"),
      AI_GATEWAY_API_KEY: z.string().min(1).optional(),
      VERCEL_OIDC_TOKEN: z.string().min(1).optional(),
      /*
       * The message is attached to both checks on purpose. `.min()` alone only
       * fires once the value is already a string, so an unset variable — the
       * likely failure — would otherwise report Zod's generic type error.
       */
      CLAUDE_CODE_OAUTH_TOKEN: z
        .string({ error: MISSING_OAUTH_TOKEN })
        .min(1, MISSING_OAUTH_TOKEN),
    }),
  ])
  .transform((env, ctx): ColdsnapAuthMode => {
    /*
     * Both modes authenticate the gateway hop, so this requirement is shared
     * rather than per-branch. OIDC is the deployed fallback: Vercel injects it
     * automatically, so a scheduled run needs no manually managed key.
     */
    const gatewayKey = env.AI_GATEWAY_API_KEY ?? env.VERCEL_OIDC_TOKEN;
    if (gatewayKey === undefined) {
      ctx.addIssue({
        code: "custom",
        message:
          "Neither AI_GATEWAY_API_KEY nor VERCEL_OIDC_TOKEN is set, so AI " +
          "Gateway cannot authenticate the request.",
      });
      return z.NEVER;
    }

    return env.COLDSNAP_AUTH_MODE === "subscription"
      ? subscription({ gatewayKey, oauthToken: env.CLAUDE_CODE_OAUTH_TOKEN })
      : gatewayCredits({ gatewayKey });
  });

/**
 * Resolves the chore's authentication mode from the environment.
 *
 * Read per run rather than at module scope: eve evaluates authored modules at
 * build time, where none of these credentials exist.
 */
export function resolveColdsnapAuthMode(
  env: NodeJS.ProcessEnv = process.env,
): ColdsnapAuthMode {
  const parsed = coldsnapAuthModeSchema.safeParse({
    ...env,
    COLDSNAP_AUTH_MODE: env.COLDSNAP_AUTH_MODE ?? DEFAULT_MODE,
  });

  if (!parsed.success) {
    /*
     * Re-thrown as a plain Error: a ZodError's default rendering buries the
     * message a scheduled run's logs need in a nested issue array.
     */
    throw new Error(
      `Invalid chore authentication configuration ` +
        `(COLDSNAP_AUTH_MODE must be one of ${MODE_NAMES.join(", ")}):\n` +
        z.prettifyError(parsed.error),
    );
  }

  return parsed.data;
}
