import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function ReturnsLoading() {
  return (
    <AppShell isLoading pageTitle="Returns">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="hidden md:block">
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-6 gap-4 border-b border-slate-100 pb-2 dark:border-slate-800">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16 justify-self-end" />
              <Skeleton className="h-3 w-16 justify-self-end" />
              <Skeleton className="h-3 w-16" />
            </div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="grid grid-cols-6 gap-4 border-b border-slate-100 py-3 last:border-0 dark:border-slate-800">
                <Skeleton className="h-4 w-24 font-mono" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16 justify-self-end" />
                <Skeleton className="h-4 w-16 justify-self-end" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>

        {/* Mobile card skeleton */}
        <div className="space-y-3 p-4 md:hidden">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-100 p-4 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="mt-3 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
