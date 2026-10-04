import { progressFraction, type ProgressStep, type TenantProgress } from "@/lib/tenants/model";
import { cn } from "@/lib/utils";

const MARK: Record<ProgressStep["state"], { glyph: string; className: string; label: string }> = {
  pending: { glyph: "□", className: "text-muted-foreground", label: "Waiting" },
  running: { glyph: "▶", className: "text-accent", label: "In progress" },
  done: { glyph: "■", className: "text-success", label: "Done" },
  skipped: { glyph: "–", className: "text-muted-foreground", label: "Skipped" },
  failed: { glyph: "✕", className: "text-destructive", label: "Failed" },
};

/** A pixel meter made of discrete blocks, one per step. */
export function ProgressMeter({ progress, className }: { progress: TenantProgress; className?: string }) {
  const percent = Math.round(progressFraction(progress) * 100);
  return (
    <div
      role="progressbar"
      aria-label="Build progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("flex gap-1", className)}
    >
      {progress.steps.map((step) => (
        <span
          key={step.id}
          className={cn(
            "h-3 flex-1 border-2",
            step.state === "done" || step.state === "skipped"
              ? "border-success bg-success"
              : step.state === "running"
                ? "march border-accent"
                : step.state === "failed"
                  ? "border-destructive bg-destructive"
                  : "border-border bg-background",
          )}
        />
      ))}
    </div>
  );
}

export function ProgressSteps({
  progress,
  compact = false,
  className,
}: {
  progress: TenantProgress;
  /** Card view: only the step that is running (or failed) shows its detail. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <ol className={cn("space-y-1.5", className)}>
      {progress.steps.map((step) => {
        const mark = MARK[step.state];
        const showDetail = step.detail && (!compact || step.state === "running" || step.state === "failed");
        return (
          <li key={step.id} className="grid grid-cols-[1.25rem_1fr] gap-x-2">
            <span
              aria-label={mark.label}
              className={cn("font-mono text-lg leading-6", mark.className, step.state === "running" && "blink")}
            >
              {mark.glyph}
            </span>
            <span className={cn("leading-6", step.state === "pending" && "text-muted-foreground")}>
              {step.label}
            </span>
            {showDetail ? (
              <span
                className={cn(
                  "col-start-2 font-mono text-base leading-5 break-words",
                  step.state === "failed" ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {step.detail}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
