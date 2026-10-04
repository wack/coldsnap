import { defineAgent } from "eve";

export default defineAgent({
  model: "zai/glm-5.3-flash",
  // Pinned to the same single provider the chore harness uses, so no request on
  // the default path can be served by Z.ai or Fireworks.
  modelOptions: {
    providerOptions: { gateway: { only: ["digitalocean"] } },
  },
  // This agent only dispatches chores to the Claude Code harness, which brings
  // its own Vercel Sandbox. Dropping bash/read_file/write_file keeps eve from
  // provisioning a second sandbox it would never use.
  defaultTools: false,
  build: {
    // The Claude Code adapter reads its sandbox-bridge files as package-relative
    // assets. Bundling it inlines the JS but leaves those assets behind, so the
    // bootstrap dies on `ENOENT ... /bridge/package.json`. Keeping these packages
    // external preserves normal Node layout in the hosted output.
    externalDependencies: [
      "@ai-sdk/harness",
      "@ai-sdk/harness-claude-code",
      "@ai-sdk/sandbox-vercel",
    ],
  },
});
