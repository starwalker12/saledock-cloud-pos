import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function CustomersLoading() {
  return (
    <AppShell pageTitle="Customers">
      {/* Stat cards skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex justify-between items-center">
              <Skeleton className="h-4.5 w-24" />
              <Skeleton className="size-5 rounded-md" />
            </div>
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3.5 w-full" />
          </div>
        ))}
      </div>

      {/* Main body: Filter row + Customer list */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_350px]">
        {/* Left side: Search filter + Table */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-10 flex-1 min-w-[200px]" />
            <Skeleton className="h-10 w-28" />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 p-4">
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="p-4 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4.5 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <div className="flex gap-4">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right side: Add customer block */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 self-start">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4.5 w-full" />
          <div className="space-y-3 pt-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
          <Skeleton className="h-10 w-full rounded-md mt-2" />
        </div>
      </div>
    </AppShell>
  );
}
