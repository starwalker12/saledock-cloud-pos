import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <AppShell pageTitle="Dashboard">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/[0.07] dark:bg-[#060f20]">
        {/* Browser-style chrome bar */}
        <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          <Skeleton className="ml-2 h-4 w-40 rounded-md" />
        </div>

        <div className="flex">
          {/* Sidebar rail skeleton */}
          <div className="hidden border-r border-slate-100 p-2 dark:border-white/[0.06] sm:flex sm:flex-col sm:gap-1">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-8 rounded-lg" />
            ))}
          </div>

          <div className="min-w-0 flex-1 p-3.5 sm:p-5">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <div className="space-y-1">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="hidden h-9 w-24 rounded-xl sm:block" />
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-2.5 w-20" />
                    <Skeleton className="size-1.5 rounded-full" />
                  </div>
                  <Skeleton className="mt-2 h-4 w-16" />
                  <Skeleton className="mt-1 h-2.5 w-24" />
                </div>
              ))}
            </div>

            {/* Activity + weekly chart */}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 lg:grid-cols-[1fr_180px]">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-2.5 w-24" />
                  <Skeleton className="h-2.5 w-12" />
                </div>
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/30 p-2.5 dark:border-white/[0.05] dark:bg-white/[0.02]"
                  >
                    <Skeleton className="h-6 w-6 shrink-0 rounded-md" />
                    <Skeleton className="h-3 flex-1" />
                    <Skeleton className="h-3 w-16 shrink-0" />
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <Skeleton className="mb-2 h-2.5 w-20" />
                <div className="flex items-end gap-0.5" style={{ height: "52px" }}>
                  {[...Array(7)].map((_, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex h-[44px] w-full items-end">
                        <Skeleton className="w-full rounded-t-sm" style={{ height: `${[30, 55, 40, 80, 60, 45, 35][i]}%` }} />
                      </div>
                      <Skeleton className="h-1.5 w-2" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom summary grid */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="mt-1.5 h-4 w-14" />
                  <Skeleton className="mt-0.5 h-2.5 w-20" />
                </div>
              ))}
            </div>

            {/* Bottom links */}
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-6 w-20 rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
