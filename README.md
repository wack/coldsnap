# coldsnap

Coldsnap is Frank's lead-magnet studio. Frank is a freelance videographer; when
he wants to win a lead, he describes the lead and the pitch in a four-field
form, and Coldsnap builds that lead a private website, deploys it to its own
Vercel project, and hands Frank the address and login to send over.

- **Admin panel**: Next.js 16 App Router, Tailwind v4, shadcn/ui, a pixel-art
  cyberpunk theme. Sign in with Vercel, restricted to an allowlist.
- **Site builder**: an [eve](https://eve.dev) agent whose model is the one
  Frank picks in the form. It loads the `frontend-design` skill, writes a
  design plan, and has Codex build the site in a Vercel Sandbox.
- **Pipeline**: Vercel Workflow runs creation and modification as durable,
  retryable steps and records progress Frank watches live.
- **Tenants**: Vercel for Platforms in multi-project mode, one Vercel project
  per lead site, each behind a login page with a 30-day session cookie.

## How a site gets built

```
Frank submits the form (app/actions.ts)
  └─ registerTenant: subdomain from the name, password + cookie secret, DB row
  └─ start(createTenantWorkflow)                      workflows/tenant-workflows.ts
       1 Create Vercel project + env vars             deterministic step
       2 Attach <subdomain>.<root domain>             deterministic step (skipped without a root domain)
       3 Generate site with eve                       agentic: eve session, polled between durable sleeps
           eve agent (model = Frank's pick)
             load_skill frontend-design → design plan → build_site
               Codex (same model + skill) in a Vercel Sandbox
               → restore login gate → next build (one repair pass) → source bundle to Blob
       4 Upload the bundle as a production deployment deterministic step
       5 Wait for Vercel to build it                  polled between durable sleeps
       6 Screenshot the home page (logged in)         best effort, never fails the run
       7 Go live
```

Modifying a site runs steps 3–7 starting from the site's stored source. If
anything fails, the run records which step failed and why; a failed create can
be retried from the card, and a failed modify leaves the previous deployment
serving.

### Where things live

| Path | What it is |
| --- | --- |
| `app/` | Dashboard pages, server actions, Sign in with Vercel routes |
| `components/coldsnap/` | Tenant card, dialogs, model picker, progress views |
| `components/ai-elements/` | AI Elements `ModelSelector` (searchable model picker) |
| `workflows/` | The durable create and modify workflows and their steps |
| `lib/pipeline/operations.ts` | What each workflow step does, testable without the runtime |
| `lib/vercel/` | Multi-project provisioning through `@vercel/sdk` (Platform Elements' Deploy Files pattern) |
| `lib/agent/` | The workflow ↔ agent contract and the eve client |
| `agent/` | The eve site-builder agent: dynamic model, channel auth, `build_site` tool, Codex build |
| `agent/skills/frontend-design/` | Installed with `eve add @skills/anthropics/skills/frontend-design` |
| `tenant-template/` | The Next.js + Tailwind + shadcn starter every site begins from, including its login gate |
| `proxy.ts` | Keeps everyone but Frank out of the dashboard |

`tenant-template/` and the frontend-design skill are embedded as generated
TypeScript modules (`pnpm embed`) because the deployed functions cannot read
the repository from disk. `pnpm embed:check` (and a test) fails if they are
stale.

### Tenant sites

Each site is a separate Vercel project named `<prefix><subdomain>` with SSO
protection turned off; access control is the site's own login page instead.
The project's environment carries `COLDSNAP_SITE_USERNAME` (the lead's email),
`COLDSNAP_SITE_PASSWORD`, `COLDSNAP_SITE_SECRET`, and `COLDSNAP_SITE_NAME`.
`proxy.ts` in the template redirects anyone without a valid signed cookie to
`/login`, and the login handler marks the moment a lead actually signs in
(the hook for the future activation analytics). The auth files are restored
from the template after Codex finishes and again before deploy, so no model
output can remove the gate.

With `COLDSNAP_ROOT_DOMAIN` set, sites answer at `<subdomain>.<root domain>`.
Without it they use the project's `*.vercel.app` production address, because
nested subdomains of Coldsnap's own `*.vercel.app` hostname are not possible.

## Set up a deployment

1. **Project.** Create the Vercel project for this repository (`vercel link`).
   This is a Next.js project that mounts the agent through `withEve` in
   `next.config.ts`, so it builds with the **Next.js** preset. Vercel
   suggests the eve preset on import because `eve` is a dependency; that
   preset expects a standalone agent's `.output` directory and fails.
   `vercel.json` pins the Next.js preset, build command, and output
   directory, overriding the dashboard. During the build, `withEve` adds the
   agent as a separate `eve` service routed at `/eve/v1/*`.
   Use a plan with Fluid compute: the Codex build step runs for several
   minutes inside one function invocation, so the 800-second maximum
   duration bounds it (see `COLDSNAP_CODEX_TIMEOUT_MS` in
   `agent/lib/codex-build.ts`).
2. **Storage.** Add Neon Postgres and a Blob store from the Vercel
   Marketplace; they inject `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN`. The
   table is created on first use.
3. **Platform token.** Create an access token for the team that can create
   projects and deployments, and set `VERCEL_TOKEN` and `VERCEL_TEAM_ID`.
4. **Sign in with Vercel.** Create an app (Team Settings → Apps), add the
   callback `https://<coldsnap-domain>/api/auth/callback`, generate a client
   secret, and set `NEXT_PUBLIC_VERCEL_APP_CLIENT_ID`,
   `VERCEL_APP_CLIENT_SECRET`, `COLDSNAP_SESSION_SECRET`, and
   `COLDSNAP_ADMIN_ALLOWLIST` (Frank's Vercel username or user id).
5. **Root domain (optional).** Add a domain to the team with wildcard DNS
   pointed at Vercel, and set `COLDSNAP_ROOT_DOMAIN`.
6. **Deploy** with `vercel deploy --prod` (or `eve deploy`). AI Gateway and
   Vercel Sandbox authenticate with the project's OIDC token, which must stay
   enabled: the agent's service build prepares a Vercel Sandbox template and
   fails without it.

`.env.example` lists every variable with a note on each.

## Develop locally

Requires Node.js 24 and pnpm.

```bash
pnpm install
COLDSNAP_DRIVERS=memory COLDSNAP_DEV_LOGIN=1 pnpm dev
```

Memory mode replaces Vercel, Blob, the eve agent, and Chromium with in-memory
doubles and uses an in-memory database, so the whole create → watch progress
→ modify → delete flow runs offline. Click **Continue as dev Frank** on the
login page. The fake agent produces a real source bundle from the template,
and the fake Vercel walks deployments through QUEUED → BUILDING → READY.

To work on the agent itself, run `pnpm dev:agent` (the eve terminal UI) with
`AI_GATEWAY_API_KEY` set.

## Test

```bash
pnpm typecheck         # TypeScript across app, workflows, agent, tests
pnpm test              # unit, pipeline, agent-contract, auth, and component tests
pnpm test:workflows    # the real durable workflows, in-process (Workflow SDK Vitest plugin)
pnpm embed:check       # embedded template and skill are up to date
pnpm build             # next build (includes the workflow compiler)
pnpm build:agent --skip-sandbox-prewarm   # eve build; prewarm needs Vercel credentials
```

All tests run against in-memory doubles and PGlite. Nothing in the suite calls
Vercel, Blob, the AI Gateway, or a model.

### Not yet verified against real services

These paths are implemented but could not run without a Vercel project and
credentials, so expect to shake them out on the first deployment:

- `SdkVercelPlatform` (project creation, env vars, domains, deployments) and
  `BlobObjectStore`.
- The eve agent end to end: dynamic model selection through the channel,
  `build_site` driving Codex in a Vercel Sandbox, the sandbox snapshot
  bootstrap, and AI Gateway auth for non-OpenAI models inside Codex.
- `withEve` + `withWorkflow` together in a Vercel deployment, and the
  workflow reaching the agent over same-project OIDC.
- Sign in with Vercel against a real app (the flow, PKCE, and ID-token checks
  are unit-tested with a local key).
- Chromium screenshots via `@sparticuz/chromium` in a function.

The tenant template itself was built with `next build` and its login gate
exercised end to end with `next start`.

## Known limits

- Codex is built around OpenAI models. The picker lists every Gateway model
  with tool use and structured output, with OpenAI models recommended; others
  may struggle inside Codex.
- The Codex step runs in a single function invocation, bounded by the
  function's maximum duration.
- Deleting a site while its build is mid-step cancels the workflow, but a step
  already in flight can finish; delete again if a project reappears.

## Future work

From the brief: notify Frank when a lead first signs in (the login handler is
the hook), deeper analytics such as heatmaps, and emailing the lead their
address and credentials through Resend once the site is live.
