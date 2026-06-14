import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";

export function SortableHeader({
  label,
  columnKey,
  currentSortKey,
  direction,
  currentParams = {},
  align = "left",
  className = "",
}: {
  label: string;
  columnKey: string;
  currentSortKey?: string;
  direction?: "asc" | "desc";
  currentParams?: Record<string, string | number | boolean | undefined | string[]>;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const isSorted = currentSortKey === columnKey;
  const nextDir = isSorted && direction === "asc" ? "desc" : "asc";

  // Build new search parameters, maintaining any existing filters/tabs
  const newParams = new URLSearchParams();
  Object.entries(currentParams).forEach(([k, v]) => {
    if (v != null && v !== "") {
      newParams.set(k, String(v));
    }
  });
  newParams.set("sort", columnKey);
  newParams.set("dir", nextDir);

  const href = `?${newParams.toString()}`;
  const alignClass =
    align === "right"
      ? "justify-end text-right"
      : align === "center"
      ? "justify-center text-center"
      : "justify-start text-left";

  const ariaLabel = isSorted
    ? `Sort by ${label} ${nextDir === "asc" ? "ascending" : "descending"}`
    : `Sort by ${label} ascending`;

  return (
    <th className={`${className} p-0 select-none border-b border-slate-200 dark:border-white/[0.07]`}>
      <Link
        href={href}
        aria-label={ariaLabel}
        className={`flex items-center gap-1 px-4 py-3 font-bold uppercase transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.04] cursor-pointer w-full ${alignClass}`}
      >
        <span>{label}</span>
        {isSorted ? (
          direction === "asc" ? (
            <ArrowUp className="size-3.5 shrink-0 text-blue-700 dark:text-blue-400" />
          ) : (
            <ArrowDown className="size-3.5 shrink-0 text-blue-700 dark:text-blue-400" />
          )
        ) : (
          <span className="size-3.5 shrink-0 opacity-20 group-hover:opacity-100 transition-opacity">
            {/* Very subtle neutral indicator */}
          </span>
        )}
      </Link>
    </th>
  );
}
