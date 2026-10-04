/**
 * Coldsnap access control for this site. Managed by Coldsnap: do not edit.
 *
 * Styled only with the theme tokens from app/globals.css, so it picks up the
 * site's palette and fonts automatically.
 */
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOGIN_ACTION_PATH, safeNextPath } from "@/lib/coldsnap-auth";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const siteName = process.env.COLDSNAP_SITE_NAME ?? "this site";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-16 text-foreground">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to {siteName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This site was prepared just for you. Sign in with the email address it was sent to
          and the password you received.
        </p>

        <form method="post" action={LOGIN_ACTION_PATH} className="mt-8 space-y-5">
          <input type="hidden" name="next" value={safeNextPath(next)} />
          <div className="space-y-2">
            <Label htmlFor="username">Email</Label>
            <Input
              id="username"
              name="username"
              type="email"
              autoComplete="username"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              That email and password don&apos;t match. Check the message you received and try
              again.
            </p>
          ) : null}
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </main>
  );
}
