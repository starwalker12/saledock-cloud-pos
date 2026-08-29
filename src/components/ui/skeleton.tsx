import type { CSSProperties } from "react";

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none animate-pulse select-none rounded-xl bg-slate-200/70 motion-reduce:animate-none dark:bg-slate-800/70 ${className}`}
      style={style}
    />
  );
}
