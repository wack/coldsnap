import { cn } from "@/lib/utils";

/** 9×9 pixel snowflake, drawn on the pixel grid so it stays crisp at any size. */
export function SnowflakeMark({ className }: { className?: string }) {
  const cyan = [
    [4, 0], [4, 1], [4, 2], [4, 3], [4, 5], [4, 6], [4, 7], [4, 8],
    [0, 4], [1, 4], [2, 4], [3, 4], [5, 4], [6, 4], [7, 4], [8, 4],
    [2, 2], [6, 2], [2, 6], [6, 6], [1, 1], [7, 1], [1, 7], [7, 7],
  ];
  return (
    <svg
      viewBox="0 0 9 9"
      aria-hidden="true"
      shapeRendering="crispEdges"
      className={cn("size-6", className)}
    >
      {cyan.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="var(--accent)" />
      ))}
      <rect x="4" y="4" width="1" height="1" fill="var(--primary)" />
      <rect x="3" y="1" width="1" height="1" fill="var(--primary)" />
      <rect x="5" y="7" width="1" height="1" fill="var(--primary)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <SnowflakeMark className="size-7" />
      <span className="font-pixel text-sm tracking-tight text-foreground neon-text sm:text-base">
        cold<span className="text-primary">snap</span>
      </span>
    </span>
  );
}
