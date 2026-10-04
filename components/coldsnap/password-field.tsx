"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { CopyButton } from "./copy-button";

/** Hidden by default; Frank can reveal it or copy it without revealing. */
export function PasswordField({ password, className }: { password: string; className?: string }) {
  const [revealed, setRevealed] = useState(false);
  const masked = password.replace(/[^-]/g, "•");

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <span
        className="min-w-0 flex-1 truncate font-mono text-lg leading-none tracking-wider text-accent"
        aria-label={revealed ? `Password ${password}` : "Password hidden"}
      >
        {revealed ? password : masked}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-pressed={revealed}
            aria-label={revealed ? "Hide password" : "Show password"}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setRevealed((value) => !value);
            }}
          >
            {revealed ? <EyeOffIcon /> : <EyeIcon />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{revealed ? "Hide password" : "Show password"}</TooltipContent>
      </Tooltip>
      <CopyButton value={password} label="Password" />
    </div>
  );
}
