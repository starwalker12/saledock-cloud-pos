import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function AuditLogLoading() {
  return (
    <AppShell isLoading pageTitle="Audit Log">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      {/* Main card */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {/* Filter toolbar */}
        <div className="border-b border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-white/[0.03]">
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-9 w-56 rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-20 rounded-lg" />
          </div>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-4 gap-4 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-16 justify-self-end" />
        </div>

        {/* Table rows */}
        <div className="space-y-1 p-4">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-4 gap-4 border-b border-slate-100 py-2 last:border-0 dark:border-slate-800"
            >
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-16 rounded-md" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-14 justify-self-end rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
