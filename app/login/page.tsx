import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SnowflakeMark } from "@/components/coldsnap/logo";
import { Button } from "@/components/ui/button";
import { getAdmin } from "@/lib/auth/current-admin";
import { devLoginEnabled, sessionSecretConfigured } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  "not-allowed": "That Vercel account is not on Coldsnap's allowlist.",
  denied: "Sign in was cancelled on Vercel.",
  expired: "The sign-in attempt expired. Start again.",
  failed: "Vercel sign-in did not complete. Try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getAdmin()) redirect("/");
  const { error } = await searchParams;
  const oauthConfigured = Boolean(
    process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID && process.env.VERCEL_APP_CLIENT_SECRET,
  );
  const ready = oauthConfigured && sessionSecretConfigured();

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-16">
      <section className="w-full max-w-md border-2 border-primary bg-card p-8 shadow-[8px_8px_0_0_#000] pixel-corners">
        <div className="flex items-center gap-4">
          <SnowflakeMark className="size-12" />
          <div>
            <h1 className="font-pixel text-lg leading-8 neon-text">
              cold<span className="text-primary">snap</span>
            </h1>
            <p className="font-mono text-lg leading-5 text-accent">lead sites, built by eve</p>
          </div>
        </div>

        <p className="mt-8 text-base text-muted-foreground">
          Frank&apos;s control room. Sign in with the Vercel account on the allowlist.
        </p>

        {error && ERRORS[error] ? (
          <p role="alert" className="mt-6 border-l-4 border-destructive pl-3 text-destructive">
            {ERRORS[error]}
          </p>
        ) : null}

        <div className="mt-8 grid gap-4">
          {ready ? (
            <Button asChild size="lg" className="w-full">
              <a href="/api/auth/authorize">
                <VercelMark /> Sign in with Vercel
              </a>
            </Button>
          ) : (
            <p className="border-2 border-warning p-3 text-sm text-warning">
              Sign in with Vercel is not configured. Set NEXT_PUBLIC_VERCEL_APP_CLIENT_ID,
              VERCEL_APP_CLIENT_SECRET, and COLDSNAP_SESSION_SECRET (see README.md).
            </p>
          )}

          {devLoginEnabled() ? (
            <form method="post" action="/api/auth/dev-login">
              <Button type="submit" variant="outline" className="w-full">
                Continue as dev Frank (local only)
              </Button>
            </form>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function VercelMark() {
  return (
    <svg viewBox="0 0 76 65" aria-hidden className="size-4" fill="currentColor">
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  );
}
