import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function AuditLogLoading() {
  return (
    <AppShell pageTitle="Audit Log">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Skeleton className="size-10 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>

      {/* Main card */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {/* Filter toolbar skeleton */}
        <div className="border-b border-slate-100 bg-slate-50/50 p-4">
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>

        {/* Table rows skeleton */}
        <div className="p-4 space-y-4">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-5 w-16 rounded-md" />
                </div>
                <Skeleton className="h-3 w-80 max-w-full" />
              </div>
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
