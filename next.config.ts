import type { NextConfig } from "next";
import { withEve } from "eve/next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  // Packages that ship native or WASM payloads must stay external so Next.js
  // traces their files into the function bundle instead of inlining them.
  serverExternalPackages: [
    "@electric-sql/pglite",
    "@sparticuz/chromium",
    "playwright-core",
  ],
  images: {
    // Preview images live in Vercel Blob; the dev drivers serve them inline.
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
};

// withWorkflow compiles the "use workflow" / "use step" directives in
// `workflows/`; withEve mounts the site-builder agent at /eve/v1/* and deploys
// it as a service in the same Vercel project.
export default withEve(withWorkflow(nextConfig));
