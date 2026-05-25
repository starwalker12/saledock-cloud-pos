import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function RepairsLoading() {
  return (
    <AppShell pageTitle="Repairs">
      {/* Search Filter Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-10 w-24" />
      </div>

      {/* Repairs list container */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 p-4">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="p-4 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
              <div className="space-y-1.5">
                <Skeleton className="h-4.5 w-64" />
                <Skeleton className="h-3 w-44" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
