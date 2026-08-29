import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function RepairsLoading() {
  return (
    <AppShell isLoading pageTitle="Repairs">
      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="size-6 rounded-lg" />
            </div>
            <Skeleton className="mt-2 h-7 w-16" />
            <Skeleton className="mt-1 h-3 w-28" />
          </div>
        ))}
      </div>

      {/* Status cards */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-lg" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-10" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-10 w-72 rounded-lg" />
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>

      {/* Repairs list container */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 p-4 dark:border-slate-800">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="space-y-4 p-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0 dark:border-slate-800">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-3 w-44" />
                <div className="flex gap-2 pt-1">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </div>
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
