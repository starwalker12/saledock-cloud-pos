import React from "react";
import { Search, Info, Plus } from "lucide-react";
import Link from "next/link";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  searchQuery?: string;
  actionHref?: string;
  actionLabel?: string;
  actionOnClick?: () => void;
  resetHref?: string;
  resetLabel?: string;
  type?: "empty" | "search" | "setup" | "error";
}

export function EmptyState({
  title,
  description,
  icon,
  searchQuery,
  actionHref,
  actionLabel,
  actionOnClick,
  resetHref,
  resetLabel = "Clear search filters",
  type = "empty",
}: EmptyStateProps) {
  // Default icon based on type
  const renderIcon = () => {
    if (icon) return icon;
    if (type === "search" || searchQuery) {
      return <Search className="size-8 text-slate-400 dark:text-slate-500" />;
    }
    return <Info className="size-8 text-slate-400 dark:text-slate-500" />;
  };

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center dark:border-slate-800 dark:bg-slate-900/40">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        {renderIcon()}
      </div>

      <h3 className="mt-4 text-base font-black text-slate-900 dark:text-slate-100">
        {searchQuery ? `No results for "${searchQuery}"` : title}
      </h3>

      <p className="mt-2 max-w-sm text-sm text-slate-600 dark:text-slate-400">
        {description || (searchQuery
          ? "We couldn't find matching records. Double-check your spelling or adjust filters."
          : "Get started by adding your first record.")}
      </p>

      {/* Primary Action Button */}
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          <Plus className="size-4" />
          {actionLabel}
        </Link>
      )}

      {/* Action callback */}
      {!actionHref && actionOnClick && actionLabel && (
        <button
          onClick={actionOnClick}
          className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          <Plus className="size-4" />
          {actionLabel}
        </button>
      )}

      {/* Reset search/filters link */}
      {resetHref && (searchQuery || type === "search") && (
        <Link
          href={resetHref}
          className="mt-4 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
        >
          {resetLabel}
        </Link>
      )}
    </div>
  );
}
