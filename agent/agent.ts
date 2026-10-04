import { defineAgent, defineDynamic } from "eve";

import { resolveSessionModel } from "../lib/agent/job";
import { DEFAULT_MODEL } from "../lib/config";

export default defineAgent({
  // Frank picks the model per site in the Coldsnap form. The workflow sends
  // it in a header, the eve channel copies it into the session's auth
  // attributes (channels/eve.ts), and it is resolved once per session so the
  // prompt cache stays warm. The build tool hands the same model to Codex.
  model: defineDynamic({
    events: {
      "session.started": (_event, ctx) =>
        resolveSessionModel(ctx.session.auth.initiator?.attributes, DEFAULT_MODEL),
    },
  }),
  // The agent plans the design and delegates all coding to Codex, which runs
  // in its own Vercel Sandbox (lib/codex-build.ts). Without bash/read/write,
  // eve never provisions a second sandbox it would not use.
  defaultTools: false,
  limits: {
    // One session is one build; a runaway session should stop well before this.
    maxTokenCostUsdPerSession: 20,
    sessionTimeoutMs: 24 * 60 * 60 * 1_000,
  },
  build: {
    // The Codex adapter reads its sandbox-bridge files as package-relative
    // assets. Bundling inlines the JS but leaves those assets behind, so keep
    // these packages external in the hosted output.
    externalDependencies: [
      "@ai-sdk/harness",
      "@ai-sdk/harness-codex",
      "@ai-sdk/sandbox-vercel",
      // Loaded only when DATABASE_URL is unset; its WASM payload must stay
      // next to the package rather than be inlined.
      "@electric-sql/pglite",
    ],
  },
});
