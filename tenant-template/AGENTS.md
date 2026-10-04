# Coldsnap site

This is a private, single-page-first marketing site built for one sales lead of
a freelance videographer. It is a Next.js 16 App Router app with Tailwind CSS v4
and shadcn/ui, deployed to Vercel.

## Rules

- Keep the App Router layout at the repository root: `app/`, `components/`,
  `lib/`, `public/`. Do not introduce a `src/` directory.
- Do not create `middleware.ts`. Request handling lives in `proxy.ts`.
- These files are managed by Coldsnap and are restored after every build, so
  edits to them are discarded:
  - `proxy.ts`
  - `lib/coldsnap-auth.ts`
  - `app/login/page.tsx`
  - `app/api/coldsnap/login/route.ts`
  - `app/api/coldsnap/logout/route.ts`
  - `app/robots.ts`
- The login page is styled only with the theme tokens in `app/globals.css`
  (`--background`, `--foreground`, `--primary`, …) and the `--font-body` /
  `--font-display-face` font variables set in `app/layout.tsx`. Restyle the site
  by changing those tokens and fonts so the login page matches automatically.
- Use shadcn/ui components from `components/ui/`. Add more with
  `npx shadcn@latest add <component>` when useful.
- Never read, print, or hardcode the `COLDSNAP_SITE_*` environment variables
  outside the managed files above, except `COLDSNAP_SITE_NAME`.
- Assets must be local files in `public/` or inline SVG. Do not hotlink images.
- `npm run build` must pass before you finish.
