import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function ReportsLoading() {
  return (
    <AppShell isLoading pageTitle="Reports">
      {/* Header + date range */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-36" />
        </div>
        <Skeleton className="h-10 w-48 rounded-lg" />
      </div>

      {/* Report cards grid */}
      <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="size-8 rounded-lg" />
            </div>
            <Skeleton className="mt-3 h-3 w-full" />
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <Skeleton className="mt-4 h-9 w-28 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Skeleton className="h-5 w-40" />
        <div className="mt-4 flex items-end gap-2" style={{ height: "160px" }}>
          {[...Array(12)].map((_, i) => (
            <Skeleton
              key={i}
              className="flex-1 rounded-t-md"
              style={{ height: `${[40, 55, 35, 70, 60, 45, 80, 65, 50, 75, 55, 40][i]}%` }}
            />
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          {[...Array(12)].map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
        </div>
      </div>

      {/* Export section */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-2 h-3 w-full" />
            <Skeleton className="mt-4 h-9 w-24 rounded-lg" />
          </div>
        ))}
      </div>
    </AppShell>
  );
}
