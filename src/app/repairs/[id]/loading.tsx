import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function RepairDetailLoading() {
  return (
    <AppShell pageTitle="Loading Repair Job...">
      {/* Search Header */}
      <div className="mb-4">
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="space-y-2">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column Skeletons */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <Skeleton className="h-5 w-44" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-24 w-full sm:col-span-2" />
            </div>
          </div>

          {/* Card 2 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <Skeleton className="h-5 w-44" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        </div>

        {/* Right Column Skeletons */}
        <div className="space-y-6">
          {/* Card 1 */}
          <div className="rounded-2xl border border-slate-200 bg-slate-900 p-5 space-y-4">
            <Skeleton className="h-5 w-32 bg-slate-800" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full bg-slate-800" />
              <Skeleton className="h-4 w-full bg-slate-800" />
              <Skeleton className="h-8 w-2/3 bg-slate-800" />
            </div>
          </div>

          {/* Card 2 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
