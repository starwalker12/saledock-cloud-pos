import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function CustomerDetailLoading() {
  return (
    <AppShell pageTitle="Customer Details">
      <div className="mb-4">
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Left Side: Profile & Balance Summary */}
        <div className="space-y-6">
          {/* Profile Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-3.5 w-32" />
            </div>
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>

          {/* Balance Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-10 w-full rounded-md mt-2" />
          </div>
        </div>

        {/* Right Side: Ledger & Invoice History tabs */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          {/* Tab buttons */}
          <div className="flex gap-2 border-b border-slate-200 pb-2">
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>

          {/* Table list */}
          <div className="space-y-4 pt-2">
            <div className="flex justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-24" />
            </div>
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                  <div className="space-y-1">
                    <Skeleton className="h-4.5 w-56" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
