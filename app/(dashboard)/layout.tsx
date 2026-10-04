import { LogOutIcon, PlusIcon } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/coldsnap/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { requireAdmin } from "@/lib/auth/current-admin";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b-2 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Coldsnap dashboard">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            <Button asChild size="sm">
              <Link href="/tenants/new">
                <PlusIcon /> New site
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account">
                  <Avatar className="size-8 rounded-none border-2 border-accent">
                    {admin.picture ? <AvatarImage src={admin.picture} alt="" /> : null}
                    <AvatarFallback className="rounded-none bg-secondary font-pixel text-[0.6rem]">
                      {admin.name.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <span className="block truncate">{admin.name}</span>
                  {admin.email ? (
                    <span className="block truncate font-mono text-base text-muted-foreground">{admin.email}</span>
                  ) : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <form method="post" action="/api/auth/signout">
                  <DropdownMenuItem asChild>
                    <button type="submit" className="w-full">
                      <LogOutIcon /> Sign out
                    </button>
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
