import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <AppShell pageTitle="Dashboard">
      {/* Welcome banner skeleton */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 space-y-2">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Row 1 Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex justify-between items-center">
              <Skeleton className="h-4.5 w-28" />
              <Skeleton className="size-5 rounded-md" />
            </div>
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3.5 w-full" />
          </div>
        ))}
      </div>

      {/* Row 2 Stats Grid */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex justify-between items-center">
              <Skeleton className="h-4.5 w-28" />
              <Skeleton className="size-5 rounded-md" />
            </div>
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-3.5 w-full" />
          </div>
        ))}
      </div>

      {/* Row 3 Cards */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-4.5 w-full" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <Skeleton className="h-5 w-24" />
          <div className="grid gap-3 sm:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
