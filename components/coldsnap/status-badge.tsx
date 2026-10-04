import { Badge } from "@/components/ui/badge";
import type { TenantStatus } from "@/lib/tenants/model";
import { cn } from "@/lib/utils";

const STATUS: Record<TenantStatus, { label: string; className: string }> = {
  live: { label: "Live", className: "border-success bg-success text-black" },
  creating: { label: "Building", className: "border-accent bg-accent text-accent-foreground" },
  updating: { label: "Updating", className: "border-accent bg-accent text-accent-foreground" },
  failed: { label: "Failed", className: "border-destructive bg-destructive text-black" },
  deleting: { label: "Deleting", className: "border-warning bg-warning text-black" },
};

export function StatusBadge({ status, className }: { status: TenantStatus; className?: string }) {
  const { label, className: tone } = STATUS[status];
  const busy = status === "creating" || status === "updating" || status === "deleting";
  return (
    <Badge className={cn("shadow-pixel-sm", tone, className)}>
      {busy ? <span aria-hidden className="blink">▶</span> : null}
      {label}
    </Badge>
  );
}
